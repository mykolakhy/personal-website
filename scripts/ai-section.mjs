import { recentMonths, summaryKeys, validateAISnapshot } from './ai-data.mjs';
import { monthlyEnglish, renderMonthlyHistory } from './ai-months.mjs';

export const aiEnglish = {
  ...monthlyEnglish,
  'aiStats.label': 'ChatGPT / Codex activity',
  'aiStats.title': 'AI, in numbers.',
  'aiStats.intro': 'Token usage and activity from my ChatGPT / Codex profile.',
  'aiStats.lifetimeTokens': 'Lifetime tokens',
  'aiStats.peakDailyTokens': 'Most tokens in one day',
  'aiStats.longestRunningTurnSec': 'Longest task',
  'aiStats.longestStreakDays': 'Longest daily streak',
  'aiStats.currentStreakDays': 'Current daily streak',
  'aiStats.tokens': 'Reported tokens',
  'aiStats.activeDays': 'Active days',
  'aiStats.days': 'days',
  'aiStats.updated': 'Snapshot retrieved',
  'aiStats.source': 'Source: ChatGPT / Codex profile',
  'aiStats.monthlyTitle': 'Token usage by month',
  'aiStats.monthlyNote': '12 calendar months up to the snapshot date; the latest month in the snapshot is partial. Active days are dates with reported tokens.',
  'aiStats.scaleNote': 'Highest monthly reported token total across all 12 months: {maximum}. The green fill shows the share of that maximum; the unfilled part is the rest of the scale, not inactive days. Expanding the history does not change the scale.',
  'aiStats.currentMonth': 'Partial month',
  'aiStats.noData': 'No data',
  'aiStats.historyUnavailable': 'Monthly activity is unavailable in this snapshot. Missing data is not shown as zero.',
  'aiStats.unavailable': 'Profile statistics are currently unavailable.',
  'aiStats.note': 'A dated snapshot of account activity, not a measure of productivity or work quality.',
  'aiStats.methodTitle': 'About these numbers',
  'aiStats.method': 'Numbers come from my ChatGPT / Codex profile. The longest task is elapsed time, not time I spent working. Monthly totals include only the daily token values the profile returns, and active days count dates with reported tokens. A month showing zero reported tokens does not prove there was no activity. Monthly and all-time totals cover different periods. Missing metrics and missing history stay unavailable. These figures do not include Claude Code. Conversations, task names, private projects, and credentials are not published.',
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
  const maximum = Math.max(0, ...months.map(month => month.tokens ?? 0));
  const scaleNote = maximum > 0 ? `<p id="ai-month-scale" class="ai-stats-note ai-month-scale">${text('scaleNote').replace('{maximum}', escape(number(maximum)))}</p>` : '';
  const monthly = months.map((month, index) => {
    const label = new Intl.DateTimeFormat(code, { month: 'long', timeZone: 'UTC' }).format(new Date(`${month.month}-01`));
    const year = month.month.slice(0, 4);
    return `<div class="ai-month" data-ai-month="${month.month}"><dt><time datetime="${month.month}">${escape(label)} <span class="ai-month-year">${year}</span></time>${index === 0 ? `<span class="ai-month-partial">${text('currentMonth')}</span>` : ''}</dt><dd class="ai-month-count${month.tokens === null ? ' ai-month-unavailable' : ''}">${month.tokens === null ? text('noData') : `${tokens(month.tokens, 'data-ai-month-tokens')}<span class="ai-month-unit">${text('tokens')}</span>`}</dd>${month.tokens === null ? '' : `<dd class="ai-month-days"><span class="ai-month-day-count">${number(month.activeDays)}</span><span class="ai-month-day-label">${text('activeDays')}</span></dd><dd class="ai-month-bar"><meter min="0" max="${Math.max(1, maximum)}" value="${month.tokens}" aria-label="${escape(`${label} ${year}`)}" aria-valuetext="${escape(number(month.tokens))} ${text('tokens')}"${maximum > 0 ? ' aria-describedby="ai-month-scale"' : ''}>${number(month.tokens)}</meter></dd>`}</div>`;
  });
  const history = renderMonthlyHistory({ id: 'ai', title: catalog['aiStats.monthlyTitle'], cards: monthly, catalog,
    help: `<p class="ai-stats-note">${text('monthlyNote')}</p>${scaleNote}${snapshot.months === null ? `<p class="ai-stats-note">${text('historyUnavailable')}</p>` : ''}<p>${text('method')}</p>` });
  const updated = new Intl.DateTimeFormat(code, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(new Date(snapshot.updatedAt));
  return `<dl class="ai-stats-metrics">${metrics}</dl>
        ${history}
        <p class="ai-stats-note">${text('note')}</p>
        <p class="ai-stats-updated">${text('source')} · ${text('updated')}: <time datetime="${snapshot.updatedAt}">${escape(updated)} UTC</time></p>`;
}
