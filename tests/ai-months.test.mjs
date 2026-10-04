import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicSourceBytes } from '../scripts/build.mjs';
import { readCatalogs, escapeHTML } from '../scripts/i18n.mjs';
import { renderAIStats } from '../scripts/ai-section.mjs';
import { renderClaudeStats } from '../scripts/claude-section.mjs';
import { renderMonthlyHistory, monthlyEnglish } from '../scripts/ai-months.mjs';

test('both providers split twelve months into three recent cards and nine closed older cards in every language', async () => {
  const sources = await publicSourceBytes(), catalogs = readCatalogs(sources.get('index.html').toString('utf8'), sources);
  for (const code of ['en', 'uk', 'it', 'de']) for (const [id, render] of [['ai', renderAIStats], ['claude', renderClaudeStats]]) {
    const catalog = catalogs.get(code), data = JSON.parse(sources.get(`data/${id}-stats.json`).toString('utf8'));
    const html = render(data, code, catalog), marker = new RegExp(`data-${id}-month="([^"]+)"`, 'g');
    const recent = html.match(/<dl class="ai-months ai-months-recent"[\s\S]*?<\/dl>/)[0];
    const older = html.match(/<details class="ai-month-history">[\s\S]*?<\/details>/)[0];
    assert.deepEqual([...recent.matchAll(marker)].map(match => match[1]), data.months.slice(0, 3).map(month => month.month));
    assert.deepEqual([...older.matchAll(marker)].map(match => match[1]), data.months.slice(3).map(month => month.month));
    assert.doesNotMatch(older, /<details[^>]*\bopen\b|disclosure-mark/);
    assert.ok(older.includes(`aria-controls="${id}-older-months"`));
    assert.ok(older.includes(`id="${id}-older-months"`));
    for (const key of ['recentNote', 'readData', 'expand', 'collapse']) assert.ok(html.includes(escapeHTML(catalog[`monthHistory.${key}`])));
    const help = html.match(/<details class="ai-stats-method ai-month-help">[\s\S]*?<\/details>/)[0];
    assert.ok(help.includes(escapeHTML(catalog[`${id === 'ai' ? 'aiStats' : 'claudeStats'}.method`])));
    const maximum = Math.max(0, ...data.months.map(month => (id === 'ai' ? month.tokens : month.sessions) ?? 0));
    for (const meter of html.matchAll(/<meter[^>]+>/g)) assert.ok(meter[0].includes(`max="${Math.max(1, maximum)}"`));
    assert.doesNotMatch(html, /undefined|\{maximum\}|<script|Показано 3 з 12|Ще 9 місяців/);
  }
});

test('the history renderer escapes copy and rejects invalid providers or incomplete month lists', () => {
  const options = { id: 'ai', title: '<unsafe>', cards: Array(12).fill('<div></div>'), help: '', catalog: { ...monthlyEnglish, 'monthHistory.expand': '<script>bad</script>' } };
  const html = renderMonthlyHistory(options);
  assert.match(html, /&lt;unsafe&gt;/); assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
  for (const change of [{ id: '<unsafe>' }, { cards: Array(3).fill('') }]) assert.throws(() => renderMonthlyHistory({ ...options, ...change }), /twelve monthly cards/);
});

test('a maximum in hidden history still determines the scale of the three visible months', async () => {
  const sources = await publicSourceBytes();
  for (const [id, render, metric] of [['ai', renderAIStats, 'tokens'], ['claude', renderClaudeStats, 'sessions']]) {
    const data = JSON.parse(sources.get(`data/${id}-stats.json`).toString('utf8'));
    if (id === 'claude') data.coverageStart = `${data.months.at(-1).month}-01`;
    data.months = data.months.map((month, index) => ({
      month: month.month, [metric]: index === 5 ? 1000 : 1, activeDays: 1,
    }));
    data.summary[id === 'ai' ? 'lifetimeTokens' : 'sessions'] = Math.max(1011, data.summary[id === 'ai' ? 'lifetimeTokens' : 'sessions']);
    if (id === 'claude') data.summary.activeDays = Math.max(12, data.summary.activeDays);
    const html = render(data, 'en');
    const recent = html.match(/<dl class="ai-months ai-months-recent"[\s\S]*?<\/dl>/)[0];
    const meters = [...recent.matchAll(/<meter[^>]+>/g)];
    assert.equal(meters.length, 3);
    for (const [meter] of meters) { assert.match(meter, /max="1000"/); assert.match(meter, /value="1"/); }
    assert.ok(html.includes('across all 12 months: 1,000.'));
  }
});
