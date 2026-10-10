// The public model contains aggregates only. Never retain threadUsage, account
// identifiers, prompts, thread names, file paths, or credentials from the service.
export const aiStatsFiles = ['data/ai-stats.json'];
export const aiSnapshotURL = 'https://github.com/mykolakhy/personal-website/releases/download/ai-activity/ai-stats.json';
export const summaryKeys = ['lifetimeTokens', 'peakDailyTokens', 'longestRunningTurnSec', 'longestStreakDays', 'currentStreakDays'];
const integer = value => Number.isSafeInteger(value) && value >= 0;
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === allowed.length && Object.keys(value).every(key => allowed.includes(key));
const invalid = () => { throw new Error('Invalid public AI snapshot.'); };

export function recentMonths(updatedAt) {
  const end = new Date(updatedAt);
  return Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - index, 1)).toISOString().slice(0, 7));
}

export function validateAISnapshot(value) {
  if (!keys(value, ['version', 'source', 'updatedAt', 'summary', 'months']) || value.version !== 1 || value.source !== 'codex-account-usage') invalid();
  if (typeof value.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.updatedAt) || !Number.isFinite(Date.parse(value.updatedAt)) || new Date(value.updatedAt).toISOString() !== value.updatedAt) invalid();
  if (!keys(value.summary, summaryKeys) || !summaryKeys.every(key => value.summary[key] === null || integer(value.summary[key]))) invalid();
  if (value.summary.currentStreakDays !== null && value.summary.longestStreakDays !== null && value.summary.currentStreakDays > value.summary.longestStreakDays) invalid();
  if (value.summary.peakDailyTokens !== null && value.summary.lifetimeTokens !== null && value.summary.peakDailyTokens > value.summary.lifetimeTokens) invalid();
  if (value.months !== null) {
    if (!Array.isArray(value.months) || value.months.length !== 12) invalid();
    const expected = recentMonths(value.updatedAt);
    let total = 0;
    for (const [index, month] of value.months.entries()) {
      if (!keys(month, ['month', 'tokens', 'activeDays']) || month.month !== expected[index]) invalid();
      const end = index === 0 ? Number(value.updatedAt.slice(8, 10)) : new Date(Date.UTC(Number(month.month.slice(0, 4)), Number(month.month.slice(5, 7)), 0)).getUTCDate();
      if (!integer(month.tokens) || !integer(month.activeDays) || month.activeDays > end || (month.tokens === 0) !== (month.activeDays === 0) || month.activeDays > month.tokens) invalid();
      total += month.tokens;
      if (!integer(total)) invalid();
    }
    if (value.summary.lifetimeTokens !== null && total > value.summary.lifetimeTokens) invalid();
  }
  return value;
}

export function aggregateAIUsage(result, now = new Date()) {
  if (!result || typeof result !== 'object' || !result.summary || !summaryKeys.every(key => Object.hasOwn(result.summary, key)) || !Object.hasOwn(result, 'dailyUsageBuckets')) invalid();
  const updatedAt = now.toISOString();
  const summary = Object.fromEntries(summaryKeys.map(key => [key, result.summary[key]]));
  let months = null;
  if (result.dailyUsageBuckets !== null) {
    if (!Array.isArray(result.dailyUsageBuckets) || result.dailyUsageBuckets.length > 10000) invalid();
    months = recentMonths(updatedAt).map(month => ({ month, tokens: 0, activeDays: 0 }));
    const dates = new Set();
    for (const bucket of result.dailyUsageBuckets) {
      if (!bucket || !date(bucket.startDate) || !integer(bucket.tokens) || bucket.startDate > updatedAt.slice(0, 10) || dates.has(bucket.startDate)) invalid();
      dates.add(bucket.startDate);
      const month = months.find(item => item.month === bucket.startDate.slice(0, 7));
      if (month) { month.tokens += bucket.tokens; month.activeDays += Number(bucket.tokens > 0); }
    }
  }
  return validateAISnapshot({ version: 1, source: 'codex-account-usage', updatedAt, summary, months });
}

export function assertAIProgress(current, previous, { allowMetricCorrection = false } = {}) {
  validateAISnapshot(current); validateAISnapshot(previous);
  if (Date.parse(current.updatedAt) < Date.parse(previous.updatedAt)) throw new Error('Cannot replace newer AI statistics.');
  // A current streak and rolling monthly values may legitimately decrease.
  for (const key of summaryKeys.filter(key => key !== 'currentStreakDays')) {
    if (!allowMetricCorrection && previous.summary[key] !== null && (current.summary[key] === null || current.summary[key] < previous.summary[key])) throw new Error('AI cumulative statistics regressed.');
  }
  return current;
}

export async function readPublicSnapshot(url, validate, fetcher = fetch) {
  const response = await fetcher(url, { credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.body) throw new Error('Public statistics unavailable.');
  const reader = response.body.getReader();
  const chunks = []; let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 20000) { await reader.cancel(); throw new Error('Public statistics too large.'); }
    chunks.push(value);
  }
  const snapshot = validate(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))));
  if (Date.parse(snapshot.updatedAt) > Date.now() + 300000) throw new Error('Future snapshot.');
  return snapshot;
}

export async function latestAISnapshot(fallback, fetcher = fetch, { url = aiSnapshotURL, validate = validateAISnapshot, progress = assertAIProgress } = {}) {
  validate(fallback);
  try {
    // Production can read only this sanitized PUBLIC asset, never account auth.
    const current = await readPublicSnapshot(url, validate, fetcher);
    progress(current, fallback);
    return Date.parse(current.updatedAt) > Date.parse(fallback.updatedAt) ? current : fallback;
  } catch { console.warn('AI update unavailable; using the dated, validated snapshot.'); return fallback; }
}
