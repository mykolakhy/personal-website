import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { monthlyActivity } from '../../scripts/github-section.mjs';
const snapshot = JSON.parse(await readFile('data/github-stats.json', 'utf8'));
const labels = {
  en: { title: 'Code you can explore.', monthly: 'Explore activity by month', method: 'What these numbers mean' },
  uk: { title: 'Код, який можна дослідити.', monthly: 'Переглянути активність за місяцями', method: 'Що означають ці числа' },
  it: { title: 'Codice da esplorare.', monthly: 'Esplora l’attività per mese', method: 'Cosa significano questi numeri' },
  de: { title: 'Code zum Erkunden.', monthly: 'Aktivität nach Monaten ansehen', method: 'Was diese Zahlen bedeuten' },
};
for (const code of Object.keys(labels)) for (const theme of ['light', 'dark']) for (const width of [320, 1440]) {
  test(`${code} GitHub activity in ${theme} at ${width}px is accurate, accessible and local`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4180')) external.push(request.url()); });
    await page.goto((code === 'en' ? '/' : `/${code}/`) + '#github');
    await expect(page.getByRole('heading', { name: labels[code].title, exact: true })).toBeVisible();
    for (const key of ['contributions', 'activeDays', 'pullRequests', 'reviews']) await expect(page.locator(`[data-total="${key}"]`)).toHaveText(new Intl.NumberFormat(code).format(snapshot.totals[key]));
    await expect(page.locator('.calendar-day[data-date]')).toHaveCount(snapshot.days.length);
    const calendar = await page.locator('.calendar-day[data-date]').evaluateAll(cells => cells.map(cell => ({ date: cell.dataset.date, count: Number(cell.dataset.count), level: Number(cell.dataset.level) })));
    expect(calendar).toEqual(snapshot.days);
    await expect(page.locator('.github-project')).toHaveCount(snapshot.projects.length);
    const projects = await page.locator('.github-project a').evaluateAll(links => links.map(link => ({ href: link.href, target: link.target, rel: link.rel })));
    expect(projects.map(project => project.href)).toEqual(snapshot.projects.map(project => `https://github.com/mykolakhy/${project.name}`));
    for (const project of projects) { expect(project.target).toBe('_blank'); expect(project.rel).toContain('noopener'); expect(project.rel).toContain('noreferrer'); }
    await expect(page.locator('.github-ci a')).toHaveAttribute('href', `https://github.com/mykolakhy/personal-website/actions/runs/${snapshot.ci.id}`);
    await expect(page.locator('#github')).not.toContainText('exclusive-resorts');
    const geometry = await page.evaluate(() => ({ width: innerWidth, pageWidth: document.documentElement.scrollWidth, cards: [...document.querySelectorAll('.github-project,.github-quality,.github-calendar')].map(element => ({ left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right })) }));
    expect(geometry.pageWidth).toBeLessThanOrEqual(width + 1);
    for (const card of geometry.cards) { expect(card.left).toBeGreaterThanOrEqual(0); expect(card.right).toBeLessThanOrEqual(width); }
    const weekWidths = await page.locator('.calendar-week:not(.calendar-axis)').evaluateAll(weeks => weeks.map(week => week.getBoundingClientRect().width));
    expect(weekWidths.every(width => width === 12)).toBe(true);
    await page.locator('.github-disclosures summary').filter({ hasText: labels[code].method }).click();
    await page.locator('.github-monthly summary').click();
    await expect(page.locator('.github-month')).toHaveCount(12);
    const months = await page.locator('.github-month').evaluateAll(cards => cards.map(card => ({ month: card.dataset.month, count: Number(card.querySelector('[data-month-count]').dataset.monthCount), activeDays: Number(card.querySelector('.github-month-days span').textContent), partial: Boolean(card.querySelector('.github-month-partial')) })));
    expect(months).toEqual(monthlyActivity(snapshot));
    await expect(page.locator('.github-month meter')).toHaveCount(12);
    const monthLayout = await page.locator('.github-month').evaluateAll(cards => cards.map(card => ({ top: card.getBoundingClientRect().top, valueTop: card.querySelector('.github-month-count').getBoundingClientRect().top })));
    const rows = [...new Set(monthLayout.map(card => card.top))];
    expect(rows.length).toBe(width === 320 ? 6 : 3);
    for (const row of rows) expect(new Set(monthLayout.filter(card => card.top === row).map(card => card.valueTop)).size).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect((await new AxeBuilder({ page }).include('#github').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    const response = await page.request.get('/data/github-stats.json');
    expect(response.status()).toBe(404);
    expect(external).toEqual([]); expect(errors).toEqual([]);
  });
}

test('mobile calendar and monthly data work with a keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/#github');
  await page.locator('.calendar-scroll').focus();
  await expect(page.locator('.calendar-scroll')).toBeFocused();
  const before = await page.locator('.calendar-scroll').evaluate(element => element.scrollLeft);
  expect(before).toBeGreaterThan(0);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => page.locator('.calendar-scroll').evaluate(element => element.scrollLeft)).toBeLessThan(before);
  await page.locator('.github-monthly summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.github-monthly')).toHaveAttribute('open', '');
  await page.keyboard.press('Space');
  await expect(page.locator('.github-monthly')).not.toHaveAttribute('open', '');
});

test('GitHub data and disclosures work without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 900 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4180/uk/#github');
  await expect(page.locator('[data-total="contributions"]')).toHaveText(new Intl.NumberFormat('uk').format(snapshot.totals.contributions));
  await page.locator('.github-monthly summary').click();
  await expect(page.locator('.github-month')).toHaveCount(12);
  await expect(page.getByRole('heading', { name: 'PixelKit', exact: true })).toBeVisible();
  await context.close();
});

test('print and forced colors preserve useful data without clipping the calendar', async ({ page }) => {
  await page.goto('/#github');
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.locator('.calendar-scroll')).toBeVisible();
  await page.locator('.github-monthly summary').click();
  await expect(page.locator('.github-months')).toBeVisible();
  await page.emulateMedia({ forcedColors: 'none', media: 'print' });
  await expect(page.locator('.github-calendar')).toBeHidden();
  await expect(page.locator('.github-metrics')).toBeVisible();
  await expect(page.locator('.github-quality')).toBeVisible();
  const geometry = await page.locator('.github-project').evaluateAll(cards => cards.map(card => ({ right: card.getBoundingClientRect().right, viewport: innerWidth })));
  expect(geometry.every(card => card.right <= card.viewport)).toBe(true);
});
