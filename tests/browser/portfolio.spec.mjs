import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('all sections, resources and local navigation work without errors', async ({ page }) => {
  const errors = [];
  const external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => { if (!request.url().startsWith('http://127.0.0.1:4180')) external.push(request.url()); });
  page.on('response', (response) => { if (response.status() >= 400) errors.push(response.url() + ': ' + response.status()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mykola Khytra.');
  await expect(page.getByText('faster execution for CI jobs', { exact: true })).toBeVisible();
  await expect(page.locator('main section')).toHaveCount(8);
  const links = await page.locator('a[href^="#"]').evaluateAll((links) => links.map((link) => ({ href: link.getAttribute('href'), valid: Boolean(document.getElementById(link.hash.slice(1))) })));
  expect(links.every((link) => link.valid)).toBe(true);
  await page.getByRole('link', { name: 'Read the CI case' }).click();
  await expect(page.locator('#ci-case')).toHaveAttribute('open', '');
  await expect(page.locator('#ci-case summary')).toBeFocused();
  await expect(page.locator('#ci-case')).toContainText('These improvements covered many CI jobs, not all jobs or the entire delivery pipeline.');
  await page.getByRole('link', { name: 'Read the API case' }).click();
  await expect(page.locator('#api-case')).toHaveAttribute('open', '');
  await page.getByRole('link', { name: 'Read the team case' }).click();
  await expect(page.locator('#team-case')).toHaveAttribute('open', '');
  await page.getByRole('navigation').getByRole('link', { name: 'Contact' }).click();
  await expect(page).toHaveURL(/#contact$/);
  const downloads = await page.locator('a[download]').evaluateAll((links) => [...new Set(links.map((link) => link.href))]);
  for (const url of downloads) {
    const response = await page.request.get(url);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('application/pdf');
    expect((await response.body()).toString('ascii', 0, 5)).toBe('%PDF-');
  }
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

for (const width of [320, 375, 390, 600, 768, 800, 801, 1024, 1440]) {
  test(`responsive layout and full contacts at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    for (const id of ['ci-case', 'api-case', 'team-case']) await page.locator(`#${id} summary`).click();
    const metrics = await page.evaluate(() => {
      const measure = (selector) => { const element = document.querySelector(selector); const rect = element.getBoundingClientRect(); return { width: rect.width, height: rect.height, top: rect.top, style: getComputedStyle(element).textOverflow, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }; };
      return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, header: [...document.querySelectorAll('.site-nav a, .wordmark')].map((el) => ({ height: el.getBoundingClientRect().height, right: el.getBoundingClientRect().right })), email: measure('.contact-link strong'), portrait: measure('.portrait-frame'), about: measure('.about-copy'), h1: measure('h1') };
    });
    expect(metrics.width).toBe(width);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(width + 1);
    expect(metrics.email.style).not.toBe('ellipsis');
    expect(metrics.email.scrollWidth).toBeLessThanOrEqual(metrics.email.clientWidth + 1);
    for (const target of metrics.header) { expect(target.height).toBeGreaterThanOrEqual(44); expect(target.right).toBeLessThanOrEqual(width); }
    if (width > 800) expect(Math.abs(metrics.portrait.top - metrics.about.top)).toBeLessThan(1);
    await page.getByRole('navigation').getByRole('link', { name: 'Contact' }).click();
    await expect.poll(() => page.locator('#contact-title').evaluate((element) => element.getBoundingClientRect().top)).toBeGreaterThan(64);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(result.violations).toEqual([]);
  });
}

test('keyboard skip link, disclosures and deep links', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  await page.goto('/#ci-case');
  await expect(page.locator('#ci-case')).toHaveAttribute('open', '');
  await page.locator('#ci-case summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#ci-case')).not.toHaveAttribute('open', '');
  await page.keyboard.press('Space');
  await expect(page.locator('#ci-case')).toHaveAttribute('open', '');
  await page.locator('#api-case summary').click();
  await page.locator('#team-case summary').click();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
});

test('reduced motion, print and resource budgets', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
  await page.locator('.portrait-frame').scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('.portrait-frame img').evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => ({ name: entry.name, bytes: entry.encodedBodySize })));
  expect(resources.reduce((total, entry) => total + entry.bytes, 0)).toBeLessThan(350000);
  expect(resources.some((entry) => /portrait-\d+\.(avif|webp|jpg)$/.test(entry.name))).toBe(true);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.site-header')).toBeHidden();
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(255, 255, 255)');
  expect(await page.locator('#contact-title').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(34, 34, 34)');
});

test('core content and native disclosures work with JavaScript disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4180/');
  await page.locator('#ci-case summary').click();
  await expect(page.getByText('Faster feedback across the optimized jobs, with a runtime reduction from approximately 60 minutes to 15.', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download CV PDF', exact: true })).toBeVisible();
  await context.close();
});

test('forced-colors keeps visible keyboard focus and control boundaries', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  const outline = await page.getByRole('link', { name: 'Skip to content' }).evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).toBe('solid');
  expect(await page.locator('.button-primary').evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('solid');
});
