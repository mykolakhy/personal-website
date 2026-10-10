import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertAIProgress, latestAISnapshot, aiSnapshotURL, recentMonths } from '../scripts/ai-data.mjs';
import { assertClaudeProgress, latestClaudeSnapshot, claudeSnapshotURL, claudeSummaryKeys } from '../scripts/claude-data.mjs';
import { publishAIStats } from '../scripts/publish-ai-stats.mjs';

const ai = JSON.parse(await readFile('data/ai-stats.json', 'utf8'));
const claude = JSON.parse(await readFile('data/claude-stats.json', 'utf8'));
const next = value => ({ ...structuredClone(value), updatedAt: new Date(Date.parse(value.updatedAt) + 1000).toISOString() });

test('OpenAI updates reject cumulative regression and disappearing metrics, not a shorter current streak', async () => {
  for (const key of ['lifetimeTokens', 'peakDailyTokens', 'longestRunningTurnSec', 'longestStreakDays']) {
    for (const value of [0, null]) {
      const candidate = next(ai); candidate.months = null;
      candidate.summary[key] = value;
      if (key === 'lifetimeTokens') candidate.summary.peakDailyTokens = 0;
      if (key === 'longestStreakDays') candidate.summary.currentStreakDays = 0;
      assert.throws(() => assertAIProgress(candidate, ai), /regressed/);
      assert.equal(await latestAISnapshot(ai, async () => new Response(JSON.stringify(candidate))), ai);
    }
  }
  const candidate = next(ai); candidate.summary.currentStreakDays = 0;
  candidate.months = candidate.months.map(month => ({ ...month, tokens: 0, activeDays: 0 }));
  assert.deepEqual(await latestAISnapshot(ai, async () => new Response(JSON.stringify(candidate))), candidate);
  const rollover = next(ai); rollover.updatedAt = '2026-11-01T00:00:00.000Z';
  rollover.months = recentMonths(rollover.updatedAt).map(month => ({ month, tokens: 0, activeDays: 0 }));
  assert.equal(assertAIProgress(rollover, ai), rollover);
});

test('Claude updates reject every cumulative counter decrease and narrowed coverage', async () => {
  for (const key of claudeSummaryKeys) {
    const candidate = next(claude);
    candidate.months = candidate.months.map(month => month.sessions === null ? month : { ...month, sessions: 0, activeDays: 0 });
    candidate.summary[key] = 0;
    assert.throws(() => assertClaudeProgress(candidate, claude), /regressed/);
    assert.equal(await latestClaudeSnapshot(claude, async () => new Response(JSON.stringify(candidate))), claude);
  }
  const narrower = next(claude); narrower.coverageStart = '2026-08-14';
  assert.throws(() => assertClaudeProgress(narrower, claude), /regressed/);
  const sameCache = next(claude);
  assert.deepEqual(await latestClaudeSnapshot(claude, async () => new Response(JSON.stringify(sameCache))), sameCache);
});

function publication(options = {}) {
  const clock = new Date('2026-10-09T12:00:00.000Z');
  const currentAI = structuredClone(ai); currentAI.updatedAt = clock.toISOString();
  const currentClaude = structuredClone(claude); currentClaude.updatedAt = clock.toISOString();
  const calls = [];
  const previousAI = structuredClone(currentAI), previousClaude = structuredClone(currentClaude);
  previousAI.updatedAt = new Date(clock.getTime() - 1000).toISOString();
  previousClaude.updatedAt = previousAI.updatedAt;
  const configuration = {
    confirmed: true, includeClaude: true, now: clock,
    readSources: async () => new Map([['data/ai-stats.json', Buffer.from(JSON.stringify(currentAI))], ['data/claude-stats.json', Buffer.from(JSON.stringify(currentClaude))]]),
    run: (_command, args) => { calls.push(args); return args[0] === 'api' ? JSON.stringify({ draft: false, assets: [{ name: 'ai-stats.json' }, { name: 'claude-stats.json' }] }) : ''; },
    fetcher: async (url, request) => {
      assert.equal(request.credentials, 'omit'); assert.equal(request.headers, undefined);
      assert.ok([aiSnapshotURL, claudeSnapshotURL].includes(url));
      return new Response(JSON.stringify(url === aiSnapshotURL ? previousAI : previousClaude));
    }, ...options,
  };
  return { currentAI, currentClaude, previousAI, previousClaude, calls, configuration, publish: () => publishAIStats(configuration) };
}

test('publication compares both public assets before uploading and dispatches exactly once', async () => {
  const p = publication(); await p.publish();
  assert.deepEqual(p.calls.map(args => args[0]), ['api', 'release', 'workflow']);
  assert.equal(p.calls.filter(args => args[0] === 'workflow').length, 1);
  assert.ok(p.calls.at(-1).includes('main'));
});

test('publication blocks both assets if either public cumulative counter regresses', async () => {
  for (const provider of ['openai', 'claude']) {
    const p = publication();
    if (provider === 'openai') p.previousAI.summary.lifetimeTokens += 1;
    else p.previousClaude.summary.inputTokens += 1;
    await assert.rejects(p.publish(), /comparison failed/);
    assert.deepEqual(p.calls.map(args => args[0]), ['api']);
  }
});

test('unavailable, malformed, oversized or private public data never permits publication', async () => {
  for (const fetcher of [async () => { throw new Error('PRIVATE-TOKEN'); }, async () => new Response('missing', { status: 404 }), async () => new Response('not JSON'), async () => new Response('x'.repeat(20001)), async () => new Response(JSON.stringify({ ...ai, accessToken: 'PRIVATE-TOKEN' }))]) {
    const p = publication({ fetcher });
    await assert.rejects(p.publish(), error => /comparison failed/.test(error.message) && !error.message.includes('PRIVATE'));
    assert.deepEqual(p.calls.map(args => args[0]), ['api']);
  }
});

test('an unavailable Claude comparison blocks the OpenAI upload as well', async () => {
  const p = publication();
  const fetcher = p.configuration.fetcher;
  p.configuration.fetcher = (url, request) => url === claudeSnapshotURL ? new Response('', { status: 404 }) : fetcher(url, request);
  await assert.rejects(p.publish(), /comparison failed/);
  assert.deepEqual(p.calls.map(args => args[0]), ['api']);
});

test('OpenAI-only publication never requests or uploads Claude data', async () => {
  const p = publication({ includeClaude: false });
  const fetcher = p.configuration.fetcher;
  p.configuration.fetcher = (url, request) => { assert.equal(url, aiSnapshotURL); return fetcher(url, request); };
  await p.publish();
  assert.equal(p.calls[1].filter(arg => arg.endsWith('/ai-stats.json')).length, 1);
  assert.equal(p.calls[1].filter(arg => arg.endsWith('/claude-stats.json')).length, 0);
});

test('metadata failures, draft releases and missing OpenAI assets fail closed', async () => {
  for (const result of [null, 'null', 'false', '0', 'invalid JSON', JSON.stringify({ draft: true, assets: [] }), JSON.stringify({ draft: false, assets: [] })]) {
    const calls = [], p = publication({ run: (_command, args) => { calls.push(args); if (result === null) throw new Error('PRIVATE-TOKEN'); return result; } });
    await assert.rejects(p.publish(), error => /Cannot verify/.test(error.message) && !error.message.includes('PRIVATE'));
    assert.equal(calls.length, 1);
  }
});

test('only a confirmed missing release or Claude asset allows first publication', async () => {
  const missingRelease = publication();
  missingRelease.configuration.run = (_command, args) => {
    missingRelease.calls.push(args);
    if (args[0] === 'api') throw Object.assign(new Error('not found'), { stderr: 'gh: Not Found (HTTP 404)' });
    return '';
  };
  missingRelease.configuration.fetcher = async () => { throw new Error('Unexpected fetch'); };
  await missingRelease.publish();
  assert.equal(missingRelease.calls[1][1], 'create');
  const missingClaude = publication();
  missingClaude.configuration.run = (_command, args) => { missingClaude.calls.push(args); return args[0] === 'api' ? JSON.stringify({ draft: false, assets: [{ name: 'ai-stats.json' }] }) : ''; };
  const fetcher = missingClaude.configuration.fetcher;
  missingClaude.configuration.fetcher = (url, request) => { assert.equal(url, aiSnapshotURL); return fetcher(url, request); };
  await missingClaude.publish();
  assert.equal(missingClaude.calls[1][1], 'upload');
});

test('publication requires fresh collection and numeric lifetime tokens before any remote action', async () => {
  for (const change of [p => p.currentAI.updatedAt = '2026-10-08T12:00:00.000Z', p => p.currentClaude.updatedAt = '2026-10-09T11:44:59.000Z', p => p.currentAI.updatedAt = '2026-10-09T12:05:01.000Z', p => p.currentAI.summary.lifetimeTokens = null]) {
    const p = publication(); change(p);
    await assert.rejects(p.publish(), /collected within|numeric lifetime/);
    assert.equal(p.calls.length, 0);
  }
});

test('metric corrections require an explicit option and cannot backdate collection or cache', async () => {
  const p = publication(); p.previousAI.summary.lifetimeTokens += 1; p.previousClaude.summary.inputTokens += 1;
  await assert.rejects(p.publish(), /comparison failed/);
  p.configuration.allowMetricCorrection = true; await p.publish();
  for (const change of [p => p.previousAI.updatedAt = '2026-10-09T12:00:01.000Z', p => p.previousClaude.computedThrough = '2026-10-01']) {
    const p = publication({ allowMetricCorrection: true }); change(p);
    if (p.previousClaude.computedThrough === '2026-10-01') p.previousClaude.months = recentMonths('2026-10-01T00:00:00.000Z').map(month => month < p.previousClaude.coverageStart.slice(0, 7) ? { month, sessions: null, activeDays: null } : { month, sessions: 0, activeDays: 0 });
    await assert.rejects(p.publish(), /comparison failed/);
    assert.deepEqual(p.calls.map(args => args[0]), ['api']);
  }
});
