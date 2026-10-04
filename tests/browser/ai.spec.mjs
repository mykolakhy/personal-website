import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
const snapshot = JSON.parse(await readFile('data/ai-stats.json', 'utf8'));
const titles = { en: 'AI, in numbers.', uk: 'ШІ у цифрах.', it: 'L’IA, in numeri.', de: 'KI in Zahlen.' };
const claude = JSON.parse(await readFile('data/claude-stats.json', 'utf8'));
const claudeLabels = { en: 'Claude Code activity', uk: 'Активність Claude Code', it: 'Attività con Claude Code', de: 'Aktivität mit Claude Code' };
const tokenLabels = { en: 'Reported tokens', uk: 'Зафіксовані токени', it: 'Token registrati', de: 'Erfasste Token' };
const sessionLabels = { en: 'Session starts', uk: 'Розпочаті сесії', it: 'Sessioni avviate', de: 'Gestartete Sitzungen' };
const historyLabels = {
  en: ['Show the previous 9 months', 'Hide the previous 9 months'],
  uk: ['Показати попередні 9 місяців', 'Приховати попередні 9 місяців'],
  it: ['Mostra i 9 mesi precedenti', 'Nascondi i 9 mesi precedenti'],
  de: ['Die vorherigen 9 Monate anzeigen', 'Die vorherigen 9 Monate ausblenden'],
};

async function checkPrintedMonths(section) {
  // Playwright's WebKit visibility fallback treats closed details as hidden,
  // even when print CSS exposes ::details-content. Check native paint/layout
  // visibility instead; the full twelve-card Safari print was also reviewed.
  const printed = await section.locator('.ai-month').evaluateAll(cards => cards.map(card => ({
    visible: card.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true }),
    width: card.getBoundingClientRect().width, height: card.getBoundingClientRect().height,
  })));
  expect(printed).toHaveLength(12);
  for (const card of printed) { expect(card.visible).toBe(true); expect(card.width).toBeGreaterThan(0); expect(card.height).toBeGreaterThan(0); }
}

async function checkMonthlyDisclosure(section, code, width) {
  const history = section.locator('.ai-month-history'), summary = history.locator('summary');
  await expect(section.locator('.ai-month:visible')).toHaveCount(3);
  await expect(history).not.toHaveAttribute('open', '');
  await expect(summary).toHaveAccessibleName(historyLabels[code][0]);
  expect(await summary.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  const arrow = summary.locator('.ai-history-arrow');
  const closedArrow = await arrow.evaluate(element => ({ color: getComputedStyle(element).color, transform: getComputedStyle(element).transform }));
  expect(closedArrow.color).toBe(await section.locator('h3').first().evaluate(element => getComputedStyle(element).color));
  const values = await section.locator('meter').evaluateAll(meters => meters.map(meter => [meter.value, meter.max]));
  await summary.click();
  await expect(history).toHaveAttribute('open', '');
  await expect(summary).toHaveAccessibleName(historyLabels[code][1]);
  await expect(section.locator('.ai-month:visible')).toHaveCount(12);
  expect(await arrow.evaluate(element => getComputedStyle(element).transform)).not.toBe(closedArrow.transform);
  expect(await section.locator('meter').evaluateAll(meters => meters.map(meter => [meter.value, meter.max]))).toEqual(values);
  const geometry = await section.locator('.ai-month:visible').evaluateAll(cards => cards.map(card => ({ left: card.getBoundingClientRect().left, right: card.getBoundingClientRect().right, overflow: card.scrollWidth - card.clientWidth })));
  for (const card of geometry) { expect(card.left).toBeGreaterThanOrEqual(0); expect(card.right).toBeLessThanOrEqual(width); expect(card.overflow).toBeLessThanOrEqual(1); }
  await summary.focus(); await section.page().keyboard.press('Space');
  await expect(history).not.toHaveAttribute('open', '');
  await expect(section.locator('.ai-month:visible')).toHaveCount(3);
  await expect(summary).toHaveAccessibleName(historyLabels[code][0]);
  await summary.focus(); await section.page().keyboard.press('Enter');
  await expect(section.locator('.ai-month:visible')).toHaveCount(12);
}

for (const code of Object.keys(titles)) for (const theme of ['light', 'dark']) for (const width of [320, 768, 1440]) {
  test(`${code} AI statistics in ${theme} at ${width}px show exact local data without overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: theme });
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4180')) external.push(request.url()); });
    await page.goto((code === 'en' ? '/ai/' : `/${code}/ai/`) + '#ai-activity');
    const section = page.locator('#ai-activity');
    await expect(page.getByRole('heading', { name: titles[code], exact: true })).toBeVisible();
    for (const [key, value] of Object.entries(snapshot.summary)) await expect(page.locator(`[data-ai-metric="${key}"] data`)).toHaveAttribute('value', String(value));
    await expect(section.locator('.ai-month')).toHaveCount(12);
    await expect(section.locator('#ai-month-scale')).toBeHidden();
    await checkMonthlyDisclosure(section, code, width);
    const months = await section.locator('.ai-month').evaluateAll(cards => cards.map(card => ({ month: card.dataset.aiMonth, tokens: Number(card.querySelector('data').value), activeDays: Number(card.querySelector('.ai-month-days span').textContent) })));
    expect(months).toEqual(snapshot.months);
    await expect(section.locator('.ai-month meter')).toHaveCount(12);
    await expect(section.locator('.ai-month-unit')).toHaveText(Array(12).fill(tokenLabels[code]));
    const maximum = Math.max(...snapshot.months.map(month => month.tokens));
    await expect(section.locator('#ai-month-scale')).toContainText(new Intl.NumberFormat(code).format(maximum));
    for (const meter of await section.locator('meter').all()) {
      await expect(meter).toHaveAttribute('max', String(maximum));
      await expect(meter).toHaveAttribute('aria-describedby', 'ai-month-scale');
    }
    await expect(section.locator('.ai-month-partial')).toHaveCount(1);
    await expect(section.locator('.ai-stats-updated time')).toHaveAttribute('datetime', snapshot.updatedAt);
    const geometry = await page.locator('.ai-month,.ai-stats-metrics > div').evaluateAll(cards => cards.map(card => ({ left: card.getBoundingClientRect().left, right: card.getBoundingClientRect().right, overflow: card.scrollWidth - card.clientWidth })));
    for (const card of geometry) { expect(card.left).toBeGreaterThanOrEqual(0); expect(card.right).toBeLessThanOrEqual(width); expect(card.overflow).toBeLessThanOrEqual(1); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const rows = await section.locator('.ai-month').evaluateAll(cards => new Set(cards.map(card => card.getBoundingClientRect().top)).size);
    expect(rows).toBe(width === 320 ? 12 : 4);
    const bars = await section.locator('.ai-month').evaluateAll(cards => cards.map(card => ({ row: card.getBoundingClientRect().top, bar: card.querySelector('meter').getBoundingClientRect().top })));
    for (const row of new Set(bars.map(card => card.row))) expect(new Set(bars.filter(card => card.row === row).map(card => card.bar)).size).toBe(1);
    for (const part of await page.locator('.ai-token-number,.ai-token-unit,.ai-duration-part').evaluateAll(parts => parts.map(part => getComputedStyle(part).whiteSpace))) expect(part).toBe('nowrap');
    await section.locator('.ai-stats-method summary').click();
    expect((await new AxeBuilder({ page }).include('#ai-activity').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    for (const path of ['/data/ai-stats.json', '/scripts/collect-ai-stats.mjs', '/auth.json', '/.codex/auth.json']) expect((await page.request.get(path)).status()).toBe(404);
    expect(external).toEqual([]); expect(errors).toEqual([]);
  });
}

test('AI statistics work without JavaScript and disclosures are keyboard accessible', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 900 } });
  const page = await context.newPage(); await page.goto('http://127.0.0.1:4180/uk/ai/#ai-activity');
  const section = page.locator('#ai-activity');
  await expect(section.locator('.ai-month')).toHaveCount(12);
  await checkMonthlyDisclosure(section, 'uk', 375);
  await section.locator('.ai-stats-method summary').focus(); await page.keyboard.press('Enter');
  await expect(section.locator('.ai-stats-method')).toHaveAttribute('open', '');
  await page.keyboard.press('Space'); await expect(section.locator('.ai-stats-method')).not.toHaveAttribute('open', '');
  await context.close();
});

test('AI statistics remain readable in forced colors and print', async ({ page }) => {
  await page.goto('/ai/#ai-activity'); await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.locator('#ai-activity .ai-stats-metrics')).toBeVisible(); await expect(page.locator('#ai-activity .ai-months-recent')).toBeVisible();
  await page.emulateMedia({ forcedColors: 'none', media: 'print' });
  await expect(page.locator('#ai-activity .ai-stats-metrics')).toBeVisible(); await expect(page.locator('#ai-activity .ai-months-recent')).toBeVisible();
  await checkPrintedMonths(page.locator('#ai-activity'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

for (const code of Object.keys(titles)) for (const theme of ['light', 'dark']) for (const width of [320, 768, 1440]) {
  test(`${code} Claude statistics in ${theme} at ${width}px preserve source coverage and do not leak data`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: theme });
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4180')) external.push(request.url()); });
    await page.goto((code === 'en' ? '/ai/' : `/${code}/ai/`) + '#claude-activity');
    const section = page.locator('#claude-activity');
    await expect(section.getByRole('heading', { name: 'Claude Code.', exact: true })).toBeVisible();
    await expect(section.locator('.eyebrow')).toHaveText(claudeLabels[code]);
    await expect(section.locator('.claude-coverage p')).toHaveCount(1);
    for (const [key, value] of Object.entries(claude.summary)) await expect(section.locator(`[data-claude-metric="${key}"] data`)).toHaveAttribute('value', String(value));
    await expect(section.locator('[data-claude-through]')).toHaveAttribute('datetime', claude.computedThrough);
    await expect(section.locator('.ai-stats-updated time')).toHaveAttribute('datetime', claude.updatedAt);
    expect(await section.locator('.claude-models code').allTextContents()).toEqual(claude.models);
    await expect(section.locator('#claude-month-scale')).toBeHidden();
    await checkMonthlyDisclosure(section, code, width);
    const months = await section.locator('[data-claude-month]').evaluateAll(cards => cards.map(card => ({ month: card.dataset.claudeMonth, sessions: card.querySelector('data') ? Number(card.querySelector('data').value) : null, activeDays: card.querySelector('data') ? Number(card.querySelector('.ai-month-days span').textContent) : null })));
    expect(months).toEqual(claude.months);
    await expect(section.locator('meter')).toHaveCount(claude.months.filter(month => month.sessions !== null).length);
    const maximum = Math.max(...claude.months.map(month => month.sessions ?? 0));
    await expect(section.locator('#claude-month-scale')).toContainText(new Intl.NumberFormat(code).format(maximum));
    for (const month of claude.months) {
      const card = section.locator(`[data-claude-month="${month.month}"]`);
      if (month.sessions === null) {
        await expect(card.locator('data,.ai-month-unit,meter')).toHaveCount(0);
      } else {
        await expect(card.locator('.ai-month-unit')).toHaveText(sessionLabels[code]);
        await expect(card.locator('meter')).toHaveAttribute('max', String(maximum));
        await expect(card.locator('meter')).toHaveAttribute('aria-describedby', 'claude-month-scale');
      }
    }
    const geometry = await section.locator('.ai-month,.ai-stats-metrics > div,.claude-models li').evaluateAll(cards => cards.map(card => ({ left: card.getBoundingClientRect().left, right: card.getBoundingClientRect().right, overflow: card.scrollWidth - card.clientWidth })));
    for (const card of geometry) { expect(card.left).toBeGreaterThanOrEqual(0); expect(card.right).toBeLessThanOrEqual(width); expect(card.overflow).toBeLessThanOrEqual(1); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await section.locator('.ai-stats-method summary').click();
    expect((await new AxeBuilder({ page }).include('#claude-activity').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
    for (const path of ['/data/claude-stats.json', '/scripts/collect-claude-stats.mjs', '/.claude/stats-cache.json']) expect((await page.request.get(path)).status()).toBe(404);
    expect(external).toEqual([]); expect(errors).toEqual([]);
  });
}

test('Claude provider links and statistics work without JavaScript and with a keyboard', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 900 } });
  const page = await context.newPage(); await page.goto('http://127.0.0.1:4180/uk/ai/');
  await page.locator('.ai-providers a[href="#claude-activity"]').click();
  await expect(page).toHaveURL(/#claude-activity$/);
  const section = page.locator('#claude-activity');
  await expect(section.locator('[data-claude-month]')).toHaveCount(12);
  await checkMonthlyDisclosure(section, 'uk', 375);
  await section.locator('.ai-stats-method summary').focus(); await page.keyboard.press('Enter');
  await expect(section.locator('.ai-stats-method')).toHaveAttribute('open','');
  await page.keyboard.press('Escape');
  await context.close();
});

test('Claude metrics stay visible in forced colors and print', async ({ page }) => {
  await page.goto('/ai/#claude-activity');
  const section = page.locator('#claude-activity');
  for (const media of [{ forcedColors: 'active' }, { forcedColors: 'none', media: 'print' }]) {
    await page.emulateMedia(media);
    await expect(page.locator('#claude-activity .ai-stats-metrics')).toBeVisible();
    await expect(page.locator('#claude-activity .ai-months-recent')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    if (media.media === 'print') await checkPrintedMonths(section);
  }
});
