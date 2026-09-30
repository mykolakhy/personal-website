import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { publicFiles } from '../scripts/public-files.mjs';
import { build, productionURL } from '../scripts/build.mjs';
import { websiteServer } from '../scripts/serve.mjs';

const html = await readFile('index.html', 'utf8');
const css = await readFile('styles.css', 'utf8');

test('local links, anchors, IDs and referenced resources are valid', async () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size, 'duplicate IDs');
  const urls = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
  urls.push(...[...css.matchAll(/url\("([^"]+)"\)/g)].map((match) => match[1]));
  for (const url of urls) {
    if (url.startsWith('#')) assert.ok(ids.includes(url.slice(1)), url);
    if (url.startsWith('./')) assert.ok(publicFiles.includes(url.slice(2)), url);
  }
  for (const file of publicFiles) assert.ok((await stat(file)).isFile(), file);
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
  assert.match(html, /<html lang="en">/);
  assert.doesNotMatch(html + css, /fonts\.googleapis|fonts\.gstatic|avatar\.png|text-overflow: ellipsis|Available to start immediately/);
});

test('normal text tokens exceed 4.5:1 on every site surface', () => {
  const colors = Object.fromEntries([...css.matchAll(/--([\w-]+): (#[a-f0-9]{6});/g)].map((m) => [m[1], m[2]]));
  const luminance = (hex) => hex.slice(1).match(/../g).map((channel) => parseInt(channel, 16) / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  for (const [name, color] of Object.entries(colors).filter(([name]) => name.startsWith('text-') || name === 'accent')) {
    for (const [bgName, bg] of Object.entries(colors).filter(([name]) => name.startsWith('bg-'))) {
      const ratio = (luminance(color) + .05) / (luminance(bg) + .05);
      assert.ok(ratio >= 4.5, `${name} on ${bgName}: ${ratio}`);
    }
  }
});

test('portrait variants are small and contain no EXIF/XMP', async () => {
  for (const file of publicFiles.filter((file) => file.startsWith('assets/portrait-'))) {
    const info = await sharp(file).metadata();
    assert.ok(!info.exif && !info.xmp && !info.iptc, file);
    assert.equal(info.width, file.includes('320') ? 320 : 640);
    assert.ok((await stat(file)).size < 80000, file);
  }
});

test('build publishes only the allowlist and configures real production metadata', async () => {
  const destination = await mkdtemp(resolve(tmpdir(), 'portfolio-build-'));
  await build({ destination, siteURL: 'https://portfolio.example/qa/' });
  const result = await readFile(resolve(destination, 'index.html'), 'utf8');
  assert.match(result, /rel="canonical" href="https:\/\/portfolio\.example\/qa\/"/);
  assert.match(result, /content="https:\/\/portfolio\.example\/qa\/assets\/social-preview.png"/);
  const structured = JSON.parse(result.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(structured.mainEntity.name, 'Mykola Khytra');
  assert.equal(structured['@type'], 'ProfilePage');
  const files = await readdir(destination, { recursive: true, withFileTypes: true });
  const actual = files.filter((item) => item.isFile()).map((item) => resolve(item.parentPath, item.name).slice(destination.length + 1)).sort();
  assert.deepEqual(actual, [...publicFiles, 'robots.txt', 'sitemap.xml', '_headers'].sort());
  assert.doesNotMatch(actual.join('\n'), /avatar\.png|\.git|qa-artifacts|node_modules|telegram|README|\.env/);
  assert.match(await readFile(resolve(destination, '_headers'), 'utf8'), /script-src 'self' 'sha256-/);
  await build({ destination });
  assert.match(await readFile(resolve(destination, 'index.html'), 'utf8'), /noindex, nofollow/);
  assert.doesNotMatch(await readFile(resolve(destination, 'index.html'), 'utf8'), /rel="canonical"/);
});

test('production URL validation rejects unsafe or non-public inputs', () => {
  for (const value of ['http://example.com', 'https://localhost', 'https://127.0.0.1', 'https://user:password@example.com', 'https://example.com/?x=1', 'https://example.com/#top', 'not a URL']) {
    assert.throws(() => productionURL(value), value);
  }
  assert.equal(productionURL('https://example.com/qa').href, 'https://example.com/qa/');
});

test('preview serves safe resources but no private files, listings or writes', async (context) => {
  const server = websiteServer();
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  context.after(() => new Promise((done) => server.close(done)));
  const url = 'http://127.0.0.1:' + server.address().port;
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  for (const path of ['/.git/config', '/.env', '/qa-artifacts/', '/assets/avatar.png', '/node_modules/', '/scripts/serve.mjs', '/%2e%2e%2fREADME.md', '/assets/', '/assets/%zz']) {
    assert.ok([400, 404].includes((await fetch(url + path)).status), path);
  }
  assert.equal((await fetch(url, { method: 'POST' })).status, 405);
  assert.equal((await fetch(url + '/assets/downloads/mykola-khytra-cv.pdf')).headers.get('content-type'), 'application/pdf');
  assert.equal((await fetch(url + '/styles.css', { method: 'HEAD' })).status, 200);
});
