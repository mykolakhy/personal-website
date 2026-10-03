import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const locales = [
  { code: 'en', path: '', projects: 'Projects', ai: 'AI' },
  { code: 'uk', path: 'uk/', projects: 'Проєкти', ai: 'ШІ' },
  { code: 'it', path: 'it/', projects: 'Progetti', ai: 'IA' },
  { code: 'de', path: 'de/', projects: 'Projekte', ai: 'KI' },
];

for (const locale of locales) for (const theme of ['light', 'dark']) for (const width of [320, 390, 1000, 1001, 1440]) {
  test(`${locale.code} hero navigation fits ${theme} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(`/${locale.path}`);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.site-nav a')).toHaveCount(2);
    const navigation = page.locator('.hero-navigation');
    await expect(navigation.getByRole('link')).toHaveCount(2);
    await expect(navigation.getByRole('link', { name: locale.projects, exact: true })).toHaveAttribute('href', `${locale.path ? '../' : './'}${locale.path}projects/`);
    await expect(navigation.getByRole('link', { name: locale.ai, exact: true })).toHaveAttribute('href', `${locale.path ? '../' : './'}${locale.path}ai/`);
    for (const button of await navigation.getByRole('link').all()) {
      await expect(button).toHaveCSS('background-color', theme === 'dark' ? 'rgb(17, 21, 27)' : 'rgb(255, 255, 255)');
      await expect(button).toHaveCSS('color', theme === 'dark' ? 'rgb(237, 241, 245)' : 'rgb(23, 32, 25)');
    }
    const geometry = await page.evaluate(() => {
      const measure = element => {
        const { top, bottom, left, right, width, height } = element.getBoundingClientRect();
        return { top, bottom, left, right, width, height, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
      };
      return {
        scrollWidth: document.documentElement.scrollWidth,
        copy: measure(document.querySelector('.hero-copy')),
        actions: measure(document.querySelector('.hero-actions')),
        navigation: measure(document.querySelector('.hero-navigation')),
        proof: measure(document.querySelector('.proof-grid')),
        buttons: [...document.querySelectorAll('.hero-navigation a')].map(measure),
      };
    });
    expect(geometry.scrollWidth).toBeLessThanOrEqual(width + 1);
    const [first, second] = geometry.buttons;
    for (const button of geometry.buttons) {
      expect(button.left).toBeGreaterThanOrEqual(0);
      expect(button.right).toBeLessThanOrEqual(width);
      expect(button.height).toBeGreaterThanOrEqual(48);
      expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth + 1);
    }
    expect(Math.abs(first.width - second.width)).toBeLessThan(1);
    if (width > 1000) {
      expect(geometry.navigation.left).toBeGreaterThanOrEqual(geometry.copy.right + 31);
      expect(Math.abs(first.left - second.left)).toBeLessThan(1);
      expect(second.top).toBeGreaterThanOrEqual(first.bottom + 11);
      expect(first.top).toBeLessThan(geometry.actions.top);
    } else {
      expect(geometry.navigation.top).toBeGreaterThanOrEqual(geometry.actions.bottom + 23);
      expect(Math.abs(first.top - second.top)).toBeLessThan(1);
      expect(second.left).toBeGreaterThanOrEqual(first.right + 11);
      expect(geometry.navigation.bottom).toBeLessThanOrEqual(geometry.proof.top);
    }
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  });
}

for (const javaScriptEnabled of [true, false]) {
  test(`hero links and detail-page navigation work with JavaScript ${javaScriptEnabled ? 'on' : 'off'}`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled, viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
    const page = await context.newPage();
    try {
      for (const { code, path, projects } of locales) {
        await page.goto(`http://127.0.0.1:4180/${path}${code === 'en' ? '?lang=en' : ''}`);
        if (javaScriptEnabled && code === 'en') await page.locator('.theme-toggle').click();
        await page.locator('.hero-navigation a').first().click();
        await expect(page).toHaveURL(`http://127.0.0.1:4180/${path}projects/`);
        await expect(page.locator('html')).toHaveAttribute('lang', code);
        if (javaScriptEnabled) await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
        await expect(page.locator('.site-nav a')).toHaveCount(4);
        await expect(page.locator('.site-nav a[aria-current="page"]')).toHaveText(projects);
        await page.locator('.site-nav a').nth(2).click();
        await expect(page).toHaveURL(`http://127.0.0.1:4180/${path}ai/`);
        await page.locator('.wordmark').click();
        await expect(page.locator('html')).toHaveAttribute('data-page', 'home');
        await page.locator('.hero-navigation a').last().click();
        await expect(page).toHaveURL(`http://127.0.0.1:4180/${path}ai/`);
        if (javaScriptEnabled) await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      }
    } finally { await context.close(); }
  });
}

test('hero navigation supports keyboard activation and is omitted from printing', async ({ page }, info) => {
  await page.goto('/uk/');
  const buttons = page.locator('.hero-navigation a');
  await buttons.first().focus();
  await page.keyboard.press(process.platform === 'darwin' && info.project.name === 'webkit' ? 'Alt+Tab' : 'Tab');
  await expect(buttons.last()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('http://127.0.0.1:4180/uk/ai/');
  await page.locator('.wordmark').click();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.hero-navigation')).toBeHidden();
});
