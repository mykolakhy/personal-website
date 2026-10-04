export const monthlyEnglish = {
  'monthHistory.recentNote': 'Latest 3 months. Full history: 12 months.',
  'monthHistory.readData': 'How to read these numbers',
  'monthHistory.expand': 'Show the previous 9 months',
  'monthHistory.collapse': 'Hide the previous 9 months',
};

const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// Cards and help are already escaped by the validated provider renderers.
// Native disclosures keep both the history and its explanation usable without JS.
export function renderMonthlyHistory({ id, title, cards, help, catalog = monthlyEnglish }) {
  if (!['ai', 'claude'].includes(id) || cards.length !== 12) throw new Error('Expected a provider and twelve monthly cards.');
  const text = key => escape(catalog[`monthHistory.${key}`] ?? monthlyEnglish[`monthHistory.${key}`]);
  return `<div class="ai-monthly">
          <div class="ai-monthly-heading"><h3 id="${id}-monthly-title">${escape(title)}</h3><p class="ai-stats-note">${text('recentNote')}</p></div>
          <details class="ai-stats-method ai-month-help"><summary><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v1" /></svg><span>${text('readData')}</span></summary><div class="detail-body">${help}</div></details>
          <dl class="ai-months ai-months-recent" aria-labelledby="${id}-monthly-title">${cards.slice(0, 3).join('')}</dl>
          <details class="ai-month-history"><summary aria-controls="${id}-older-months"><span class="sr-only ai-history-expand">${text('expand')}</span><span class="sr-only ai-history-collapse">${text('collapse')}</span><svg class="ai-history-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6" /></svg></summary><dl id="${id}-older-months" class="ai-months ai-months-older" aria-labelledby="${id}-monthly-title">${cards.slice(3).join('')}</dl></details>
        </div>`;
}
