import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import config from '../playwright.config.mjs';
import { chromiumOnlyTag, layoutCoverage } from './browser/coverage.mjs';

test('browser policy retains representative layouts and explicit breakpoint cases', () => {
  for (const width of [320, 390, 600, 601, 768, 1000, 1001, 1440]) {
    for (const theme of ['light', 'dark']) {
      const selected = (width === 320 && theme === 'dark') || (width === 1440 && theme === 'light');
      assert.deepEqual(layoutCoverage({ width, theme }).tag, selected ? [] : [chromiumOnlyTag]);
      assert.deepEqual(layoutCoverage({ width, theme, webkitBoundary: true }).tag, []);
    }
    assert.deepEqual(layoutCoverage({ width }).tag, [320, 1440].includes(width) ? [] : [chromiumOnlyTag]);
  }
});

test('browser discovery preserves the full Chromium suite and all WebKit functional scenarios', () => {
  assert.deepEqual(config.projects.map(project => project.name), ['chromium', 'webkit']);
  assert.equal(config.projects[0].grep, undefined);
  assert.equal(config.projects[0].grepInvert, undefined);
  assert.equal(config.projects[1].grep, undefined);
  assert.equal(config.projects[1].grepInvert.source, chromiumOnlyTag);
  assert.equal(config.retries, 0);

  // Inspect real Playwright discovery, not a second hand-maintained case list.
  // No browser is launched and no test-server ports are opened by --list.
  const report = JSON.parse(execFileSync(process.execPath, [
    'node_modules/@playwright/test/cli.js', 'test', '--list', '--reporter=json',
  ], { encoding: 'utf8', timeout: 30000 }));
  const cases = new Map();
  function visit(suite) {
    for (const spec of suite.specs || []) {
      const key = `${spec.file}:${spec.title}`;
      const item = cases.get(key) || { file: spec.file, title: spec.title, tags: spec.tags, projects: new Set() };
      for (const run of spec.tests) item.projects.add(run.projectName);
      cases.set(key, item);
    }
    for (const child of suite.suites || []) visit(child);
  }
  for (const suite of report.suites) visit(suite);
  assert.ok(cases.size > 0);
  let reduced = 0;
  for (const item of cases.values()) {
    assert.ok(item.projects.has('chromium'), item.title);
    // Playwright's JSON report normalizes tags by removing the @ prefix.
    const chromiumOnly = item.tags.includes(chromiumOnlyTag.slice(1));
    assert.deepEqual([...item.projects].sort(), chromiumOnly ? ['chromium'] : ['chromium', 'webkit'], item.title);
    if (chromiumOnly) reduced++;
  }
  assert.ok(reduced > 0 && reduced < cases.size);

  const retained = (file, title) => {
    const item = cases.get(`${file}:${title}`);
    assert.ok(item?.projects.has('webkit'), title);
  };
  for (const code of ['en', 'uk', 'it', 'de']) {
    for (const [theme, width] of [['dark', 320], ['light', 1440]]) {
      retained('ai.spec.mjs', `${code} AI statistics in ${theme} at ${width}px show exact local data without overflow`);
      retained('ai.spec.mjs', `${code} Claude statistics in ${theme} at ${width}px preserve source coverage and do not leak data`);
      retained('github.spec.mjs', `${code} GitHub activity in ${theme} at ${width}px is accurate, accessible and local`);
      retained('hero-navigation.spec.mjs', `${code} hero navigation fits ${theme} at ${width}px`);
      for (const page of ['projects', 'ai']) retained('pages.spec.mjs', `${code} ${page} page is complete and accessible in ${theme} at ${width}px`);
    }
    for (const width of [375, 1440]) retained('languages.spec.mjs', `${code}: language button restores its default style after closing at ${width}px`);
  }
  for (const width of [600, 601, 1000, 1001]) for (const theme of ['light', 'dark']) {
    retained('hero-navigation.spec.mjs', `uk hero navigation fits ${theme} at ${width}px`);
  }
  for (const width of [800, 801]) retained('portfolio.spec.mjs', `responsive layout and full contacts at ${width}px`);
});

test('CI installs only tested engines and public browser claims match that scope', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(workflow, /^      - run: npx playwright install --with-deps chromium webkit$/m);
  assert.doesNotMatch(workflow, /firefox/i);
  for (const source of ['scripts/github-section.mjs', 'locales/uk.json', 'locales/it.json', 'locales/de.json']) {
    assert.doesNotMatch(readFileSync(source, 'utf8'), /firefox/i, source);
  }
});
