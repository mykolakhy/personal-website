import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { publicFiles } from '../scripts/public-files.mjs';
import { build, productionURL } from '../scripts/build.mjs';
import { pagesSiteURL } from '../scripts/build-pages.mjs';
import { websiteServer } from '../scripts/serve.mjs';

const html = await readFile('index.html', 'utf8');
const css = await readFile('styles.css', 'utf8');

test('positioning covers manual, general and automation QA before the case studies', () => {
  assert.match(html, /class="hero-lede">Manual, API, and automated testing\./);
  assert.match(html, /Five years across manual, general, and automation QA/);
  assert.match(html, /<strong>QA<\/strong><span>manual \+ automation<\/span>/);
  const expertise = html.match(/<section id="expertise"([\s\S]*?)<\/section>/)?.[1];
  assert.ok(expertise, 'expertise section exists');
  assert.ok(html.indexOf('id="expertise"') < html.indexOf('id="work"'), 'capabilities precede automation case studies');
  for (const phrase of ['Manual &amp; product QA', 'Exploratory, functional, smoke, and regression testing', 'release validation', 'API &amp; integration QA', 'Jest, Vitest, and Axios for automated API checks', 'UI automation with Playwright and TypeScript']) assert.ok(expertise.includes(phrase), phrase);
  assert.match(html, /Across the QA<br \/> lifecycle\./);
  assert.match(html, /class="role-scope">Manual, general, and automation QA\./);
  assert.doesNotMatch(html, /From testing<br \/> to engineering|Hiring a Senior QA Engineer or SDET/);
});

test('AI positioning describes practical agent workflows without unverified expertise or results', async () => {
  const workflow = html.match(/<section id="ai-workflow"([\s\S]*?)<\/section>/)?.[1];
  assert.ok(workflow, 'AI workflow exists');
  for (const phrase of ['Claude Code and Codex', 'repository analysis', 'test design', 'Understand the context', 'Build and improve', 'Check the result', 'verify behavior manually']) assert.ok(workflow.includes(phrase), phrase);
  assert.match(html, /href="#ai-workflow">See the workflow/);
  assert.match(css, /html \{ scroll-behavior: auto;/, 'anchor navigation must not race with disclosure scrolling');
  const description = html.match(/<meta name="description" content="([^"]+)"/)[1];
  assert.match(description, /Manual, API, and automated testing/);
  assert.match(description, /Claude Code and Codex/);
  assert.doesNotMatch(workflow, /Copilot|Aider|LLM|RAG|\d+\s*%|\d+\s*[×x]/);
  const social = await readFile('assets/social-preview.svg', 'utf8');
  assert.match(social, /Manual \+ automation\. AI-assisted QA\./);
  assert.match(social, /Claude Code \/ Codex/);
  const image = await sharp('assets/social-preview.png').metadata();
  assert.equal(image.width, 1200);
  assert.equal(image.height, 630);
});

test('CI performance copy reflects many optimized jobs without a whole-pipeline claim', () => {
  assert.match(html, /<strong>Up to 4×<\/strong><span>faster execution for CI jobs<\/span>/);
  assert.doesNotMatch(html, /faster execution for one CI job|runtime of one regression CI job|The selected job ran|This is an improvement for one job/);
  const ciCase = html.match(/<details id="ci-case">([\s\S]*?)<\/details>/)?.[1];
  assert.ok(ciCase, 'CI case study exists');
  assert.match(ciCase, /Applied parallel execution across many CI jobs/);
  assert.match(ciCase, /Separately, maintained overnight regression workflows for roughly 30 of around 70 CI jobs/);
  assert.match(ciCase, /Up to four times faster execution across optimized CI jobs/);
  assert.match(ciCase, /runtime reduction from approximately 60 minutes to 15/);
  assert.match(ciCase, /many CI jobs, not all jobs or the entire delivery pipeline/);
});

test('team claims distinguish shared scope from independent process ownership', () => {
  const teamCase = html.match(/<details id="team-case">([\s\S]*?)<\/details>/)?.[1];
  assert.ok(teamCase, 'team case study exists');
  assert.match(teamCase, /roughly 10–15 QA engineers, automation engineers, and developers across teams/);
  assert.doesNotMatch(teamCase, /10–15 QA automation engineers|led the TestRail-to-Testomat migration/);
  assert.match(teamCase, /Independently migrated test case management from TestRail to Testomat/);
  assert.match(teamCase, /shared ecosystem, not tests authored by me alone/);
  assert.match(html, />Postman<\/span>/);
  assert.match(html, />Swagger<\/span>/);
});

test('downloadable CV preserves the owner-approved original PDF exactly', async () => {
  // Update this fingerprint only when the owner approves a new original CV.
  const cv = await readFile('assets/downloads/mykola-khytra-cv.pdf');
  assert.equal(createHash('sha256').update(cv).digest('hex'), '476bc147c7f9b299ea81438a16db23ed9e327bd2b986ba97d61a76225e3c2821');
  assert.equal(cv.subarray(0, 5).toString(), '%PDF-');
});

test('local links, anchors, IDs and referenced resources are valid', async () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size, 'duplicate IDs');
  const urls = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
  urls.push(...[...css.matchAll(/url\("([^"]+)"\)/g)].map((match) => match[1]));
  for (const url of urls) {
    if (url.startsWith('#')) assert.ok(ids.includes(url.slice(1)), url);
    if (url.startsWith('./')) assert.ok(publicFiles.includes(url.slice(2).split('?')[0]), url);
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
  assert.deepEqual(await readFile(resolve(destination, 'assets/downloads/mykola-khytra-cv.pdf')), await readFile('assets/downloads/mykola-khytra-cv.pdf'));
  const result = await readFile(resolve(destination, 'index.html'), 'utf8');
  assert.match(result, /rel="canonical" href="https:\/\/portfolio\.example\/qa\/"/);
  assert.match(result, /content="https:\/\/portfolio\.example\/qa\/assets\/social-preview.png"/);
  const structured = JSON.parse(result.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(structured.mainEntity.name, 'Mykola Khytra');
  assert.equal(structured['@type'], 'ProfilePage');
  const files = await readdir(destination, { recursive: true, withFileTypes: true });
  const actual = files.filter((item) => item.isFile()).map((item) => resolve(item.parentPath, item.name).slice(destination.length + 1)).sort();
  assert.deepEqual(actual, [...publicFiles, 'robots.txt', 'sitemap.xml', '_headers', '404.html'].sort());
  assert.doesNotMatch(actual.join('\n'), /avatar\.png|\.git|qa-artifacts|node_modules|telegram|README|\.env/);
  assert.match(await readFile(resolve(destination, '_headers'), 'utf8'), /script-src 'self' 'sha256-/);
  const notFound = await readFile(resolve(destination, '404.html'), 'utf8');
  assert.match(notFound, /<h1>404\.<\/h1>/);
  assert.match(notFound, /href="\/qa\/styles.css"/);
  assert.match(notFound, /href="\/qa\/"/);
  assert.match(notFound, /noindex, follow/);
  await build({ destination, siteURL: null });
  assert.match(await readFile(resolve(destination, 'index.html'), 'utf8'), /noindex, nofollow/);
  assert.doesNotMatch(await readFile(resolve(destination, 'index.html'), 'utf8'), /rel="canonical"/);
  assert.match(await readFile(resolve(destination, '404.html'), 'utf8'), /href="\/styles.css"/);
  assert.match(await readFile(resolve(destination, '_headers'), 'utf8'), /X-Robots-Tag: noindex, nofollow/);
});

test('Pages production requires a valid URL, while preview branches cannot be indexed', () => {
  assert.equal(pagesSiteURL({ CF_PAGES_BRANCH: 'main', SITE_URL: 'https://mykolakhytra.com' }), 'https://mykolakhytra.com/');
  for (const branch of ['deploy-cloudflare-pages', 'feature/main', 'MAIN']) {
    assert.equal(pagesSiteURL({ CF_PAGES_BRANCH: branch, SITE_URL: 'https://mykolakhytra.com/' }), null);
  }
  assert.throws(() => pagesSiteURL({ CF_PAGES_BRANCH: 'main' }), /SITE_URL is required/);
  assert.throws(() => pagesSiteURL({ CF_PAGES_BRANCH: 'main', SITE_URL: 'http://mykolakhytra.com' }), /public HTTPS URL/);
  assert.throws(() => pagesSiteURL({ SITE_URL: 'https://mykolakhytra.com/' }), /CF_PAGES_BRANCH is required/);
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
  const cvResponse = await fetch(url + '/assets/downloads/mykola-khytra-cv.pdf');
  assert.equal(cvResponse.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(Buffer.from(await cvResponse.arrayBuffer()), await readFile('assets/downloads/mykola-khytra-cv.pdf'));
  assert.equal((await fetch(url + '/styles.css', { method: 'HEAD' })).status, 200);
});
