import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, writeFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { publicFiles, securityHeaders } from './public-files.mjs';
import { languages, pages, pageTemplateFiles, translationFiles, generatedPages, readCatalogs, renderPage, renderNotFound, escapeHTML } from './i18n.mjs';
import { githubStatsFiles, validateSnapshot, latestSnapshot } from './github-data.mjs';
import { aiStatsFiles, validateAISnapshot, latestAISnapshot } from './ai-data.mjs';
import { claudeStatsFiles, validateClaudeSnapshot, latestClaudeSnapshot } from './claude-data.mjs';

const root = resolve(import.meta.dirname, '..');
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
  await mkdir(destination, { recursive: true });
  // Preserve unexpected user files, but refuse to label that directory publishable.
  const approved = new Set([...publicFiles, ...generatedPages, 'robots.txt', 'sitemap.xml', '_headers']);
  const existing = await readdir(destination, { recursive: true, withFileTypes: true });
  for (const entry of existing.filter((entry) => !entry.isDirectory())) {
    const relative = resolve(entry.parentPath, entry.name).slice(destination.length + 1);
    if (!approved.has(relative) || entry.isSymbolicLink()) throw new Error(`Unexpected build output: ${relative}. Move it out of dist before building.`);
  }
  for (const file of new Set([...publicFiles, ...generatedPages])) {
    const target = resolve(destination, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, rendered.get(file) ?? sources.get(file));
  }
  await writeFile(resolve(destination, 'robots.txt'), base ? `User-agent: *\nAllow: /\nSitemap: ${new URL('sitemap.xml', base).href}\n` : 'User-agent: *\nDisallow: /\n');
  await writeFile(resolve(destination, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${base ? languages.flatMap(({ path }) => pages.map(page => `<url><loc>${escapeHTML(new URL(path + page.path, base).href)}</loc></url>`)).join('') : ''}</urlset>\n`);
  const headers = { ...securityHeaders(scriptHashes), ...(!base ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}) };
  await writeFile(resolve(destination, '_headers'), `/*\n${Object.entries(headers).map(([key, value]) => `  ${key}: ${value}`).join('\n')}\n  Cache-Control: public, max-age=0, must-revalidate\n`);
  return { destination, production: Boolean(base), files: approved.size };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await build();
  console.log(`Built ${result.files} allowlisted files in dist. ${result.production ? 'Production URL configured.' : 'Preview only: set SITE_URL before public deployment.'}`);
}
