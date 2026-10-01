import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, writeFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { publicFiles, securityHeaders } from './public-files.mjs';

const root = resolve(import.meta.dirname, '..');
async function publicSourceBytes() {
  const sourceRoot = await realpath(root);
  const sources = new Map();
  // Validate and snapshot all sources before touching output. Never reopen them
  // while publishing: a source replaced by a symlink must not change the bytes.
  for (const file of publicFiles) {
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
export async function build({ destination = resolve(root, 'dist'), siteURL = process.env.SITE_URL } = {}) {
  const base = productionURL(siteURL);
  const sources = await publicSourceBytes();
  const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  let html = sources.get('index.html').toString('utf8');
  let scriptHash;
  if (base) {
    const canonical = base.href;
    const image = new URL('assets/social-preview.png', base).href;
    const structured = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'ProfilePage', url: canonical,
      mainEntity: { '@type': 'Person', name: 'Mykola Khytra', jobTitle: 'Senior QA Engineer',
        url: canonical, image: new URL('assets/portrait-640.jpg', base).href,
        sameAs: ['https://www.linkedin.com/in/mykola-khytra/', 'https://github.com/mykolakhy'] },
    }).replaceAll('<', '\\u003c');
    scriptHash = 'sha256-' + createHash('sha256').update(structured).digest('base64');
    html = html.replace('content="./assets/social-preview.png"', `content="${escape(image)}"`)
      .replace('</head>', `  <link rel="canonical" href="${escape(canonical)}" />\n  <meta property="og:url" content="${escape(canonical)}" />\n  <script type="application/ld+json">${structured}</script>\n</head>`);
  } else {
    html = html.replace('</head>', '  <meta name="robots" content="noindex, nofollow" />\n</head>');
  }
  await mkdir(destination, { recursive: true });
  // Preserve unexpected user files, but refuse to label that directory publishable.
  const approved = new Set([...publicFiles, 'robots.txt', 'sitemap.xml', '_headers', '404.html']);
  const existing = await readdir(destination, { recursive: true, withFileTypes: true });
  for (const entry of existing.filter((entry) => !entry.isDirectory())) {
    const relative = resolve(entry.parentPath, entry.name).slice(destination.length + 1);
    if (!approved.has(relative) || entry.isSymbolicLink()) throw new Error(`Unexpected build output: ${relative}. Move it out of dist before building.`);
  }
  for (const file of publicFiles) {
    const target = resolve(destination, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file === 'index.html' ? html : sources.get(file));
  }
  // A top-level 404 disables Cloudflare Pages' default SPA fallback. Rooted
  // resource URLs also work when this document is served for a nested bad URL.
  const home = escape(base?.pathname ?? '/');
  await writeFile(resolve(destination, '404.html'), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, follow" />
  <title>Page not found — Mykola Khytra</title>
  <link rel="icon" type="image/svg+xml" href="${home}assets/favicon.svg" />
  <link rel="stylesheet" href="${home}styles.css" />
</head>
<body>
  <header class="site-header"><div class="container header-inner"><a class="wordmark" href="${home}" aria-label="Mykola Khytra home">mykola<span>/</span>qa</a></div></header>
  <main class="hero grid-texture"><div class="container hero-inner">
    <p class="eyebrow">Page not found</p>
    <h1>404.</h1>
    <p class="hero-lede">This page does not exist. Let's get you back to the portfolio.</p>
    <div class="hero-actions"><a class="button button-primary" href="${home}">Back to the homepage <span aria-hidden="true">→</span></a></div>
  </div></main>
</body>
</html>
`);
  await writeFile(resolve(destination, 'robots.txt'), base ? `User-agent: *\nAllow: /\nSitemap: ${new URL('sitemap.xml', base).href}\n` : 'User-agent: *\nDisallow: /\n');
  await writeFile(resolve(destination, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${base ? `<url><loc>${base.href.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</loc></url>` : ''}</urlset>\n`);
  const headers = { ...securityHeaders(scriptHash), ...(!base ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}) };
  await writeFile(resolve(destination, '_headers'), `/*\n${Object.entries(headers).map(([key, value]) => `  ${key}: ${value}`).join('\n')}\n  Cache-Control: public, max-age=0, must-revalidate\n`);
  return { destination, production: Boolean(base), files: publicFiles.length + 4 };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await build();
  console.log(`Built ${result.files} allowlisted files in dist. ${result.production ? 'Production URL configured.' : 'Preview only: set SITE_URL before public deployment.'}`);
}
