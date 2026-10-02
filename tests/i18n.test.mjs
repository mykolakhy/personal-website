import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { languages, translationFiles, readCatalogs, renderPage } from '../scripts/i18n.mjs';
import { publicSourceBytes, build } from '../scripts/build.mjs';
import { websiteServer } from '../scripts/serve.mjs';

const sources = await publicSourceBytes();
const template = sources.get('index.html').toString('utf8');
const catalogs = readCatalogs(template, sources);

test('every catalog has complete plain-text translations and rejects invalid entries', () => {
  const keys = [...template.matchAll(/data-i18n(?:-content|-alt|-aria-label)?="([\w.-]+)"/g)].map(m => m[1]);
  assert.ok(new Set(keys).size >= 130);
  for (const { code } of languages.slice(1)) {
    const catalog = catalogs.get(code);
    for (const key of keys) assert.ok(catalog[key].trim(), `${code}: ${key}`);
    for (const value of Object.values(catalog)) assert.doesNotMatch(value, /<[^>]*>/, 'catalogs must contain text, not markup');
    for (const [name, mutate] of [
      ['missing', copy => delete copy['hero.tagline']],
      ['empty', copy => copy['hero.tagline'] = ' '],
      ['not text', copy => copy['hero.tagline'] = 42],
      ['unknown', copy => copy.unexpected = 'unexpected'],
    ]) {
      const copy = { ...catalog }; mutate(copy);
      const broken = new Map(sources).set(`locales/${code}.json`, Buffer.from(JSON.stringify(copy)));
      assert.throws(() => readCatalogs(template, broken), /translation:/, `${code}: ${name}`);
    }
  }
  assert.throws(() => renderPage(template, 'ua', {}), /Unsupported language/);
});

test('all static pages translate text and attributes while preserving links, content structure and attribution', () => {
  const englishIDs = [...template.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  for (const { code, path } of languages) {
    const catalog = catalogs.get(code);
    const html = renderPage(template, code, catalog);
    assert.match(html, new RegExp(`<html lang="${code}">`));
    assert.equal([...html.matchAll(/<section\b/g)].length, 9);
    assert.deepEqual([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]), englishIDs);
    assert.match(html, /<h1 id="hero-title">Mykola Khytra\.<\/h1>/);
    assert.match(html, /data-language="en"/);
    assert.match(html, new RegExp(`data-language="${code}" aria-current="page"`));
    assert.doesNotMatch(html, /data-i18n|undefined|<!-- language-switcher/);
    assert.doesNotMatch(html, /<!-- theme-toggle/);
    assert.match(html, /class="theme-toggle" type="button" hidden aria-label="[^"]+"/);
    assert.ok(html.includes(catalog['theme.light']));
    assert.ok(html.includes(catalog['theme.dark']));
    const prefix = path ? '../' : './';
    assert.ok(html.includes(`src="${prefix}theme.js?v=`));
    assert.ok(html.indexOf('src="' + prefix + 'theme.js') < html.indexOf('rel="stylesheet"'), 'saved theme applies before styling');
    for (const other of languages) assert.ok(html.includes(`href="${prefix}${other.path}${other.code === 'en' ? '?lang=en' : ''}"`));
    assert.ok(html.includes(`href="${prefix}assets/downloads/mykola-khytra-cv.pdf"`));
    if (code !== 'en') {
      assert.doesNotMatch(html, /Download CV|Skip to content|Read the CI case|My contribution\.|The suite size describes/);
      assert.match(html, /11[., ]000\+|11\.000/);
      assert.match(html, /10–15/);
      assert.match(html, /30.*70/);
      assert.match(html, /TestRail.*Testomat/);
      assert.ok(html.includes(catalog.portraitAlt));
      assert.ok(html.includes(catalog.navLabel));
      assert.ok(html.includes(catalog['meta.description']));
    }
  }
});

test('translation content cannot inject HTML, scripts or attributes', () => {
  const attack = '\"><script>alert(1)</script>&';
  const html = renderPage(template, 'uk', { ...catalogs.get('uk'), 'hero.tagline': attack, portraitAlt: attack, 'meta.description': attack, 'theme.light': attack });
  assert.ok(html.includes('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&amp;'));
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /alt="&quot;&gt;&lt;script&gt;/);
  assert.match(html, /data-label-light="&quot;&gt;&lt;script&gt;/);
});

test('production gives each language canonical metadata, matching CSP hashes, a sitemap and localized 404s', async context => {
  const destination = await mkdtemp(resolve(tmpdir(), 'portfolio-i18n-'));
  context.after(() => rm(destination, { recursive: true, force: true }));
  await build({ destination, siteURL: 'https://portfolio.example/subpath/' });
  const headers = await readFile(resolve(destination, '_headers'), 'utf8');
  const sitemap = await readFile(resolve(destination, 'sitemap.xml'), 'utf8');
  for (const { code, path } of languages) {
    const canonical = `https://portfolio.example/subpath/${path}`;
    const html = await readFile(resolve(destination, path, 'index.html'), 'utf8');
    assert.ok(html.includes(`rel="canonical" href="${canonical}"`));
    assert.ok(sitemap.includes(`<loc>${canonical}</loc>`));
    for (const language of [...languages, { code: 'x-default', path: '' }]) {
      assert.ok(html.includes(`hreflang="${language.code}" href="https://portfolio.example/subpath/${language.path}"`));
    }
    const json = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1];
    assert.equal(JSON.parse(json).inLanguage, code);
    assert.equal(JSON.parse(json).url, canonical);
    assert.ok(headers.includes(`'sha256-${createHash('sha256').update(json).digest('base64')}'`));
    assert.doesNotMatch(headers, /unsafe-inline/);
    const notFound = await readFile(resolve(destination, path, '404.html'), 'utf8');
    assert.ok(notFound.includes(`<html lang="${code}">`));
    assert.ok(notFound.includes(`href="/subpath/${path}"`));
    assert.ok(notFound.includes('href="/subpath/styles.css?v='));
    assert.ok(notFound.includes('src="/subpath/theme.js?v='));
    assert.ok(notFound.includes(catalogs.get(code)['theme.dark']));
  }
  assert.equal([...sitemap.matchAll(/<loc>/g)].length, 4);
  assert.doesNotMatch((await readdir(destination, { recursive: true })).join('\n'), /locales|\.json$/);
  await build({ destination, siteURL: null });
  for (const { path } of languages) {
    const html = await readFile(resolve(destination, path, 'index.html'), 'utf8');
    assert.match(html, /noindex, nofollow/);
    assert.doesNotMatch(html, /rel="canonical"|hreflang="x-default"/);
  }
});

test('development serves all language routes and localized 404s without exposing catalogs', async context => {
  const server = websiteServer();
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  context.after(() => new Promise(done => server.close(done)));
  const base = 'http://127.0.0.1:' + server.address().port;
  for (const { code, path } of languages) {
    const response = await fetch(base + '/' + path);
    assert.equal(response.status, 200);
    assert.match(await response.text(), new RegExp(`<html lang="${code}">`));
    const bad = await fetch(base + '/' + path + 'missing/nested-page');
    assert.equal(bad.status, 404);
    assert.match(await bad.text(), new RegExp(`<html lang="${code}">`));
    if (path) {
      const redirect = await fetch(base + '/' + code + '?x=1', { redirect: 'manual' });
      assert.equal(redirect.status, 301);
      assert.equal(redirect.headers.get('location'), `/${code}/?x=1`);
    }
  }
  for (const file of translationFiles) assert.equal((await fetch(base + '/' + file)).status, 404);
});
