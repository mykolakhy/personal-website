import { validateClaudeSnapshot, claudeSummaryKeys } from './claude-data.mjs';

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
  'claudeStats.monthlyNote': '12 calendar months up to the end of the period shown. Bars show session starts. Months outside the recorded period have no data, not zero activity.',
  'claudeStats.partial': 'Partial month',
  'claudeStats.sessionsUnit': 'Session starts',
  'claudeStats.note': 'An activity snapshot, not a measure of productivity. Token categories differ from ChatGPT / Codex, so the totals are not directly comparable.',
  'claudeStats.method': 'These figures cover my Claude Code activity recorded on one computer, not my entire Claude account. Activity on other devices or in Claude.ai is excluded, and missing local history can leave gaps. Sessions, token counts, and model names come from the local aggregate cache; active days and monthly session starts are calculated from its daily activity. Active days include ongoing sessions. Input, output, cache-read, and cache-write tokens are separate categories. The period shown ends at the cache’s last calculation; retrieving a snapshot does not recalculate it or make older data current. Conversations, task names, session IDs, project paths, costs, credentials, and unverified duration metrics are not published.',
  'claudeStats.unavailable': 'Claude Code statistics are currently unavailable.',
};
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function renderClaudeStats(snapshot, code, catalog = { ...claudeEnglish, 'aiStats.noData': 'No data', 'aiStats.methodTitle': 'About these numbers' }) {
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
  const maximum = Math.max(1, ...snapshot.months.map(month => month.sessions ?? 0));
  const months = snapshot.months.map(month => {
    const label = new Intl.DateTimeFormat(code, { month: 'short', timeZone: 'UTC' }).format(new Date(`${month.month}-01T00:00:00.000Z`));
    const last = new Date(Date.UTC(Number(month.month.slice(0, 4)), Number(month.month.slice(5)), 0)).getUTCDate();
    const partial = month.sessions !== null && ((month.month === snapshot.coverageStart.slice(0, 7) && Number(snapshot.coverageStart.slice(8)) > 1) || (month.month === snapshot.computedThrough.slice(0, 7) && Number(snapshot.computedThrough.slice(8)) < last));
    return `<div class="ai-month" data-claude-month="${month.month}"><dt><time datetime="${month.month}">${escape(label)} <span class="ai-month-year">${month.month.slice(0, 4)}</span></time>${partial ? `<span class="ai-month-partial">${text('partial')}</span>` : ''}</dt><dd class="ai-month-count${month.sessions === null ? ' ai-month-unavailable' : ''}">${month.sessions === null ? escape(catalog['aiStats.noData']) : count(month.sessions, 'data-claude-month-sessions')}</dd><dd class="ai-month-days">${text('activeDays')}: <span>${month.activeDays === null ? '—' : number(month.activeDays)}</span></dd>${month.sessions === null ? '' : `<dd class="ai-month-bar"><meter min="0" max="${maximum}" value="${month.sessions}" aria-label="${escape(`${label} ${month.month.slice(0, 4)}`)}" aria-valuetext="${text('sessionsUnit')}: ${escape(number(month.sessions))}">${number(month.sessions)}</meter></dd>`}</div>`;
  }).join('');
  const collected = new Intl.DateTimeFormat(code, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(new Date(snapshot.updatedAt));
  return `<div class="claude-coverage"><p class="ai-stats-note">${text('coverage')}: <time datetime="${snapshot.coverageStart}">${escape(day(snapshot.coverageStart))}</time> — <time data-claude-through datetime="${snapshot.computedThrough}">${escape(day(snapshot.computedThrough))}</time></p></div>
        <dl class="ai-stats-metrics claude-metrics">${metrics}</dl>
        <div class="claude-models"><h3>${text('models')}</h3><ul>${snapshot.models.map(model => `<li><code>${escape(model)}</code></li>`).join('')}</ul></div>
        <div class="ai-monthly"><h3>${text('monthlyTitle')}</h3><p class="ai-stats-note">${text('monthlyNote')}</p><dl class="ai-months">${months}</dl></div>
        <p class="ai-stats-note">${text('note')}</p>
        <p class="ai-stats-updated">${text('collected')}: <time datetime="${snapshot.updatedAt}">${escape(collected)} UTC</time></p>
        <details class="ai-stats-method"><summary>${escape(catalog['aiStats.methodTitle'])}<span class="disclosure-mark" aria-hidden="true">+</span></summary><div class="detail-body"><p>${text('method')}</p></div></details>`;
}
