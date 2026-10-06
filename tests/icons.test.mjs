import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicSourceBytes } from '../scripts/build.mjs';
import { languages, pages, readCatalogs, renderPage } from '../scripts/i18n.mjs';
import { arrowUpRight } from '../scripts/icons.mjs';

test('diagonal link arrows use one decorative, non-focusable SVG without font glyphs', () => {
  assert.match(arrowUpRight, /^<svg class="arrow-icon"/);
  assert.match(arrowUpRight, /viewBox="0 0 24 24"/);
  assert.match(arrowUpRight, /aria-hidden="true" focusable="false"/);
  assert.match(arrowUpRight, /<path d="M5 19 19 5M5 5h14v14" \/>/);
  assert.doesNotMatch(arrowUpRight, /↗|<text|<use|href=|tabindex=|<title/);
});

test('every language and page replaces template and generated diagonal arrows consistently', async () => {
  const sources = await publicSourceBytes();
  const template = sources.get('index.html').toString('utf8');
  const catalogs = readCatalogs(template, sources);
  const github = JSON.parse(sources.get('data/github-stats.json').toString('utf8'));
  const ai = JSON.parse(sources.get('data/ai-stats.json').toString('utf8'));
  const claude = JSON.parse(sources.get('data/claude-stats.json').toString('utf8'));
  const counts = { home: 4, projects: 2 + github.projects.length + 1, ai: 1 };
  for (const { code } of languages) for (const { key: page } of pages) {
    const html = renderPage(template, code, catalogs.get(code), github, ai, { page, sources, claudeSnapshot: claude });
    assert.equal(html.split(arrowUpRight).length - 1, counts[page], `${code}/${page}: shared icon markup`);
    assert.doesNotMatch(html, /↗|<!-- arrow-up-right -->/, `${code}/${page}: no remaining glyphs or markers`);
    if (page === 'home') {
      assert.equal((html.match(/class="contact-arrow" aria-hidden="true"><svg/g) ?? []).length, 3);
      assert.match(html, /href="#contact"><span>[^<]+<\/span> <svg class="arrow-icon"/);
    }
    if (page === 'projects') {
      assert.equal((html.match(/target="_blank" rel="noopener noreferrer"/g) ?? []).length, github.projects.length + 2);
      assert.match(html, /<\/svg><span class="sr-only">[^<]+<\/span><\/a>/, 'new-tab announcement is preserved');
    }
  }
});
