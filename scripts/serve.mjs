import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { publicFiles, securityHeaders } from './public-files.mjs';
import { languages, translationFiles, generatedPages, readCatalogs, renderPage, renderNotFound } from './i18n.mjs';
import { publicSourceBytes } from './build.mjs';
import { githubStatsFiles, validateSnapshot } from './github-data.mjs';
import { aiStatsFiles, validateAISnapshot } from './ai-data.mjs';

const root = resolve(import.meta.dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.avif': 'image/avif', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };
export function websiteServer({ directory = root, headers = securityHeaders() } = {}) {
  const allowed = new Set([...publicFiles, ...generatedPages, 'robots.txt', 'sitemap.xml']);
  return createServer(async (request, response) => {
    const finish = (code, message) => { response.writeHead(code, { ...headers, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(message); };
    if (!['GET', 'HEAD'].includes(request.method)) { response.setHeader('Allow', 'GET, HEAD'); return finish(405, 'Method not allowed'); }
    let path;
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      path = decodeURIComponent(url.pathname).replace(/^\//, '');
      if (languages.slice(1).some(({ code }) => path === code)) {
        response.writeHead(301, { ...headers, Location: `/${path}/${url.search}` });
        return response.end();
      }
      if (languages.some(({ path: route }) => path === route)) path += 'index.html';
    } catch { return finish(400, 'Invalid URL'); }
    const found = allowed.has(path);
    if (!found) {
      const language = languages.slice(1).find(({ path: route }) => path.startsWith(route)) ?? languages[0];
      path = `${language.path}404.html`;
    }
    try {
      const file = resolve(directory, path);
      let bytes;
      if (directory === root && generatedPages.includes(path)) {
        const sources = await publicSourceBytes(['index.html', ...translationFiles, ...githubStatsFiles, ...aiStatsFiles]);
        const template = sources.get('index.html').toString('utf8');
        const code = languages.find((language) => path === `${language.path}index.html` || path === `${language.path}404.html`).code;
        const catalog = readCatalogs(template, sources).get(code);
        const github = validateSnapshot(JSON.parse(sources.get(githubStatsFiles[0]).toString('utf8')));
        const ai = validateAISnapshot(JSON.parse(sources.get(aiStatsFiles[0]).toString('utf8')));
        bytes = Buffer.from(path.endsWith('404.html') ? renderNotFound(code, catalog) : renderPage(template, code, catalog, github, ai));
      } else {
        if (await realpath(file) !== file) return finish(404, 'Not found');
        const info = await stat(file);
        if (!info.isFile()) return finish(404, 'Not found');
        bytes = await readFile(file);
      }
      response.writeHead(found && !path.endsWith('404.html') ? 200 : 404, { ...headers, 'Content-Type': types[extname(file)], 'Content-Length': bytes.length, 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch { finish(404, 'Not found'); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const arg = (name, fallback) => { const index = process.argv.indexOf(name); return index === -1 ? fallback : process.argv[index + 1]; };
  const directory = resolve(arg('--dir', root));
  let headers = securityHeaders();
  if (directory !== root) {
    const lines = (await readFile(resolve(directory, '_headers'), 'utf8')).split('\n').filter((line) => line.startsWith('  '));
    headers = Object.fromEntries(lines.map((line) => { const index = line.indexOf(':'); return [line.slice(2, index), line.slice(index + 2)]; }));
  }
  const port = Number(arg('--port', '4173'));
  const server = websiteServer({ directory, headers });
  server.listen(port, '127.0.0.1', () => console.log(`Website: http://127.0.0.1:${port}/ (allowlisted files only)`));
}
