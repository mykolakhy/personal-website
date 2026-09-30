import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { publicFiles, securityHeaders } from './public-files.mjs';

const root = resolve(import.meta.dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.avif': 'image/avif', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };
export function websiteServer({ directory = root, headers = securityHeaders() } = {}) {
  const allowed = new Set([...publicFiles, 'robots.txt', 'sitemap.xml']);
  return createServer(async (request, response) => {
    const finish = (code, message) => { response.writeHead(code, { ...headers, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(message); };
    if (!['GET', 'HEAD'].includes(request.method)) { response.setHeader('Allow', 'GET, HEAD'); return finish(405, 'Method not allowed'); }
    let path;
    try {
      path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname).replace(/^\//, '') || 'index.html';
    } catch { return finish(400, 'Invalid URL'); }
    if (!allowed.has(path)) return finish(404, 'Not found');
    try {
      const file = resolve(directory, path);
      if (await realpath(file) !== file) return finish(404, 'Not found');
      const info = await stat(file);
      if (!info.isFile()) return finish(404, 'Not found');
      const bytes = await readFile(file);
      response.writeHead(200, { ...headers, 'Content-Type': types[extname(file)], 'Content-Length': bytes.length, 'Cache-Control': 'no-store' });
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
