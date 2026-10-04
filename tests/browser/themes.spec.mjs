import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { layoutCoverage } from './coverage.mjs';

const locales = [
  { code: 'en', path: '/?lang=en', light: 'Switch to light theme', dark: 'Switch to dark theme' },
  { code: 'uk', path: '/uk/', light: 'Увімкнути світлу тему', dark: 'Увімкнути темну тему' },
  { code: 'it', path: '/it/', light: 'Passa al tema chiaro', dark: 'Passa al tema scuro' },
  { code: 'de', path: '/de/', light: 'Zum hellen Design wechseln', dark: 'Zum dunklen Design wechseln' },
];
const palette = {
  light: { background: 'rgb(247, 248, 242)', heading: 'rgb(23, 32, 25)', accent: 'rgb(59, 97, 15)', border: 'rgb(115, 130, 108)' },
  dark: { background: 'rgb(11, 14, 18)', heading: 'rgb(237, 241, 245)', accent: 'rgb(198, 242, 78)', border: 'rgb(70, 81, 95)' },
};

for (const locale of locales) {
  for (const scheme of ['light', 'dark']) {
    for (const width of [320, 1440]) {
      test(`${locale.code}: ${scheme} theme is complete and accessible at ${width}px`, layoutCoverage({ width, theme: scheme }), async ({ page }) => {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        page.on('response', response => { if (response.status() >= 400) errors.push(response.url()); });
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize({ width, height: 900 });
        await page.goto(locale.path);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
        await expect(page.locator('body')).toHaveCSS('background-color', palette[scheme].background);
        await expect(page.locator('h1')).toHaveCSS('color', palette[scheme].heading);
        await expect(page.locator('.hero-tagline')).toHaveCSS('color', palette[scheme].accent);
        await expect(page.getByRole('button', { name: scheme === 'dark' ? locale.light : locale.dark, exact: true })).toBeVisible();
        for (const id of ['ci-case', 'api-case', 'team-case']) await page.locator(`#${id} summary`).click();
        await page.locator('.language-switcher summary').click();
        await expect(page.locator('.language-switcher summary')).toHaveCSS('color', palette[scheme].accent);
        await expect(page.locator('.language-list a[aria-current="page"]')).toHaveCSS('color', palette[scheme].accent);
        const metrics = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - innerWidth,
          themeWidth: document.querySelector('.theme-toggle').getBoundingClientRect().width,
          controls: [...document.querySelectorAll('.theme-toggle, .language-switcher summary, .site-nav a')].filter(el => el.getClientRects().length).map(el => {
            const rect = el.getBoundingClientRect();
            return { width: rect.width, height: rect.height, left: rect.left, right: rect.right };
          }),
        }));
        expect(metrics.overflow).toBeLessThanOrEqual(1);
        for (const control of metrics.controls) {
          expect(control.height).toBeGreaterThanOrEqual(44);
          expect(control.left).toBeGreaterThanOrEqual(0);
          expect(control.right).toBeLessThanOrEqual(width);
        }
        expect(metrics.themeWidth).toBeGreaterThanOrEqual(44);
        expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
        await page.locator('.language-switcher summary').click();
        await expect(page.locator('.language-switcher summary')).toHaveCSS('color', palette[scheme].heading);
        await expect(page.locator('.language-switcher summary')).toHaveCSS('border-top-color', palette[scheme].border);
        expect(errors).toEqual([]);
      });
    }
  }
}

test('system changes are followed until an explicit theme choice is made', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/?lang=en');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('portfolio-theme'))).toBeNull();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('portfolio-theme'))).toBe('light');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.locator('meta[name="theme-color"]').evaluateAll(nodes => nodes.map(meta => meta.content))).toEqual(['#f7f8f2', '#f7f8f2']);
});

test('saved theme is applied before the stylesheet loads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.setItem('portfolio-theme', 'light'));
  let checked = false;
  await page.route('**/styles.css?*', async route => {
    // The preload scanner may request CSS while the preceding script loads.
    // Hold the stylesheet response until the blocking theme script has run.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    checked = true;
    await route.continue();
  });
  await page.goto('/uk/');
  expect(checked).toBe(true);
  await expect(page.locator('body')).toHaveCSS('background-color', palette.light.background);
});

test('keyboard switching preserves the section and theme survives every language and 404 page', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/?lang=en#work');
  const button = page.locator('.theme-toggle');
  await button.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(button).toBeFocused();
  await expect(button).toHaveCSS('outline-style', 'solid');
  await expect(page).toHaveURL(/#work$/);
  await button.press('Space');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await button.press('Enter');
  for (const locale of locales.slice(1)) {
    await page.locator('.language-switcher summary').click();
    await page.locator(`.language-list a[data-language="${locale.code}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${locale.path}#work$`));
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByRole('button', { name: locale.dark, exact: true })).toBeVisible();
    const response = await page.goto(`${locale.path}missing/nested-page`);
    expect(response.status()).toBe(404);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('body')).toHaveCSS('background-color', palette.light.background);
    await page.locator('.button-primary').click();
    await expect(page.locator('html')).toHaveAttribute('lang', locale.code);
    await page.getByRole('navigation').getByRole('link').first().click();
  }
});

test('blocked storage does not break switching, navigation or page initialization', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', {
    configurable: true, get() { throw new DOMException('Blocked', 'SecurityError'); },
  }));
  await page.goto('/uk/');
  await page.getByRole('button', { name: 'Увімкнути світлу тему', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Увімкнути темну тему', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('navigation').getByRole('link', { name: 'Контакти', exact: true }).click();
  await expect(page).toHaveURL(/#contact$/);
  expect(errors).toEqual([]);
});

test('invalid saved theme falls back to the system preference', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('portfolio-theme', 'invalid'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('body')).toHaveCSS('background-color', palette.light.background);
});

test('theme preference synchronizes between tabs and clearing it restores system following', async ({ context, page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/?lang=en');
  const other = await context.newPage();
  await other.emulateMedia({ colorScheme: 'dark' });
  await other.goto('/uk/');
  await other.getByRole('button', { name: 'Увімкнути світлу тему', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click();
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.evaluate(() => localStorage.removeItem('portfolio-theme'));
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'dark');
  await other.emulateMedia({ colorScheme: 'light' });
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'light');
  await other.close();
});

for (const scheme of ['light', 'dark']) {
  test(`without JavaScript the ${scheme} system theme still works`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: scheme });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4180/uk/');
    await expect(page.locator('.theme-toggle')).toBeHidden();
    await expect(page.locator('body')).toHaveCSS('background-color', palette[scheme].background);
    await page.locator('.language-switcher summary').click();
    await page.getByRole('link', { name: 'Deutsch', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.locator('body')).toHaveCSS('background-color', palette[scheme].background);
    await page.locator('#ci-case summary').click();
    await expect(page.locator('#ci-case')).toHaveAttribute('open', '');
    await context.close();
  });

  test(`printing stays readable when the screen theme is ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/de/');
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.theme-toggle')).toBeHidden();
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(page.locator('#contact-title')).toHaveCSS('color', 'rgb(34, 34, 34)');
    await expect(page.locator('.tool-group').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });
}
