import { recentMonths, summaryKeys, validateAISnapshot } from './ai-data.mjs';

export const aiEnglish = {
  'aiStats.label': 'ChatGPT / Codex activity',
  'aiStats.title': 'AI, in numbers.',
  'aiStats.intro': 'Token usage and activity from my ChatGPT / Codex profile.',
  'aiStats.lifetimeTokens': 'Lifetime tokens',
  'aiStats.peakDailyTokens': 'Peak tokens in a day',
  'aiStats.longestRunningTurnSec': 'Longest task',
  'aiStats.longestStreakDays': 'Longest streak',
  'aiStats.currentStreakDays': 'Current streak',
  'aiStats.tokens': 'Reported tokens',
  'aiStats.activeDays': 'Days with reported activity',
  'aiStats.days': 'days',
  'aiStats.updated': 'Data updated',
  'aiStats.source': 'Source: ChatGPT / Codex profile',
  'aiStats.monthlyTitle': 'Token activity by month',
  'aiStats.monthlyNote': 'The 12 most recent calendar months. Bars compare reported token totals; the current month is incomplete.',
  'aiStats.currentMonth': 'Current month · partial',
  'aiStats.noData': 'Unavailable',
  'aiStats.historyUnavailable': 'Monthly activity is unavailable in this snapshot. Missing data is not shown as zero.',
  'aiStats.unavailable': 'Profile statistics are currently unavailable.',
  'aiStats.note': 'A dated snapshot of account activity, not a measure of productivity or work quality.',
  'aiStats.methodTitle': 'About these numbers',
  'aiStats.method': 'Summary values come from the profile service. The longest task is elapsed task time, not hours worked. Monthly totals sum only the daily token values returned by that service; months without returned values show zero reported tokens, not proof of inactivity. Monthly totals and lifetime tokens cover different periods. Missing metrics remain unavailable. Conversations, task names, private projects, and credentials are not published. No statistics for Claude or other providers are included.',
};
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function renderAIStats(snapshot, code, catalog = aiEnglish) {
  const text = key => escape(catalog[`aiStats.${key}`]);
  if (!snapshot) return `<p class="ai-stats-note">${text('unavailable')}</p>`;
  validateAISnapshot(snapshot);
  const number = value => new Intl.NumberFormat(code).format(value);
  const compact = value => {
    const parts = new Intl.NumberFormat(code, { notation: 'compact', maximumFractionDigits: 2 }).formatToParts(value);
    const digits = parts.filter(part => part.type !== 'compact' && part.type !== 'literal').map(part => part.value).join('');
    const suffix = parts.find(part => part.type === 'compact')?.value;
    return `<span class="ai-token-number">${escape(digits)}</span>${suffix ? `<span class="ai-token-unit">${escape(suffix)}</span>` : ''}`;
  };
  const unit = (value, name) => new Intl.NumberFormat(code, { style: 'unit', unit: name, unitDisplay: 'short' }).format(value);
  const tokens = (value, attribute = '') => `<data value="${value}" ${attribute} title="${escape(number(value))}"><span class="ai-compact-number" aria-hidden="true">${compact(value)}</span><span class="sr-only">${escape(number(value))}</span></data>`;
  const metrics = summaryKeys.map(key => {
    const value = snapshot.summary[key];
    let content = text('noData');
    if (value !== null) {
      if (key.endsWith('Tokens')) content = tokens(value);
      else if (key === 'longestRunningTurnSec') content = `<data value="${value}"><span class="ai-duration-part">${escape(unit(Math.floor(value / 3600), 'hour'))}</span> <span class="ai-duration-part">${escape(unit(Math.floor(value / 60) % 60, 'minute'))}</span></data>`;
      else content = `<data value="${value}">${escape(number(value))}<span class="ai-stat-unit"> ${text('days')}</span></data>`;
    }
    return `<div><dt>${text(key)}</dt><dd data-ai-metric="${key}"${value === null ? ' class="ai-stat-unavailable"' : ''}>${content}</dd></div>`;
  }).join('');
  const months = snapshot.months ?? recentMonths(snapshot.updatedAt).map(month => ({ month, tokens: null, activeDays: null }));
  const maximum = Math.max(1, ...months.map(month => month.tokens ?? 0));
  const monthly = months.map((month, index) => {
    const label = new Intl.DateTimeFormat(code, { month: 'short', timeZone: 'UTC' }).format(new Date(`${month.month}-01`));
    const year = month.month.slice(0, 4);
    return `<div class="ai-month" data-ai-month="${month.month}"><dt><time datetime="${month.month}">${escape(label)} <span class="ai-month-year">${year}</span></time>${index === 0 ? `<span class="ai-month-partial">${text('currentMonth')}</span>` : ''}</dt><dd class="ai-month-count${month.tokens === null ? ' ai-month-unavailable' : ''}">${month.tokens === null ? text('noData') : tokens(month.tokens, 'data-ai-month-tokens')}</dd><dd class="ai-month-days">${text('activeDays')}: <span>${month.activeDays === null ? '—' : number(month.activeDays)}</span></dd>${month.tokens === null ? '' : `<dd class="ai-month-bar"><meter min="0" max="${maximum}" value="${month.tokens}" aria-label="${escape(`${label} ${year}`)}" aria-valuetext="${escape(number(month.tokens))} ${text('tokens')}">${number(month.tokens)}</meter></dd>`}</div>`;
  }).join('');
  const updated = new Intl.DateTimeFormat(code, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(new Date(snapshot.updatedAt));
  return `<dl class="ai-stats-metrics">${metrics}</dl>
        <div class="ai-monthly"><h3>${text('monthlyTitle')}</h3><p class="ai-stats-note">${text('monthlyNote')}</p>${snapshot.months === null ? `<p class="ai-stats-note">${text('historyUnavailable')}</p>` : ''}<dl class="ai-months">${monthly}</dl></div>
        <p class="ai-stats-note">${text('note')}</p>
        <p class="ai-stats-updated">${text('source')} · ${text('updated')}: <time datetime="${snapshot.updatedAt}">${escape(updated)} UTC</time></p>
        <details class="ai-stats-method"><summary>${text('methodTitle')}<span class="disclosure-mark" aria-hidden="true">+</span></summary><div class="detail-body"><p>${text('method')}</p></div></details>`;
}
