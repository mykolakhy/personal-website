import { validateSnapshot } from './github-data.mjs';
import { arrowUpRight } from './icons.mjs';

export const githubEnglish = {
  'github.label': 'GitHub / public projects',
  'github.title': 'Code you can explore.',
  'github.intro': 'Personal tools and experiments, with public activity and the checks behind this site.',
  'github.profile': 'Explore my GitHub',
  'github.newTab': '(opens in a new tab)',
  'github.unavailable': 'Activity data is unavailable. You can still explore the projects on GitHub.',
  'github.contributions': 'GitHub contributions',
  'github.activeDays': 'Days with activity',
  'github.pullRequests': 'Public PRs opened',
  'github.reviews': 'Public review contributions',
  'github.period': 'Last 12 months',
  'github.calendar': 'GitHub profile activity calendar. Scroll horizontally to explore all months.',
  'github.less': 'Less',
  'github.more': 'More',
  'github.updated': 'Data updated',
  'github.note': 'GitHub profile activity, including publicly shared anonymous private contributions. PRs and reviews: public repositories only.',
  'github.methodTitle': 'What these numbers mean',
  'github.method': 'The calendar copies the dates, counts, and intensity levels visible on my GitHub profile without signing in, including anonymous private contributions shared there. GitHub aligns its last-year calendar to full weeks, so the displayed range can exceed 365 days. Public PR and review metrics are collected separately for that range; they are not a breakdown of the calendar total. No private repository details are published. Data is a dated snapshot, not a live counter; the current day may be incomplete. Manual testing and offline work are not represented. Activity does not measure code quality or my full professional experience.',
  'github.monthlyTitle': 'Explore activity by month',
  'github.monthlyNote': 'The 12 most recent calendar months, including the current partial month. The calendar above uses GitHub’s full rolling-year range. The bars compare contribution counts between these months.',
  'github.currentMonth': 'Current month · partial',
  'github.projects': 'Selected repositories',
  'github.activityTitle': 'GitHub activity',
  'github.personalType': 'QA portfolio',
  'github.personalBody': 'This four-language portfolio: accessible theme and language controls, browser regression tests, and a protected delivery workflow.',
  'github.pixelType': 'Desktop tool',
  'github.pixelBody': 'A Windows GUI for batch image resizing, compression, and format conversion. Built with Python and PyQt6, powered by ImageMagick.',
  'github.frogsType': 'Web application',
  'github.frogsBody': 'A searchable image bank with authentication and favorites. A practical project with API, integration, and browser tests, plus a Jenkins delivery pipeline.',
  'github.source': 'Explore the source',
  'github.pushed': 'Latest repository push',
  'github.qualityTitle': 'This site is tested too.',
  'github.qualityBody': 'The portfolio is also a working example of how I approach verification and delivery.',
  'github.browsers': 'Chromium and WebKit browser checks',
  'github.responsive': 'Responsive layouts, four languages, and both themes',
  'github.accessibility': 'Accessibility checks, keyboard navigation, and no-JavaScript behavior',
  'github.boundaries': 'Content, asset, build, and server security checks',
  'github.ciLabel': 'Last completed main-branch CI',
  'github.ciLink': 'Inspect the CI run',
  'github.actions': 'Explore the checks',
  'github.ciUnavailable': 'Run data unavailable',
  'github.ci.success': 'Passed',
  'github.ci.failure': 'Failed',
  'github.ci.cancelled': 'Cancelled',
  'github.ci.timed_out': 'Timed out',
  'github.ci.neutral': 'Neutral',
  'github.ci.skipped': 'Skipped',
  'github.ci.action_required': 'Action required',
  'github.ci.stale': 'Stale',
  'github.qualityNote': 'This is a dated CI result, not a live uptime indicator. Automated accessibility checks are not a full WCAG certification.',
};
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export function monthlyActivity(snapshot) {
  const end = new Date(snapshot.to);
  return Array.from({ length: 12 }, (_, index) => {
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - index, 1)).toISOString().slice(0, 10);
    const month = start.slice(0, 7);
    const days = snapshot.days.filter(day => day.date.startsWith(month));
    return { month, count: days.reduce((sum, day) => sum + day.count, 0), activeDays: days.filter(day => day.count > 0).length, partial: index === 0 };
  });
}
export function renderGithub(snapshot, code, catalog = githubEnglish) {
  const text = key => escape(catalog[`github.${key}`]);
  if (!snapshot) return `<p class="github-note">${text('unavailable')}</p>`;
  validateSnapshot(snapshot);
  const number = value => new Intl.NumberFormat(code).format(value);
  const formatDate = value => new Intl.DateTimeFormat(code, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
  const formatUpdated = value => new Intl.DateTimeFormat(code, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(new Date(value));
  const time = value => `<time datetime="${escape(value)}">${escape(formatDate(value))}</time>`;
  const link = (href, label) => `<a class="text-link" href="${escape(href)}" target="_blank" rel="noopener noreferrer"><span>${label}</span>${arrowUpRight}<span class="sr-only">${text('newTab')}</span></a>`;
  const metrics = ['contributions', 'activeDays', 'pullRequests', 'reviews'].map(key => `<div><dt>${text(key)}</dt><dd data-total="${key}">${number(snapshot.totals[key])}</dd></div>`).join('');
  const cells = [...Array(new Date(snapshot.from).getUTCDay()).fill(null), ...snapshot.days];
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  weeks.push(`<div class="calendar-week calendar-axis"><span></span>${Array.from({ length: 7 }, (_, day) => `<span>${day % 2 ? escape(new Intl.DateTimeFormat(code, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 4 + day)))) : ''}</span>`).join('')}</div>`);
  for (let index = 0; index < cells.length; index += 7) {
    const week = cells.slice(index, index + 7);
    const start = week.find(day => day?.date.endsWith('-01')) ?? (index === 0 ? week.find(Boolean) : null);
    const month = start ? new Intl.DateTimeFormat(code, { month: 'short', timeZone: 'UTC' }).format(new Date(start.date)) : '';
    weeks.push(`<div class="calendar-week"><span class="calendar-month">${escape(month)}</span>${week.map(day => day ? `<span class="calendar-day" data-level="${day.level}" data-date="${day.date}" data-count="${day.count}" title="${escape(formatDate(day.date))}: ${number(day.count)} ${text('contributions')}"></span>` : '<span class="calendar-day calendar-pad"></span>').join('')}</div>`);
  }
  const months = monthlyActivity(snapshot);
  const maximum = Math.max(1, ...months.map(month => month.count));
  const monthly = months.map(month => {
    const shortMonth = escape(new Intl.DateTimeFormat(code, { month: 'short', timeZone: 'UTC' }).format(new Date(`${month.month}-01`)));
    const year = month.month.slice(0, 4), label = `${shortMonth} ${year}`;
    return `<div class="github-month" data-month="${month.month}"><dt><time datetime="${month.month}">${shortMonth} <span class="github-month-year">${year}</span></time>${month.partial ? `<span class="github-month-partial">${text('currentMonth')}</span>` : ''}</dt><dd class="github-month-count" data-month-count="${month.count}">${number(month.count)}<span class="sr-only"> ${text('contributions')}</span></dd><dd class="github-month-days">${text('activeDays')}: <span>${number(month.activeDays)}</span></dd><dd class="github-month-bar"><meter min="0" max="${maximum}" value="${month.count}" aria-label="${label}" aria-valuetext="${number(month.count)} ${text('contributions')}">${number(month.count)}</meter></dd></div>`;
  }).join('');
  const projects = snapshot.projects.map(project => {
    const specs = {
      'personal-website': { title: 'Personal website', type: 'personalType', body: 'personalBody', tags: ['JavaScript', 'Playwright', 'GitHub Actions'] },
      'PixelKit': { title: 'PixelKit', type: 'pixelType', body: 'pixelBody', tags: ['Python', 'PyQt6', 'ImageMagick'] },
      'they-are-frogs': { title: 'They Are Frogs', type: 'frogsType', body: 'frogsBody', tags: ['TypeScript', 'Supabase', 'Playwright', 'Jenkins'] },
    };
    const spec = specs[project.name];
    return `<article class="card github-project" data-repository="${project.name}"><p class="mono-label">${text(spec.type)}</p><h3>${spec.title}</h3><p>${text(spec.body)}</p><div class="tag-list">${spec.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div><p class="github-project-date">${text('pushed')}: ${time(project.pushedAt)}</p>${link(`https://github.com/mykolakhy/${project.name}`, text('source'))}</article>`;
  }).join('');
  const ci = snapshot.ci;
  return `${projects ? `<h2 class="github-subheading">${text('projects')}</h2><div class="github-projects">${projects}</div>` : ''}
        <h2 class="github-subheading github-activity-heading">${text('activityTitle')}</h2><dl class="github-metrics">${metrics}</dl>
        <figure class="github-calendar"><figcaption><span>${text('period')}</span><span>${time(snapshot.from)} – ${time(snapshot.to)}</span></figcaption>
          <div class="calendar-scroll" tabindex="0" role="group" aria-label="${text('calendar')}"><div class="calendar-grid" aria-hidden="true">${weeks.join('')}</div></div>
          <div class="calendar-legend" aria-hidden="true"><span>${text('less')}</span>${[0, 1, 2, 3, 4].map(level => `<span class="calendar-day" data-level="${level}"></span>`).join('')}<span>${text('more')}</span></div>
        </figure>
        <p class="github-note">${text('note')}</p>
        <p class="github-updated">${text('updated')}: <time datetime="${snapshot.updatedAt}">${escape(formatUpdated(snapshot.updatedAt))} UTC</time></p>
        <div class="github-disclosures"><details><summary><span>${text('methodTitle')}</span><span class="disclosure-mark" aria-hidden="true">+</span></summary><div class="detail-body"><p>${text('method')}</p></div></details>
          <details class="github-monthly"><summary><span>${text('monthlyTitle')}</span><span class="disclosure-mark" aria-hidden="true">+</span></summary><div class="detail-body"><p>${text('monthlyNote')}</p><dl class="github-months">${monthly}</dl></div></details>
        </div>
        <div class="github-quality"><div><h3>${text('qualityTitle')}</h3><p>${text('qualityBody')}</p><ul class="github-checks">${['browsers', 'responsive', 'accessibility', 'boundaries'].map(key => `<li>${text(key)}</li>`).join('')}</ul></div>
          <div class="github-ci"><p class="mono-label">${text('ciLabel')}</p><p class="github-ci-state" data-conclusion="${ci?.conclusion ?? 'unavailable'}">${ci?.conclusion === 'success' ? '<span class="status-dot" aria-hidden="true"></span>' : ''}<strong>${ci ? text(`ci.${ci.conclusion}`) : text('ciUnavailable')}</strong></p>${ci ? `<p>${time(ci.completedAt)} · <code>main / ${ci.sha.slice(0, 7)}</code></p>${link(`https://github.com/mykolakhy/personal-website/actions/runs/${ci.id}`, text('ciLink'))}` : link('https://github.com/mykolakhy/personal-website/actions/workflows/ci.yml', text('actions'))}<p class="github-note">${text('qualityNote')}</p></div>
        </div>`;
}
