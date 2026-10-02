import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
const snapshot = JSON.parse(await readFile('data/ai-stats.json', 'utf8'));
const titles = { en: 'AI, in numbers.', uk: 'ШІ у цифрах.', it: 'L’IA, in numeri.', de: 'KI in Zahlen.' };

for (const code of Object.keys(titles)) for (const theme of ['light', 'dark']) for (const width of [320, 768, 1440]) {
  test(`${code} AI statistics in ${theme} at ${width}px show exact local data without overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: theme });
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4180')) external.push(request.url()); });
    await page.goto((code === 'en' ? '/' : `/${code}/`) + '#ai-activity');
    await expect(page.getByRole('heading', { name: titles[code], exact: true })).toBeVisible();
    for (const [key, value] of Object.entries(snapshot.summary)) await expect(page.locator(`[data-ai-metric="${key}"] data`)).toHaveAttribute('value', String(value));
    await expect(page.locator('.ai-month')).toHaveCount(12);
    const months = await page.locator('.ai-month').evaluateAll(cards => cards.map(card => ({ month: card.dataset.aiMonth, tokens: Number(card.querySelector('data').value), activeDays: Number(card.querySelector('.ai-month-days span').textContent) })));
    expect(months).toEqual(snapshot.months);
    await expect(page.locator('.ai-month meter')).toHaveCount(12);
    await expect(page.locator('.ai-month-partial')).toHaveCount(1);
    await expect(page.locator('.ai-stats-updated time')).toHaveAttribute('datetime', snapshot.updatedAt);
    const geometry = await page.locator('.ai-month,.ai-stats-metrics > div').evaluateAll(cards => cards.map(card => ({ left: card.getBoundingClientRect().left, right: card.getBoundingClientRect().right, overflow: card.scrollWidth - card.clientWidth })));
    for (const card of geometry) { expect(card.left).toBeGreaterThanOrEqual(0); expect(card.right).toBeLessThanOrEqual(width); expect(card.overflow).toBeLessThanOrEqual(1); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const rows = await page.locator('.ai-month').evaluateAll(cards => new Set(cards.map(card => card.getBoundingClientRect().top)).size);
    expect(rows).toBe(width === 320 ? 6 : width === 768 ? 4 : 3);
    const bars = await page.locator('.ai-month').evaluateAll(cards => cards.map(card => ({ row: card.getBoundingClientRect().top, bar: card.querySelector('meter').getBoundingClientRect().top })));
    for (const row of new Set(bars.map(card => card.row))) expect(new Set(bars.filter(card => card.row === row).map(card => card.bar)).size).toBe(1);
    for (const part of await page.locator('.ai-token-number,.ai-token-unit,.ai-duration-part').evaluateAll(parts => parts.map(part => getComputedStyle(part).whiteSpace))) expect(part).toBe('nowrap');
    await page.locator('.ai-stats-method summary').click();
    expect((await new AxeBuilder({ page }).include('#ai-activity').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    for (const path of ['/data/ai-stats.json', '/scripts/collect-ai-stats.mjs', '/auth.json', '/.codex/auth.json']) expect((await page.request.get(path)).status()).toBe(404);
    expect(external).toEqual([]); expect(errors).toEqual([]);
  });
}

test('AI statistics work without JavaScript and disclosures are keyboard accessible', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 900 } });
  const page = await context.newPage(); await page.goto('http://127.0.0.1:4180/uk/#ai-activity');
  await expect(page.locator('.ai-month')).toHaveCount(12);
  await page.locator('.ai-stats-method summary').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.ai-stats-method')).toHaveAttribute('open', '');
  await page.keyboard.press('Space'); await expect(page.locator('.ai-stats-method')).not.toHaveAttribute('open', '');
  await context.close();
});

test('AI statistics remain readable in forced colors and print', async ({ page }) => {
  await page.goto('/#ai-activity'); await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.locator('.ai-stats-metrics')).toBeVisible(); await expect(page.locator('.ai-months')).toBeVisible();
  await page.emulateMedia({ forcedColors: 'none', media: 'print' });
  await expect(page.locator('.ai-stats-metrics')).toBeVisible(); await expect(page.locator('.ai-months')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});
