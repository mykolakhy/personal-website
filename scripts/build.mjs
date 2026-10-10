import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, unlink, readdir } from 'node:fs/promises';
import { resolve, dirname, parse, relative } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { publicFiles, securityHeaders } from './public-files.mjs';
import { languages, pages, pageTemplateFiles, translationFiles, generatedPages, readCatalogs, renderPage, renderNotFound, escapeHTML } from './i18n.mjs';
import { githubStatsFiles, validateSnapshot, latestSnapshot } from './github-data.mjs';
import { aiStatsFiles, validateAISnapshot, latestAISnapshot } from './ai-data.mjs';
import { claudeStatsFiles, validateClaudeSnapshot, latestClaudeSnapshot } from './claude-data.mjs';

const root = resolve(import.meta.dirname, '..');
// macOS exposes these OS-owned aliases even for paths returned by tmpdir().
// Do not resolve arbitrary ancestors: that would hide an attacker-created link.
async function outputPath(destination) {
  let path = resolve(destination);
  if (process.platform === 'darwin') {
    for (const alias of ['/tmp', '/var']) {
      if ((path === alias || path.startsWith(alias + '/')) && await realpath(alias) === '/private' + alias) {
        path = '/private' + path;
      }
    }
  }
  return path;
}
async function safeOutputDirectory(directory) {
  const parent = dirname(directory);
  if (parent !== directory) await safeOutputDirectory(parent);
  try {
    const entry = await lstat(directory);
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('Unsafe build destination: expected directories without symbolic links.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function writeOutput(target, bytes) {
  await safeOutputDirectory(dirname(target));
  await mkdir(dirname(target), { recursive: true });
  const temporary = resolve(dirname(target), `.build-${randomUUID()}.tmp`);
  let handle, created = false;
  try {
    handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644);
    created = true;
    await handle.writeFile(bytes); await handle.close(); handle = null;
    await safeOutputDirectory(dirname(target));
    await rename(temporary, target);
  } finally { await handle?.close(); if (created) await unlink(temporary).catch(() => {}); }
}
export async function publicSourceBytes(files = [...publicFiles, ...pageTemplateFiles, ...translationFiles, ...githubStatsFiles, ...aiStatsFiles, ...claudeStatsFiles]) {
  const sourceRoot = await realpath(root);
  const sources = new Map();
  // Validate and snapshot all sources before touching output. Never reopen them
  // while publishing: a source replaced by a symlink must not change the bytes.
  for (const file of files) {
    const source = resolve(sourceRoot, file);
    let handle;
    try {
      if (!(await lstat(source)).isFile() || await realpath(source) !== source) {
        throw new Error('Expected a regular file without symbolic links.');
      }
      handle = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
      if (!(await handle.stat()).isFile()) throw new Error('Expected a regular file.');
      sources.set(file, await handle.readFile());
    } catch (cause) {
      throw new Error(`Unsafe public source: ${file}. Use a regular file without symbolic links.`, { cause });
    } finally {
      await handle?.close();
    }
  }
  return sources;
}
export function productionURL(value) {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || /^(localhost|127\.|\[::1\])/.test(url.hostname)) {
    throw new Error('SITE_URL must be a public HTTPS URL without credentials, query or fragment.');
  }
  url.pathname = url.pathname.replace(/\/?$/, '/');
  return url;
}
export async function build({ destination = resolve(root, 'dist'), siteURL = process.env.SITE_URL, refreshGithub = false, refreshAI = false } = {}) {
  destination = await outputPath(destination);
  if (destination === parse(destination).root) throw new Error('Unsafe build destination: filesystem root.');
  await safeOutputDirectory(destination);
  const base = productionURL(siteURL);
  const sources = await publicSourceBytes();
  const template = sources.get('index.html').toString('utf8');
  const catalogs = readCatalogs(template, sources);
  const savedGithub = validateSnapshot(JSON.parse(sources.get(githubStatsFiles[0]).toString('utf8')));
  const github = refreshGithub ? await latestSnapshot(savedGithub) : savedGithub;
  const savedAI = validateAISnapshot(JSON.parse(sources.get(aiStatsFiles[0]).toString('utf8')));
  const ai = refreshAI ? await latestAISnapshot(savedAI) : savedAI;
  const savedClaude = validateClaudeSnapshot(JSON.parse(sources.get(claudeStatsFiles[0]).toString('utf8')));
  const claude = refreshAI ? await latestClaudeSnapshot(savedClaude) : savedClaude;
  const rendered = new Map();
  const scriptHashes = [];
  for (const { code, path } of languages) {
    for (const page of pages) {
      let html = renderPage(template, code, catalogs.get(code), github, ai, { page: page.key, sources, claudeSnapshot: claude });
      if (base) {
        const canonical = new URL(path + page.path, base).href;
        const image = new URL('assets/social-preview.png', base).href;
        const structured = JSON.stringify({
          '@context': 'https://schema.org', '@type': page.key === 'home' ? 'ProfilePage' : 'WebPage', url: canonical, inLanguage: code,
          mainEntity: { '@type': 'Person', name: 'Mykola Khytra', jobTitle: 'Senior QA Engineer',
            url: canonical, image: new URL('assets/portrait-640.jpg', base).href,
            sameAs: ['https://www.linkedin.com/in/mykola-khytra/', 'https://github.com/mykolakhy'] },
        }).replaceAll('<', '\\u003c');
        scriptHashes.push('sha256-' + createHash('sha256').update(structured).digest('base64'));
        const alternates = [...languages, { code: 'x-default', path: '' }].map((language) =>
          `  <link rel="alternate" hreflang="${language.code}" href="${escapeHTML(new URL(language.path + page.path, base).href)}" />`).join('\n');
        html = html.replace(/(property="og:image" content=")[^"]+/, '$1' + escapeHTML(image))
          .replace('</head>', `  <link rel="canonical" href="${escapeHTML(canonical)}" />\n${alternates}\n  <meta property="og:url" content="${escapeHTML(canonical)}" />\n  <script type="application/ld+json">${structured}</script>\n</head>`);
      } else {
        html = html.replace('</head>', '  <meta name="robots" content="noindex, nofollow" />\n</head>');
      }
      rendered.set(`${path}${page.path}index.html`, html);
    }
    rendered.set(`${path}404.html`, renderNotFound(code, catalogs.get(code), base?.pathname ?? '/'));
  }
  await safeOutputDirectory(destination);
  await mkdir(destination, { recursive: true });
  // Preserve unexpected user files, but refuse to label that directory publishable.
  const approved = new Set([...publicFiles, ...generatedPages, 'robots.txt', 'sitemap.xml', '_headers']);
  const existing = await readdir(destination, { recursive: true, withFileTypes: true });
  for (const entry of existing.filter((entry) => !entry.isDirectory())) {
    const file = relative(destination, resolve(entry.parentPath, entry.name));
    const metadata = await lstat(resolve(destination, file));
    if (!approved.has(file) || !metadata.isFile() || metadata.nlink !== 1) throw new Error(`Unexpected build output: ${file}. Move it out of dist before building.`);
  }
  // Validate every planned path before writing, including directories occupying
  // a file's name. Keep an existing build untouched on validation failures.
  for (const file of approved) {
    const target = resolve(destination, file);
    await safeOutputDirectory(dirname(target));
    try { if (!(await lstat(target)).isFile()) throw new Error(`Unexpected build output: ${file}.`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const file of new Set([...publicFiles, ...generatedPages])) {
    const target = resolve(destination, file);
    await writeOutput(target, rendered.get(file) ?? sources.get(file));
  }
  await writeOutput(resolve(destination, 'robots.txt'), base ? `User-agent: *\nAllow: /\nSitemap: ${new URL('sitemap.xml', base).href}\n` : 'User-agent: *\nDisallow: /\n');
  await writeOutput(resolve(destination, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${base ? languages.flatMap(({ path }) => pages.map(page => `<url><loc>${escapeHTML(new URL(path + page.path, base).href)}</loc></url>`)).join('') : ''}</urlset>\n`);
  const webAnalytics = base?.href === 'https://mykolakhytra.com/';
  const headers = { ...securityHeaders(scriptHashes, { webAnalytics }), ...(!base ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}) };
  // Host-scoped rollout: never impose HSTS on previews, localhost or subdomains.
  const hsts = base?.href === 'https://mykolakhytra.com/' ? '\nhttps://mykolakhytra.com/*\n  Strict-Transport-Security: max-age=300\n' : '';
  await writeOutput(resolve(destination, '_headers'), `/*\n${Object.entries(headers).map(([key, value]) => `  ${key}: ${value}`).join('\n')}\n  Cache-Control: public, max-age=0, must-revalidate\n${hsts}`);
  return { destination, production: Boolean(base), files: approved.size };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await build();
  console.log(`Built ${result.files} allowlisted files in dist. ${result.production ? 'Production URL configured.' : 'Preview only: set SITE_URL before public deployment.'}`);
}
