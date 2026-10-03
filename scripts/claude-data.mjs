import { recentMonths, latestAISnapshot } from './ai-data.mjs';

export const claudeStatsFiles = ['data/claude-stats.json'];
export const claudeSnapshotURL = 'https://github.com/mykolakhy/personal-website/releases/download/ai-activity/claude-stats.json';
export const claudeTokenKeys = ['inputTokens', 'outputTokens', 'cacheReadInputTokens', 'cacheCreationInputTokens'];
export const claudeSummaryKeys = ['sessions', 'activeDays', ...claudeTokenKeys];
const integer = value => Number.isSafeInteger(value) && value >= 0;
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === allowed.length && Object.keys(value).every(key => allowed.includes(key));
const modelName = value => typeof value === 'string' && /^claude-(?:sonnet|opus|haiku)-\d+(?:-\d+)*$/.test(value) && value.length <= 80;
const invalid = () => { throw new Error('Invalid public Claude snapshot.'); };

export function validateClaudeSnapshot(value) {
  if (!keys(value, ['version', 'source', 'updatedAt', 'computedThrough', 'coverageStart', 'summary', 'models', 'months']) || value.version !== 1 || value.source !== 'claude-code-local-cache') invalid();
  if (typeof value.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.updatedAt) || !Number.isFinite(Date.parse(value.updatedAt)) || new Date(value.updatedAt).toISOString() !== value.updatedAt) invalid();
  if (!date(value.computedThrough) || !date(value.coverageStart) || value.coverageStart > value.computedThrough || value.computedThrough > value.updatedAt.slice(0, 10)) invalid();
  if (!keys(value.summary, claudeSummaryKeys) || !claudeSummaryKeys.every(key => integer(value.summary[key]))) invalid();
  const coverageDays = (Date.parse(value.computedThrough) - Date.parse(value.coverageStart)) / 86400000 + 1;
  if (value.summary.activeDays > coverageDays) invalid();
  if (!Array.isArray(value.models) || value.models.length === 0 || value.models.length > 20 || !value.models.every(modelName) || new Set(value.models).size !== value.models.length) invalid();
  if (!Array.isArray(value.months) || value.months.length !== 12) invalid();
  const expected = recentMonths(`${value.computedThrough}T00:00:00.000Z`);
  let sessions = 0, activeDays = 0;
  for (const [index, month] of value.months.entries()) {
    if (!keys(month, ['month', 'sessions', 'activeDays']) || month.month !== expected[index]) invalid();
    if (month.month < value.coverageStart.slice(0, 7)) {
      if (month.sessions !== null || month.activeDays !== null) invalid();
    } else {
      const first = month.month === value.coverageStart.slice(0, 7) ? Number(value.coverageStart.slice(8)) : 1;
      const last = index === 0 ? Number(value.computedThrough.slice(8)) : new Date(Date.UTC(Number(month.month.slice(0, 4)), Number(month.month.slice(5)), 0)).getUTCDate();
      if (!integer(month.sessions) || !integer(month.activeDays) || month.activeDays > last - first + 1 || (month.sessions > 0 && month.activeDays === 0)) invalid();
      sessions += month.sessions; activeDays += month.activeDays;
      if (!integer(sessions) || !integer(activeDays)) invalid();
    }
  }
  if (sessions > value.summary.sessions || activeDays > value.summary.activeDays) invalid();
  return value;
}

// Read only allowlisted aggregate counters. Never retain IDs, messages, paths,
// tools, costs, longestSession or any unverified daily-token definition.
export function aggregateClaudeCache(raw, now = new Date()) {
  if (!raw || raw.version !== 5 || !date(raw.lastComputedDate) || !integer(raw.totalSessions) || typeof raw.firstSessionDate !== 'string' || !Number.isFinite(Date.parse(raw.firstSessionDate))) invalid();
  const coverageStart = raw.firstSessionDate.slice(0, 10), computedThrough = raw.lastComputedDate;
  if (!date(coverageStart) || coverageStart > computedThrough || computedThrough > now.toISOString().slice(0, 10)) invalid();
  if (!raw.modelUsage || typeof raw.modelUsage !== 'object' || Array.isArray(raw.modelUsage)) invalid();
  const models = Object.keys(raw.modelUsage).sort();
  if (!models.length || models.length > 20 || !models.every(modelName)) invalid();
  const summary = { sessions: raw.totalSessions, activeDays: 0, ...Object.fromEntries(claudeTokenKeys.map(key => [key, 0])) };
  for (const model of models) for (const key of claudeTokenKeys) {
    if (!integer(raw.modelUsage[model]?.[key])) invalid();
    summary[key] += raw.modelUsage[model][key];
  }
  if (!Array.isArray(raw.dailyActivity) || raw.dailyActivity.length > 10000) invalid();
  const months = recentMonths(`${computedThrough}T00:00:00.000Z`).map(month => ({ month, sessions: month < coverageStart.slice(0, 7) ? null : 0, activeDays: month < coverageStart.slice(0, 7) ? null : 0 }));
  const dates = new Set(); let totalSessions = 0;
  for (const day of raw.dailyActivity) {
    if (!day || !date(day.date) || day.date < coverageStart || day.date > computedThrough || dates.has(day.date) || !['sessionCount', 'messageCount', 'toolCallCount'].every(key => integer(day[key]))) invalid();
    dates.add(day.date);
    const active = Number(day.sessionCount > 0 || day.messageCount > 0 || day.toolCallCount > 0);
    summary.activeDays += active; totalSessions += day.sessionCount;
    const month = months.find(month => month.month === day.date.slice(0, 7));
    if (month) { month.sessions += day.sessionCount; month.activeDays += active; }
  }
  if (!integer(totalSessions) || totalSessions > raw.totalSessions) invalid();
  return validateClaudeSnapshot({ version: 1, source: 'claude-code-local-cache', updatedAt: now.toISOString(), computedThrough, coverageStart, summary, models, months });
}

export function latestClaudeSnapshot(fallback, fetcher = fetch) {
  return latestAISnapshot(fallback, fetcher, { url: claudeSnapshotURL, validate: validateClaudeSnapshot, newer: (current, previous) => current.computedThrough >= previous.computedThrough && Date.parse(current.updatedAt) > Date.parse(previous.updatedAt) });
}
