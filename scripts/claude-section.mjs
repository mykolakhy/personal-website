import { validateClaudeSnapshot, claudeSummaryKeys } from './claude-data.mjs';
import { monthlyEnglish, renderMonthlyHistory } from './ai-months.mjs';

export const claudeEnglish = {
  'claudeStats.label': 'Claude Code activity',
  'claudeStats.title': 'Claude Code.',
  'claudeStats.intro': 'Sessions, tokens, and active days from my work with Claude Code.',
  'claudeStats.coverage': 'Period covered',
  'claudeStats.collected': 'Snapshot retrieved',
  'claudeStats.models': 'Models used',
  'claudeStats.sessions': 'Sessions',
  'claudeStats.activeDays': 'Active days',
  'claudeStats.inputTokens': 'Input tokens · uncached',
  'claudeStats.outputTokens': 'Output tokens',
  'claudeStats.cacheReadInputTokens': 'Input tokens · read from cache',
  'claudeStats.cacheCreationInputTokens': 'Input tokens · written to cache',
  'claudeStats.monthlyTitle': 'Activity by month',
  'claudeStats.monthlyNote': '12 calendar months up to the end of the period shown. Months outside the recorded period have no data, not zero activity.',
  'claudeStats.activeDaysNote': 'Active days are dates with recorded activity, including work in ongoing sessions. One session can span several days, so active days can outnumber session starts.',
  'claudeStats.scaleNote': 'Highest monthly session-start count across all 12 months: {maximum}. The green fill shows the share of that maximum; the unfilled part is the rest of the scale, not inactive days. Expanding the history does not change the scale.',
  'claudeStats.beforeCoverage': 'Before the recorded period',
  'claudeStats.partial': 'Partial month',
  'claudeStats.sessionsUnit': 'Session starts',
  'claudeStats.note': 'An activity snapshot, not a measure of productivity. Token categories differ from ChatGPT / Codex, so the totals are not directly comparable.',
  'claudeStats.method': 'These figures cover my Claude Code activity recorded on one computer, not my entire Claude account. Activity on other devices or in Claude.ai is excluded, and missing local history can leave gaps. Sessions, token counts, and model names come from the local aggregate cache; active days and monthly session starts are calculated from its daily activity. Active days include ongoing sessions. Input, output, cache-read, and cache-write tokens are separate categories. The period shown ends at the cache’s last calculation; retrieving a snapshot does not recalculate it or make older data current. Conversations, task names, session IDs, project paths, costs, credentials, and unverified duration metrics are not published.',
  'claudeStats.unavailable': 'Claude Code statistics are currently unavailable.',
};
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function renderClaudeStats(snapshot, code, catalog = { ...monthlyEnglish, ...claudeEnglish, 'aiStats.noData': 'No data', 'aiStats.methodTitle': 'About these numbers' }) {
  const text = key => escape(catalog[`claudeStats.${key}`]);
  if (!snapshot) return `<p class="ai-stats-note">${text('unavailable')}</p>`;
  validateClaudeSnapshot(snapshot);
  const number = value => new Intl.NumberFormat(code).format(value);
  const compact = value => {
    const parts = new Intl.NumberFormat(code, { notation: 'compact', maximumFractionDigits: 2 }).formatToParts(value);
    const digits = parts.filter(part => part.type !== 'compact' && part.type !== 'literal').map(part => part.value).join('');
    const suffix = parts.find(part => part.type === 'compact')?.value;
    return `<span class="ai-token-number">${escape(digits)}</span>${suffix ? `<span class="ai-token-unit">${escape(suffix)}</span>` : ''}`;
  };
  const count = (value, attribute = '') => `<data value="${value}" ${attribute} title="${escape(number(value))}"><span class="ai-compact-number" aria-hidden="true">${compact(value)}</span><span class="sr-only">${escape(number(value))}</span></data>`;
  const day = value => new Intl.DateTimeFormat(code, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00.000Z`));
  const metrics = claudeSummaryKeys.map(key => `<div><dt>${text(key)}</dt><dd data-claude-metric="${key}">${count(snapshot.summary[key])}</dd></div>`).join('');
  const maximum = Math.max(0, ...snapshot.months.map(month => month.sessions ?? 0));
  const scaleNote = maximum > 0 ? `<p id="claude-month-scale" class="ai-stats-note ai-month-scale">${text('scaleNote').replace('{maximum}', escape(number(maximum)))}</p>` : '';
  const months = snapshot.months.map(month => {
    const label = new Intl.DateTimeFormat(code, { month: 'long', timeZone: 'UTC' }).format(new Date(`${month.month}-01T00:00:00.000Z`));
    const last = new Date(Date.UTC(Number(month.month.slice(0, 4)), Number(month.month.slice(5)), 0)).getUTCDate();
    const partial = month.sessions !== null && ((month.month === snapshot.coverageStart.slice(0, 7) && Number(snapshot.coverageStart.slice(8)) > 1) || (month.month === snapshot.computedThrough.slice(0, 7) && Number(snapshot.computedThrough.slice(8)) < last));
    return `<div class="ai-month" data-claude-month="${month.month}"><dt><time datetime="${month.month}">${escape(label)} <span class="ai-month-year">${month.month.slice(0, 4)}</span></time>${partial ? `<span class="ai-month-partial">${text('partial')}</span>` : ''}</dt><dd class="ai-month-count${month.sessions === null ? ' ai-month-unavailable' : ''}">${month.sessions === null ? `${escape(catalog['aiStats.noData'])}<span class="ai-month-missing-note">${text('beforeCoverage')}</span>` : `${count(month.sessions, 'data-claude-month-sessions')}<span class="ai-month-unit">${text('sessionsUnit')}</span>`}</dd>${month.sessions === null ? '' : `<dd class="ai-month-days"><span class="ai-month-day-count">${number(month.activeDays)}</span><span class="ai-month-day-label">${text('activeDays')}</span></dd><dd class="ai-month-bar"><meter min="0" max="${Math.max(1, maximum)}" value="${month.sessions}" aria-label="${escape(`${label} ${month.month.slice(0, 4)}`)}" aria-valuetext="${text('sessionsUnit')}: ${escape(number(month.sessions))}"${maximum > 0 ? ' aria-describedby="claude-month-scale"' : ''}>${number(month.sessions)}</meter></dd>`}</div>`;
  });
  const history = renderMonthlyHistory({ id: 'claude', title: catalog['claudeStats.monthlyTitle'], cards: months, catalog,
    help: `<p class="ai-stats-note">${text('monthlyNote')}</p><p class="ai-stats-note">${text('activeDaysNote')}</p>${scaleNote}<p>${text('method')}</p>` });
  const collected = new Intl.DateTimeFormat(code, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(new Date(snapshot.updatedAt));
  return `<div class="claude-coverage"><p class="ai-stats-note">${text('coverage')}: <time datetime="${snapshot.coverageStart}">${escape(day(snapshot.coverageStart))}</time> — <time data-claude-through datetime="${snapshot.computedThrough}">${escape(day(snapshot.computedThrough))}</time></p></div>
        <dl class="ai-stats-metrics claude-metrics">${metrics}</dl>
        <div class="claude-models"><h3>${text('models')}</h3><ul>${snapshot.models.map(model => `<li><code>${escape(model)}</code></li>`).join('')}</ul></div>
        ${history}
        <p class="ai-stats-note">${text('note')}</p>
        <p class="ai-stats-updated">${text('collected')}: <time datetime="${snapshot.updatedAt}">${escape(collected)} UTC</time></p>`;
}
