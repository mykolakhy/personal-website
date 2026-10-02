import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { publicSourceBytes, build } from '../scripts/build.mjs';
import { languages, pages, pageTemplateFiles, generatedPages, readCatalogs, renderPage } from '../scripts/i18n.mjs';
import { publicFiles } from '../scripts/public-files.mjs';
import { websiteServer } from '../scripts/serve.mjs';

const sources = await publicSourceBytes();
const template = sources.get('index.html').toString('utf8');
const catalogs = readCatalogs(template, sources);
const github = JSON.parse(sources.get('data/github-stats.json'));
const ai = JSON.parse(sources.get('data/ai-stats.json'));
const render = (code, page) => renderPage(template, code, catalogs.get(code), github, ai, { page, sources });

test('the compact homepage keeps seven sections, experience and cases, without expanded statistics', () => {
  for (const { code } of languages) {
    const html = render(code, 'home');
    assert.equal([...html.matchAll(/<section\b/g)].length, 7);
    assert.doesNotMatch(html, /data-ai-metric|data-ai-month|data-total=|calendar-day|github-quality|writing-list|id="approach-title"/);
    for (const id of ['expertise', 'ci-case', 'api-case', 'team-case', 'experience-title', 'explore', 'contact']) assert.ok(html.includes(`id="${id}"`));
    assert.ok(html.indexOf('id="experience-title"') < html.indexOf('id="explore"'));
  }
});

test('all twelve pages have complete local links, unique IDs, localized page switchers and active navigation', () => {
  const documents = new Map();
  for (const { code, path } of languages) for (const page of pages) documents.set(path + page.path + 'index.html', render(code, page.key));
  const assets = new Set(publicFiles);
  for (const [file, html] of documents) {
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(ids.length, new Set(ids).size, file);
    assert.equal([...html.matchAll(/<h1\b/g)].length, 1, file);
    assert.doesNotMatch(html, /data-i18n|data-route|undefined/, file);
    const base = new URL(file, 'https://portfolio.example/');
    for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      const url = new URL(match[1], base);
      if (url.origin !== base.origin) continue;
      const target = url.pathname.slice(1) + (url.pathname.endsWith('/') ? 'index.html' : '');
      assert.ok(documents.has(target) || assets.has(target), `${file}: ${url.pathname}`);
      if (url.hash && documents.has(target)) assert.ok(documents.get(target).includes(`id="${url.hash.slice(1)}"`), `${file}: ${url.href}`);
    }
    const page = pages.find(page => languages.some(language => file === language.path + page.path + 'index.html'));
    for (const language of languages) assert.ok(html.includes(`${language.path}${page.path}${language.code === 'en' ? '?lang=en' : ''}" lang="${language.code}"`), file);
    if (page.key !== 'home') assert.match(html, /<nav[^>]*>[\s\S]*?aria-current="page"[\s\S]*?<\/nav>/);
  }
  const projects = render('en', 'projects');
  assert.ok(projects.indexOf('data-repository=') < projects.indexOf('data-total='), 'projects precede activity figures');
  assert.doesNotMatch(projects, /data-ai-metric/);
  const aiPage = render('en', 'ai');
  assert.ok(aiPage.indexOf('id="ai-workflow"') < aiPage.indexOf('data-ai-metric='));
  assert.doesNotMatch(aiPage, /data-repository=/);
  assert.throws(() => render('en', 'unexpected'), /Unsupported page/);
});

test('each page has its own canonical, same-page language alternatives, metadata and CSP hashes', async context => {
  const destination = await mkdtemp(resolve(tmpdir(), 'portfolio-pages-'));
  context.after(() => rm(destination, { recursive: true, force: true }));
  const result = await build({ destination, siteURL: 'https://portfolio.example/subpath/' });
  assert.equal(result.files, 42);
  const sitemap = await readFile(resolve(destination, 'sitemap.xml'), 'utf8');
  const headers = await readFile(resolve(destination, '_headers'), 'utf8');
  assert.equal([...sitemap.matchAll(/<loc>/g)].length, 12);
  const titles = new Set();
  for (const { code, path } of languages) for (const page of pages) {
    const html = await readFile(resolve(destination, path + page.path + 'index.html'), 'utf8');
    const canonical = `https://portfolio.example/subpath/${path}${page.path}`;
    assert.ok(html.includes(`rel="canonical" href="${canonical}"`));
    assert.ok(sitemap.includes(`<loc>${canonical}</loc>`));
    for (const language of [...languages, { code: 'x-default', path: '' }]) assert.ok(html.includes(`hreflang="${language.code}" href="https://portfolio.example/subpath/${language.path}${page.path}"`));
    const json = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1];
    assert.equal(JSON.parse(json).url, canonical);
    assert.equal(JSON.parse(json)['@type'], page.key === 'home' ? 'ProfilePage' : 'WebPage');
    assert.ok(headers.includes(`'sha256-${createHash('sha256').update(json).digest('base64')}'`));
    if (code === 'en') titles.add(html.match(/<title>(.*?)<\/title>/)[1]);
  }
  assert.equal(titles.size, 3);
  assert.ok(generatedPages.includes('uk/projects/index.html'));
  const attack = renderPage(template, 'uk', { ...catalogs.get('uk'), 'meta.projectsTitle': '\"><script>bad</script>' }, github, ai, { page: 'projects', sources });
  assert.doesNotMatch(attack, /<script>bad/);
  assert.match(attack, /&lt;script&gt;bad/);
  const literal = renderPage(template, 'uk', { ...catalogs.get('uk'), 'meta.aiDescription': '$& remains plain text' }, github, ai, { page: 'ai', sources });
  assert.match(literal, /content="\$&amp; remains plain text"/);
});

test('dev and built servers serve nested routes and slash redirects without exposing templates or data', async context => {
  const destination = await mkdtemp(resolve(tmpdir(), 'portfolio-routes-'));
  context.after(() => rm(destination, { recursive: true, force: true }));
  await build({ destination });
  for (const directory of [undefined, await realpath(destination)]) {
    const server = websiteServer({ directory });
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    try {
      const base = 'http://127.0.0.1:' + server.address().port;
      for (const { code, path } of languages) for (const page of pages) {
        const route = '/' + path + page.path;
        const response = await fetch(base + route);
        assert.equal(response.status, 200, route);
        assert.ok((await response.text()).includes(`lang="${code}" data-page="${page.key}"`));
        if (route !== '/') {
          const redirect = await fetch(base + route.slice(0, -1) + '?lang=en', { redirect: 'manual' });
          assert.equal(redirect.status, 301);
          assert.equal(redirect.headers.get('location'), route + '?lang=en');
        }
        const missing = await fetch(base + route + 'missing');
        assert.equal(missing.status, 404);
        assert.ok((await missing.text()).includes(`<html lang="${code}">`));
      }
      for (const file of [...pageTemplateFiles, 'data/ai-stats.json', '.codex/auth.json']) assert.equal((await fetch(base + '/' + file)).status, 404);
    } finally { await new Promise(done => server.close(done)); }
  }
});
