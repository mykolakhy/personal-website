import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { aggregateClaudeCache, validateClaudeSnapshot, latestClaudeSnapshot, claudeSnapshotURL, claudeTokenKeys } from '../scripts/claude-data.mjs';
import { collectClaudeStats, saveClaudeStats } from '../scripts/collect-claude-stats.mjs';
import { claudeEnglish, renderClaudeStats } from '../scripts/claude-section.mjs';
import { publishAIStats } from '../scripts/publish-ai-stats.mjs';
import { publicSourceBytes } from '../scripts/build.mjs';
import { readCatalogs, renderPage, escapeHTML } from '../scripts/i18n.mjs';

const now = new Date('2026-10-03T12:00:00.000Z');
const raw = () => ({ version: 5, lastComputedDate: '2026-09-30', firstSessionDate: '2026-08-13T17:55:41.457Z', totalSessions: 2, modelUsage: { 'claude-sonnet-5': { inputTokens: 10, outputTokens: 20, cacheReadInputTokens: 1000, cacheCreationInputTokens: 100, costUSD: 123 } }, dailyActivity: [{ date: '2026-08-13', sessionCount: 2, messageCount: 12, toolCallCount: 4 }, { date: '2026-09-30', sessionCount: 0, messageCount: 1, toolCallCount: 1 }], longestSession: { sessionId: 'PRIVATE-ID', duration: 999999999 }, dailyModelTokens: [{ date: '2026-09-30', tokensByModel: { 'private-model': 9999 } }], messages: ['PRIVATE-PROMPT'], projectPath: '/PRIVATE-PROJECT', accessToken: 'PRIVATE-TOKEN' });
const sample = () => aggregateClaudeCache(raw(), now);
const saved = JSON.parse(await readFile('data/claude-stats.json', 'utf8'));

test('Claude cache aggregation strips private metadata and preserves the cache date, not the import date', () => {
  const d = sample();
  assert.equal(d.updatedAt, now.toISOString()); assert.equal(d.computedThrough, '2026-09-30');
  assert.equal(d.coverageStart, '2026-08-13');
  assert.deepEqual(d.models, ['claude-sonnet-5']);
  assert.deepEqual(d.summary, { sessions: 2, activeDays: 2, inputTokens: 10, outputTokens: 20, cacheReadInputTokens: 1000, cacheCreationInputTokens: 100 });
  assert.deepEqual(d.months[0], { month: '2026-09', sessions: 0, activeDays: 1 });
  assert.deepEqual(d.months[1], { month: '2026-08', sessions: 2, activeDays: 1 });
  assert.ok(d.months.slice(2).every(month => month.sessions === null && month.activeDays === null));
  assert.doesNotMatch(JSON.stringify(d), /PRIVATE|sessionId|longestSession|messageCount|toolCallCount|dailyModelTokens|costUSD|accessToken|projectPath/);
});

test('saved Claude statistics contain only the validated aggregate schema', () => {
  assert.equal(validateClaudeSnapshot(saved), saved);
  assert.equal(saved.months.length, 12);
  assert.doesNotMatch(JSON.stringify(saved), /sessionId|messageCount|toolCallCount|longestSession|costUSD|accessToken|\/Users\//);
  for (const key of claudeTokenKeys) assert.ok(Number.isSafeInteger(saved.summary[key]));
});

test('unrecognized versions, custom model labels and missing counters fail closed', () => {
  for (const change of [d => d.version = 6, d => delete d.totalSessions, d => d.totalSessions = 1, d => d.modelUsage['PRIVATE-PROJECT'] = d.modelUsage['claude-sonnet-5'], d => delete d.modelUsage['claude-sonnet-5'].inputTokens, d => d.modelUsage['claude-sonnet-5'].inputTokens = -1, d => d.modelUsage['claude-sonnet-5'].outputTokens = Number.MAX_SAFE_INTEGER + 1, d => d.modelUsage = {}, d => d.firstSessionDate = 'invalid', d => d.lastComputedDate = '2026-10-04', d => d.dailyActivity.push(d.dailyActivity[0]), d => d.dailyActivity[0].date = '2026-02-30', d => delete d.dailyActivity[0].messageCount, d => d.dailyActivity[0].sessionCount = '2']) {
    const d = raw(); change(d); assert.throws(() => aggregateClaudeCache(d, now), /Invalid public Claude snapshot/);
  }
});

test('calendar aggregation handles leap dates, year rollover and more than twelve months', () => {
  const d = raw(); d.firstSessionDate = '2023-01-01T00:00:00.000Z'; d.lastComputedDate = '2024-03-01';
  d.dailyActivity = [{ date: '2023-01-01', sessionCount: 1, messageCount: 1, toolCallCount: 0 }, { date: '2024-02-29', sessionCount: 1, messageCount: 1, toolCallCount: 0 }];
  const result = aggregateClaudeCache(d, new Date('2024-03-02T00:00:00.000Z'));
  assert.equal(result.months.at(-1).month, '2023-04');
  assert.deepEqual(result.months[1], { month: '2024-02', sessions: 1, activeDays: 1 });
  assert.equal(result.summary.sessions, 2); assert.equal(result.months.reduce((s,m) => s + m.sessions, 0), 1);
});

test('publication validation rejects extra fields, fabricated coverage and incoherent totals', async () => {
  for (const change of [d => d.messages = ['secret'], d => d.models.push('private-project'), d => d.models.push(d.models[0]), d => d.updatedAt = '2026-02-30T12:00:00.000Z', d => d.coverageStart = '2026-10-01', d => d.computedThrough = '2026-10-04', d => d.summary.sessions = 1, d => d.summary.activeDays = 1, d => d.summary.inputTokens = null, d => d.summary.inputTokens = Number.MAX_SAFE_INTEGER + 1, d => d.months.reverse(), d => d.months.pop(), d => d.months[0].activeDays = 31, d => d.months[2].sessions = 0, d => d.months[0].sessionId = 'secret']) {
    const d = sample(); change(d); assert.throws(() => validateClaudeSnapshot(d), /Invalid public Claude snapshot/);
  }
  await assert.rejects(saveClaudeStats({ ...saved, private: 'never-save' }), /Invalid public Claude snapshot/);
});

test('collector reads only the bounded regular aggregate cache and redacts failures', async context => {
  const directory = await mkdtemp(resolve(await realpath(tmpdir()), 'claude-cache-test-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = resolve(directory, 'stats-cache.json');
  await writeFile(path, JSON.stringify(raw()));
  assert.deepEqual(await collectClaudeStats({ path, now }), sample());
  const linked = resolve(directory, 'link.json'); await symlink(path, linked);
  for (const bad of [linked, resolve(directory, 'missing-PRIVATE-FILE'), directory]) await assert.rejects(collectClaudeStats({ path: bad }), error => !/PRIVATE|\/tmp|ENOENT/.test(error.message));
  await writeFile(path, 'PRIVATE invalid JSON');
  await assert.rejects(collectClaudeStats({ path }), error => !error.message.includes('PRIVATE'));
  await writeFile(path, 'x'.repeat(2 * 1024 * 1024 + 1));
  await assert.rejects(collectClaudeStats({ path }), /could not be read/);
});

test('remote Claude snapshots are anonymous, bounded, validated and cannot regress coverage', async () => {
  const newer = sample(); newer.updatedAt = '2026-10-03T12:00:01.000Z';
  assert.deepEqual(await latestClaudeSnapshot(sample(), async (url, options) => { assert.equal(url, claudeSnapshotURL); assert.equal(options.credentials, 'omit'); assert.equal(options.headers, undefined); return new Response(JSON.stringify(newer)); }), newer);
  const olderCoverage = sample(); olderCoverage.computedThrough = '2026-09-29'; olderCoverage.updatedAt = newer.updatedAt;
  const fallback = sample();
  for (const body of ['invalid', 'x'.repeat(20001), JSON.stringify({ ...newer, sessionId: 'private' }), JSON.stringify(olderCoverage)]) assert.equal(await latestClaudeSnapshot(fallback, async () => new Response(body)), fallback);
  assert.equal(await latestClaudeSnapshot(fallback, async () => new Response('', { status: 404 })), fallback);
});

test('all languages render provider separation, exact counts, coverage and inaccessible-month semantics', async () => {
  const sources = await publicSourceBytes(), template = sources.get('index.html').toString('utf8'), catalogs = readCatalogs(template, sources);
  for (const code of ['en','uk','it','de']) {
    const html = renderPage(template, code, catalogs.get(code), null, null, { page: 'ai', sources, claudeSnapshot: saved });
    const section = html.match(/<section id="claude-activity"([\s\S]*?)<\/section>/)[1];
    assert.equal([...section.matchAll(/data-claude-metric=/g)].length, 6);
    assert.equal([...section.matchAll(/data-claude-month=/g)].length, 12);
    for (const key of Object.keys(saved.summary)) assert.ok(section.includes(`value="${saved.summary[key]}"`));
    assert.ok(section.includes(`data-claude-through datetime="${saved.computedThrough}"`));
    assert.ok(html.indexOf('id="ai-activity"') < html.indexOf('id="claude-activity"'));
    assert.doesNotMatch(section, /undefined|data-i18n|sessionId|iframe|<script/);
    for (const month of saved.months.filter(m => m.sessions === null)) assert.doesNotMatch(section.match(new RegExp(`data-claude-month="${month.month}"([\\s\\S]*?)</div>`))[1], /<data|<meter/);
  }
  const attack = renderClaudeStats(saved, 'en', { ...claudeEnglish, 'aiStats.methodTitle': 'About these numbers', 'aiStats.noData': 'Unavailable', 'claudeStats.method': '<script>secret</script>' });
  assert.match(attack, /&lt;script&gt;/); assert.doesNotMatch(attack, /<script>/);
  assert.match(renderClaudeStats(null, 'en'), /unavailable/);
});

test('combined publication uploads only the two aggregates and triggers one main rebuild', async () => {
  const calls = [];
  const ai = JSON.parse(await readFile('data/ai-stats.json', 'utf8'));
  const clock = new Date(saved.updatedAt); ai.updatedAt = clock.toISOString();
  await publishAIStats({ confirmed: true, includeClaude: true, now: clock, readSources: async () => new Map([['data/ai-stats.json', Buffer.from(JSON.stringify(ai))], ['data/claude-stats.json', Buffer.from(JSON.stringify(saved))]]), fetcher: async url => new Response(JSON.stringify(url === claudeSnapshotURL ? saved : ai)), run: (command,args) => { assert.equal(command,'gh'); calls.push(args); return args[0] === 'api' ? JSON.stringify({ draft: false, assets: [{ name: 'ai-stats.json' }, { name: 'claude-stats.json' }] }) : ''; } });
  const upload = calls.find(args => args[1] === 'upload');
  assert.equal(upload.filter(arg => arg.endsWith('/ai-stats.json')).length, 1);
  assert.equal(upload.filter(arg => arg.endsWith('/claude-stats.json')).length, 1);
  assert.equal(calls.filter(args => args[0] === 'workflow').length, 1);
  assert.ok(calls.at(-1).includes('main'));
  assert.doesNotMatch(JSON.stringify(calls), /stats-cache|auth.json|\.claude|git push/);
});

test('public AI copy identifies the owner, keeps local scope in the disclosure and shows coverage only once', async () => {
  const sources = await publicSourceBytes(), template = sources.get('index.html').toString('utf8'), catalogs = readCatalogs(template, sources);
  const ai = JSON.parse(sources.get('data/ai-stats.json').toString('utf8'));
  const labels = { en: 'Claude Code activity', uk: 'Активність Claude Code', it: 'Attività con Claude Code', de: 'Aktivität mit Claude Code' };
  for (const [code, label] of Object.entries(labels)) {
    const catalog = catalogs.get(code);
    const html = renderPage(template, code, catalog, null, ai, { page: 'ai', sources, claudeSnapshot: saved });
    const section = html.match(/<section id="claude-activity"([\s\S]*?)<\/section>/)[1];
    const mainCopy = section.replace(/<details\b[\s\S]*?<\/details>/, '');
    assert.ok(mainCopy.includes(label));
    assert.ok(mainCopy.includes(escapeHTML(catalog['claudeStats.intro'])));
    assert.ok(section.includes(escapeHTML(catalog['claudeStats.method'])));
    assert.doesNotMatch(mainCopy, /this Mac|цей Mac|questo Mac|dieser Mac|Cache computed|Кеш обчислено|Cache calcolata|Cache berechnet/);
    assert.equal([...section.matchAll(new RegExp(`datetime="${saved.computedThrough}"`, 'g'))].length, 1);
    assert.ok(section.includes(`data-claude-through datetime="${saved.computedThrough}"`));
    assert.ok(section.includes(`datetime="${saved.updatedAt}"`));
    const unit = escapeHTML(catalog['claudeStats.sessionsUnit']);
    assert.ok(section.includes(`aria-valuetext="${unit}: `));
    const openAI = html.match(/<section id="ai-activity"([\s\S]*?)<\/section>/)[1];
    assert.doesNotMatch(openAI, /Current month|Поточний місяць|Mese corrente|Aktueller Monat/);
    assert.ok(openAI.includes(escapeHTML(catalog['aiStats.monthlyNote'])));
    assert.ok(html.includes(escapeHTML(catalog['meta.aiDescription'])));
  }
});

test('monthly Claude cards label session starts and explain active days and the actual comparison scale in every language', async () => {
  const sources = await publicSourceBytes(), catalogs = readCatalogs(sources.get('index.html').toString('utf8'), sources);
  const maximum = Math.max(...saved.months.map(month => month.sessions ?? 0));
  for (const code of ['en', 'uk', 'it', 'de']) {
    const catalog = catalogs.get(code), html = renderClaudeStats(saved, code, catalog);
    const scale = catalog['claudeStats.scaleNote'];
    assert.equal(scale.split('{maximum}').length, 2);
    assert.ok(html.includes(escapeHTML(scale.replace('{maximum}', new Intl.NumberFormat(code).format(maximum)))));
    assert.ok(html.includes(escapeHTML(catalog['claudeStats.activeDaysNote'])));
    assert.doesNotMatch(html, /\{maximum\}|undefined/);
    for (const month of saved.months) {
      const card = html.match(new RegExp(`data-claude-month="${month.month}"([\\s\\S]*?)</div>`))[1];
      if (month.sessions === null) {
        assert.doesNotMatch(card, /ai-month-unit|<data|<meter/);
      } else {
        assert.ok(card.includes(`<span class="ai-month-unit">${escapeHTML(catalog['claudeStats.sessionsUnit'])}</span>`));
        assert.ok(card.includes(`max="${maximum}" value="${month.sessions}"`));
        assert.match(card, /aria-describedby="claude-month-scale"/);
      }
    }
  }
});

test('Claude comparison scale follows changing data without inventing a maximum for zero counts', () => {
  const single = sample(); single.summary.sessions = 1; single.months[1].sessions = 1;
  const html = renderClaudeStats(single, 'en');
  assert.match(html, /Highest monthly session-start count across all 12 months: 1\./);
  assert.match(html, /max="1" value="1"/);
  const empty = sample(); empty.summary.sessions = 0; empty.months[1].sessions = 0;
  const zero = renderClaudeStats(empty, 'en');
  assert.equal([...zero.matchAll(/class="ai-month-unit"/g)].length, 2);
  assert.doesNotMatch(zero, /id="claude-month-scale"|aria-describedby="claude-month-scale"|Highest monthly/);
  assert.match(zero, /max="1" value="0"/);
  const attack = renderClaudeStats(saved, 'en', { ...claudeEnglish, 'aiStats.methodTitle': 'About these numbers', 'aiStats.noData': 'No data', 'claudeStats.scaleNote': '<script>{maximum}</script>' });
  assert.match(attack, /&lt;script&gt;24&lt;\/script&gt;/);
  assert.doesNotMatch(attack, /<script>/);
});
