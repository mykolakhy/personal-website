import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { aggregateAIUsage, validateAISnapshot, recentMonths, summaryKeys, latestAISnapshot, aiSnapshotURL } from '../scripts/ai-data.mjs';
import { readAccountUsage, saveAIStats } from '../scripts/collect-ai-stats.mjs';
import { publishAIStats } from '../scripts/publish-ai-stats.mjs';
import { aiEnglish, renderAIStats } from '../scripts/ai-section.mjs';
import { publicSourceBytes } from '../scripts/build.mjs';
import { readCatalogs, renderPage, escapeHTML } from '../scripts/i18n.mjs';

const saved = JSON.parse(await readFile('data/ai-stats.json', 'utf8'));
const copy = () => structuredClone(saved);
const now = new Date('2026-10-02T12:00:00.000Z');
const response = () => ({ summary: { lifetimeTokens: 1000, peakDailyTokens: 900, longestRunningTurnSec: 63603, longestStreakDays: 31, currentStreakDays: 8 }, dailyUsageBuckets: [{ startDate: '2026-10-01', tokens: 900 }, { startDate: '2026-10-02', tokens: 100 }] });

test('saved AI data contains only the approved schema and twelve ordered months', () => {
  assert.equal(validateAISnapshot(saved), saved);
  assert.deepEqual(saved.months.map(month => month.month), recentMonths(saved.updatedAt));
  assert.doesNotMatch(JSON.stringify(saved), /threadUsage|accountId|email|accessToken|title|prompt|auth\.json|\/Users\//);
  assert.ok(saved.months.reduce((sum, month) => sum + month.tokens, 0) <= saved.summary.lifetimeTokens);
});

test('aggregation discards all private metadata and groups exact daily values', () => {
  const raw = response();
  raw.account = { email: 'private-email', accessToken: 'private-token' };
  raw.threadUsage = [{ title: 'private-task', cwd: '/private/project', tokens: 1000 }];
  raw.summary.secret = 'private-token';
  const value = aggregateAIUsage(raw, now);
  assert.deepEqual(value.summary, response().summary);
  assert.deepEqual(value.months[0], { month: '2026-10', tokens: 1000, activeDays: 2 });
  assert.ok(value.months.slice(1).every(month => month.tokens === 0 && month.activeDays === 0));
  assert.doesNotMatch(JSON.stringify(value), /private|"account":|email|threadUsage|secret/);
  assert.equal(value.updatedAt, now.toISOString());
});

test('missing metrics and missing history stay null, unlike genuine zero values', () => {
  const unavailable = aggregateAIUsage({ summary: Object.fromEntries(summaryKeys.map(key => [key, null])), dailyUsageBuckets: null }, now);
  assert.equal(unavailable.months, null);
  const html = renderAIStats(unavailable, 'en');
  assert.equal([...html.matchAll(/data-ai-month="/g)].length, 12);
  assert.doesNotMatch(html, /<meter|data-ai-month-tokens|value="0"/);
  assert.doesNotMatch(html, /ai-month-unit|id="ai-month-scale"|aria-describedby="ai-month-scale"/);
  assert.match(html, /Missing data is not shown as zero/);
  const empty = aggregateAIUsage({ summary: Object.fromEntries(summaryKeys.map(key => [key, 0])), dailyUsageBuckets: [] }, now);
  assert.ok(empty.months.every(month => month.tokens === 0));
  assert.match(renderAIStats(empty, 'en'), /data-ai-month-tokens/);
  assert.equal([...renderAIStats(empty, 'en').matchAll(/<meter /g)].length, 12);
  assert.doesNotMatch(renderAIStats(empty, 'en'), /id="ai-month-scale"|aria-describedby="ai-month-scale"|Highest monthly/);
});

test('aggregation handles leap days, year rollover, unsorted buckets and older history', () => {
  const raw = response(); raw.summary.lifetimeTokens = 2000;
  raw.dailyUsageBuckets = [{ startDate: '2024-02-29', tokens: 100 }, { startDate: '2024-01-15', tokens: 300 }, { startDate: '2022-10-01', tokens: 1000 }];
  const value = aggregateAIUsage(raw, new Date('2024-03-01T00:00:00.000Z'));
  assert.deepEqual(value.months[1], { month: '2024-02', tokens: 100, activeDays: 1 });
  assert.equal(value.months.at(-1).month, '2023-04');
  assert.equal(value.months.reduce((sum, month) => sum + month.tokens, 0), 400);
});

test('invalid, duplicate and future daily values fail instead of publishing partial statistics', () => {
  for (const mutate of [raw => delete raw.summary, raw => delete raw.summary.lifetimeTokens, raw => delete raw.dailyUsageBuckets, raw => raw.dailyUsageBuckets = {}, raw => raw.dailyUsageBuckets.push(raw.dailyUsageBuckets[0]), raw => raw.dailyUsageBuckets[0].startDate = '2026-02-30', raw => raw.dailyUsageBuckets[0].startDate = '2026-10-03', raw => raw.dailyUsageBuckets[0].tokens = -1, raw => raw.dailyUsageBuckets[0].tokens = '100', raw => raw.summary.lifetimeTokens = 1]) {
    const raw = response(); mutate(raw);
    assert.throws(() => aggregateAIUsage(raw, now), /Invalid public AI snapshot/);
  }
});

test('publication schema rejects extra keys, bad dates, incoherent counts and unsafe numbers', async () => {
  for (const mutate of [value => value.token = 'secret', value => value.source = 'untrusted', value => value.updatedAt = '2026-02-30T00:00:00.000Z', value => value.summary.email = 'secret', value => value.summary.currentStreakDays = 999, value => value.summary.peakDailyTokens = Number.MAX_SAFE_INTEGER, value => value.summary.longestRunningTurnSec = -1, value => value.months.reverse(), value => value.months[0] = null, value => value.months[0].activeDays = 999, value => value.months[0].prompt = 'secret', value => value.months[0].tokens = Number.MAX_SAFE_INTEGER + 1, value => value.months.pop()]) {
    const value = copy(); mutate(value);
    assert.throws(() => validateAISnapshot(value), /Invalid public AI snapshot/);
  }
  await assert.rejects(saveAIStats({ ...saved, auth: 'never-persist' }), /Invalid public AI snapshot/);
});

function fakeServer(reply, calls) {
  return (command, args, options) => {
    assert.equal(command, 'codex'); assert.deepEqual(args, ['app-server', '--listen', 'stdio://']);
    assert.deepEqual(options.stdio, ['pipe', 'pipe', 'ignore']);
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.killed = false;
    child.kill = () => { child.killed = true; child.stdout.end(); };
    child.stdin = new Writable({ write(chunk, encoding, done) {
      const request = JSON.parse(String(chunk)); calls.push(request);
      queueMicrotask(() => { if (request.method === 'initialize') child.stdout.write(JSON.stringify({ id: 1, result: {} }) + '\n'); else if (request.method === 'account/usage/read' && reply !== null) child.stdout.write(JSON.stringify(reply) + '\n'); });
      done();
    } });
    return child;
  };
}

test('local collector requests only initialization and account aggregates, never chats or login', async () => {
  const calls = [];
  assert.deepEqual(await readAccountUsage({ start: fakeServer({ id: 2, result: response() }, calls) }), response());
  assert.deepEqual(calls.map(call => call.method), ['initialize', 'initialized', 'account/usage/read']);
  assert.doesNotMatch(JSON.stringify(calls), /thread\/|login|logout|token|rateLimit|account\/read/);
});

test('collector failures and timeouts never expose upstream details or replace saved data', async () => {
  const before = await readFile('data/ai-stats.json', 'utf8');
  for (const reply of [{ id: 2, error: { code: -1, message: 'private-token /private/chat' } }, { id: 2, result: { ...response(), threadUsage: 'x'.repeat(8 * 1024 * 1024) } }, null]) {
    await assert.rejects(readAccountUsage({ start: fakeServer(reply, []), timeout: 10 }), error => /could not be read/.test(error.message) && !/private/.test(error.message));
  }
  assert.equal(await readFile('data/ai-stats.json', 'utf8'), before);
});

test('public release updates are bounded, validated, newer, anonymous and optional', async () => {
  const newer = copy(); newer.updatedAt = new Date(Date.parse(saved.updatedAt) + 1000).toISOString();
  assert.deepEqual(await latestAISnapshot(saved, async (url, options) => { assert.equal(url, aiSnapshotURL); assert.equal(options.credentials, 'omit'); assert.equal(options.headers, undefined); return new Response(JSON.stringify(newer)); }), newer);
  assert.equal(await latestAISnapshot(newer, async () => new Response(JSON.stringify(saved))), newer);
  const future = copy(); future.updatedAt = '2099-10-02T12:00:00.000Z'; future.months = recentMonths(future.updatedAt).map(month => ({ month, tokens: 0, activeDays: 0 }));
  for (const body of ['not JSON', 'x'.repeat(20001), JSON.stringify({ ...saved, threadUsage: [] }), JSON.stringify(future)]) assert.equal(await latestAISnapshot(saved, async () => new Response(body)), saved);
  assert.equal(await latestAISnapshot(saved, async () => new Response('', { status: 404 })), saved);
  assert.equal(await latestAISnapshot(saved, async () => { throw new Error('private-token'); }), saved);
});

test('all four languages render exact accessible figures, twelve cards and safe plain text', async () => {
  const sources = await publicSourceBytes(); const template = sources.get('index.html').toString('utf8');
  const catalogs = readCatalogs(template, sources);
  for (const code of ['en', 'uk', 'it', 'de']) {
    const html = renderPage(template, code, catalogs.get(code), null, saved, { page: 'ai', sources });
    const section = html.match(/<section id="ai-activity"([\s\S]*?)<\/section>/)[1];
    assert.equal([...section.matchAll(/data-ai-metric=/g)].length, 5);
    assert.equal([...section.matchAll(/data-ai-month=/g)].length, 12);
    for (const key of summaryKeys) assert.ok(section.includes(`value="${saved.summary[key]}"`));
    for (const month of saved.months) assert.ok(section.includes(`value="${month.tokens}" data-ai-month-tokens`));
    assert.ok(section.includes(catalogs.get(code)['aiStats.method']));
    assert.doesNotMatch(section, /undefined|data-i18n|threadUsage|iframe|fetch\(|<script/);
    assert.equal([...section.matchAll(/ai-month-partial/g)].length, 1);
  }
  const attack = renderAIStats(saved, 'en', { ...aiEnglish, 'aiStats.method': '\"><script>secret</script>' });
  assert.match(attack, /&lt;script&gt;/); assert.doesNotMatch(attack, /<script>/);
  assert.match(renderAIStats(null, 'en'), /currently unavailable/);
});

test('publishing requires explicit confirmation and uses only the fixed repository and main rebuild', async () => {
  await assert.rejects(publishAIStats(), /confirmation/);
  const calls = [];
  await publishAIStats({ confirmed: true, now: new Date(saved.updatedAt), fetcher: async () => new Response(JSON.stringify(saved)), run: (command, args) => { assert.equal(command, 'gh'); calls.push(args); return args[0] === 'api' ? JSON.stringify({ draft: false, assets: [{ name: 'ai-stats.json' }] }) : ''; } });
  assert.deepEqual(calls.map(args => args.slice(0, 2)), [['api', 'repos/mykolakhy/personal-website/releases/tags/ai-activity'], ['release', 'upload'], ['workflow', 'run']]);
  assert.ok(calls[1].includes('mykolakhy/personal-website'));
  assert.ok(calls[1].includes('--clobber'));
  assert.ok(calls.at(-1).includes('main'));
  assert.doesNotMatch(JSON.stringify(calls), /auth\.json|accessToken|threadUsage|git push/);
  await assert.rejects(publishAIStats({ confirmed: true, now: new Date(saved.updatedAt), run: () => { throw new Error('private-token'); } }), error => !error.message.includes('private-token'));
});

test('monthly OpenAI cards identify token units and explain the current comparison maximum in every language', async () => {
  const sources = await publicSourceBytes(), catalogs = readCatalogs(sources.get('index.html').toString('utf8'), sources);
  const maximum = Math.max(...saved.months.map(month => month.tokens));
  for (const code of ['en', 'uk', 'it', 'de']) {
    const catalog = catalogs.get(code), html = renderAIStats(saved, code, catalog);
    const scale = catalog['aiStats.scaleNote'];
    assert.equal(scale.split('{maximum}').length, 2);
    assert.ok(html.includes(escapeHTML(scale.replace('{maximum}', new Intl.NumberFormat(code).format(maximum)))));
    assert.equal([...html.matchAll(new RegExp(`<span class="ai-month-unit">${escapeHTML(catalog['aiStats.tokens'])}</span>`, 'g'))].length, 12);
    assert.equal([...html.matchAll(/aria-describedby="ai-month-scale"/g)].length, 12);
    assert.doesNotMatch(html, /\{maximum\}|undefined/);
  }
  const changed = aggregateAIUsage(response(), now);
  assert.match(renderAIStats(changed, 'en'), /Highest monthly reported token total across all 12 months: 1,000\./);
  assert.match(renderAIStats(changed, 'en'), /max="1000" value="1000"/);
  const attack = renderAIStats(saved, 'en', { ...aiEnglish, 'aiStats.scaleNote': '<script>{maximum}</script>' });
  assert.match(attack, /&lt;script&gt;/); assert.doesNotMatch(attack, /<script>/);
});
