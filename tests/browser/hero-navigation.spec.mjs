import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { layoutCoverage } from './coverage.mjs';

const locales = [
  { code: 'en', path: '', projects: 'Projects', ai: 'AI' },
  { code: 'uk', path: 'uk/', projects: 'Проєкти', ai: 'ШІ' },
  { code: 'it', path: 'it/', projects: 'Progetti', ai: 'IA' },
  { code: 'de', path: 'de/', projects: 'Projekte', ai: 'KI' },
];

for (const locale of locales) for (const theme of ['light', 'dark']) for (const width of [320, 390, 600, 601, 1000, 1001, 1440]) {
  test(`${locale.code} hero navigation fits ${theme} at ${width}px`, layoutCoverage({ width, theme, webkitBoundary: locale.code === 'uk' && [600, 601, 1000, 1001].includes(width) }), async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(`/${locale.path}`);
    await page.evaluate(() => document.fonts.ready);
    const compact = width <= 600;
    await expect(page.locator('.site-nav a')).toHaveCount(4);
    await expect(page.locator('.site-nav a:visible')).toHaveCount(compact ? 4 : 2);
    const navigation = page.locator(compact ? '.site-nav' : '.hero-navigation');
    const destinations = compact ? navigation.locator('.compact-page-link') : navigation.getByRole('link');
    if (compact) await expect(page.locator('.hero-navigation')).toBeHidden();
    else await expect(page.locator('.hero-navigation')).toBeVisible();
    await expect(destinations).toHaveCount(2);
    await expect(navigation.getByRole('link', { name: locale.projects, exact: true })).toHaveAttribute('href', `${locale.path ? '../' : './'}${locale.path}projects/`);
    await expect(navigation.getByRole('link', { name: locale.ai, exact: true })).toHaveAttribute('href', `${locale.path ? '../' : './'}${locale.path}ai/`);
    for (const button of await destinations.all()) {
      await expect(button).toHaveCSS('background-color', compact ? 'rgba(0, 0, 0, 0)' : theme === 'dark' ? 'rgb(17, 21, 27)' : 'rgb(255, 255, 255)');
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
        navigation: measure(document.querySelector(innerWidth <= 600 ? '.site-nav' : '.hero-navigation')),
        proof: measure(document.querySelector('.proof-grid')),
        wordmark: measure(document.querySelector('.wordmark')),
        controls: measure(document.querySelector('.header-controls')),
        links: [...document.querySelectorAll('.site-nav a')].filter(el => el.getClientRects().length).map(measure),
        buttons: [...document.querySelectorAll(innerWidth <= 600 ? '.compact-page-link' : '.hero-navigation a')].map(measure),
        compactParts: [...document.querySelectorAll('.compact-page-link')].map(link => ({
          label: measure(link.children[0]), arrow: measure(link.children[1]),
          inset: parseFloat(getComputedStyle(link).paddingLeft) + parseFloat(getComputedStyle(link).borderLeftWidth),
          background: getComputedStyle(link).backgroundColor,
        })),
        themeBackground: getComputedStyle(document.querySelector('.theme-toggle')).backgroundColor,
        languageBackground: getComputedStyle(document.querySelector('.language-switcher summary')).backgroundColor,
      };
    });
    expect(geometry.scrollWidth).toBeLessThanOrEqual(width + 1);
    const [first, second] = geometry.buttons;
    for (const button of geometry.buttons) {
      expect(button.left).toBeGreaterThanOrEqual(0);
      expect(button.right).toBeLessThanOrEqual(width);
      expect(button.height).toBeGreaterThanOrEqual(compact ? 44 : 48);
      expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth + 1);
    }
    if (compact) {
      expect(geometry.navigation.top).toBeGreaterThanOrEqual(geometry.wordmark.bottom);
      expect(geometry.navigation.top).toBeGreaterThanOrEqual(geometry.controls.bottom);
      const [projects, ai, work, contact] = geometry.links;
      const gap = width <= 360 ? 4 : 8;
      expect(Math.abs(projects.width - ai.width)).toBeLessThan(1);
      expect(projects.left).toBeCloseTo(geometry.navigation.left, 0);
      expect(ai.left - projects.right).toBeCloseTo(gap, 0);
      expect(work.left - ai.right).toBeCloseTo(gap, 0);
      expect(contact.left - work.right).toBeCloseTo(gap, 0);
      expect(contact.right).toBeCloseTo(geometry.navigation.right, 0);
      for (const [index, part] of geometry.compactParts.entries()) {
        const button = geometry.buttons[index];
        expect(part.background).toBe(geometry.themeBackground);
        expect(part.background).toBe(geometry.languageBackground);
        expect(part.label.left - button.left).toBeCloseTo(part.inset, 0);
        expect(button.right - part.arrow.right).toBeCloseTo(part.inset, 0);
        expect(part.inset).toBeGreaterThanOrEqual(9);
        expect(part.arrow.left - part.label.right).toBeGreaterThanOrEqual(4);
      }
      for (const link of geometry.links) { expect(link.top).toBeCloseTo(first.top, 0); expect(link.height).toBeGreaterThanOrEqual(44); expect(link.width).toBeGreaterThanOrEqual(44); }
    } else if (width > 1000) {
      expect(Math.abs(first.width - second.width)).toBeLessThan(1);
      expect(geometry.navigation.left).toBeGreaterThanOrEqual(geometry.copy.right + 31);
      expect(Math.abs(first.left - second.left)).toBeLessThan(1);
      expect(second.top).toBeGreaterThanOrEqual(first.bottom + 11);
      expect(first.top).toBeLessThan(geometry.actions.top);
    } else {
      expect(Math.abs(first.width - second.width)).toBeLessThan(1);
      expect(geometry.navigation.top).toBeGreaterThanOrEqual(geometry.actions.bottom + 23);
      expect(Math.abs(first.top - second.top)).toBeLessThan(1);
      expect(second.left).toBeGreaterThanOrEqual(first.right + 11);
      expect(geometry.navigation.bottom).toBeLessThanOrEqual(geometry.proof.top);
    }
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  });
}

for (const theme of ['light', 'dark']) test(`narrow header keeps comfortable button insets and resize behavior in ${theme}`, async ({ page }) => {
  for (const { path } of locales) {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(`/${path}`);
    await page.evaluate(() => document.fonts.ready);
    for (const width of [280, 300, 319, 320, 340, 360, 361, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await page.locator('.site-nav').evaluate(nav => {
        const rect = element => {
          const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
          return { left, right, top, bottom, width, height };
        };
        return {
          nav: rect(nav), overflow: document.documentElement.scrollWidth - innerWidth,
          controls: rect(document.querySelector('.header-controls')),
          links: [...nav.children].map(link => ({ ...rect(link), fontSize: getComputedStyle(link).fontSize })),
          parts: [...nav.querySelectorAll('.compact-page-link')].map(link => ({
            label: rect(link.children[0]), arrow: rect(link.children[1]),
          })),
        };
      });
      expect(layout.overflow).toBeLessThanOrEqual(1);
      const [projects, ai, work, contact] = layout.links;
      expect(Math.abs(projects.width - ai.width)).toBeLessThan(1);
      expect(projects.left).toBeCloseTo(layout.nav.left, 0);
      expect(contact.right).toBeCloseTo(layout.nav.right, 0);
      expect(projects.top).toBeGreaterThanOrEqual(layout.controls.bottom);
      for (const [index, part] of layout.parts.entries()) {
        const button = layout.links[index];
        expect(part.label.left - button.left).toBeCloseTo(9, 0);
        expect(button.right - part.arrow.right).toBeCloseTo(9, 0);
        expect(part.arrow.left - part.label.right).toBeGreaterThanOrEqual(4);
      }
      for (const link of layout.links) {
        expect(link.height).toBeGreaterThanOrEqual(44);
        expect(link.width).toBeGreaterThanOrEqual(44);
        expect(link.fontSize).toBe('12px');
        expect(link.left).toBeGreaterThanOrEqual(0);
        expect(link.right).toBeLessThanOrEqual(width);
      }
      if (width < 320) {
        expect(ai.right).toBeCloseTo(layout.nav.right, 0);
        expect(work.top).toBeGreaterThanOrEqual(projects.bottom + 4);
        expect(contact.top).toBeCloseTo(work.top, 0);
        expect(contact.left - work.right).toBeCloseTo(4, 0);
      } else {
        for (const link of layout.links) expect(link.top).toBeCloseTo(projects.top, 0);
        expect(work.left - ai.right).toBeCloseTo(width <= 360 ? 4 : 8, 0);
      }
      await page.locator('.language-switcher summary').click();
      await expect.poll(() => page.evaluate(() => {
        const menu = document.querySelector('.language-list').getBoundingClientRect();
        return [...document.querySelectorAll('.site-nav a')].every(link => {
          const r = link.getBoundingClientRect();
          return link.inert === (r.left < menu.right && r.right > menu.left && r.top < menu.bottom && r.bottom > menu.top);
        });
      })).toBe(true);
      await page.locator('.language-switcher summary').press('Escape');
      await expect(page.locator('.site-nav a[inert]')).toHaveCount(0);
    }
    await page.getByRole('navigation').getByRole('link').last().click();
    const headerBottom = await page.locator('.site-header').evaluate(el => el.getBoundingClientRect().bottom);
    expect(await page.locator('#contact-title').evaluate(el => el.getBoundingClientRect().top)).toBeGreaterThan(headerBottom);
  }
});

for (const javaScriptEnabled of [true, false]) {
  test(`hero links and detail-page navigation work with JavaScript ${javaScriptEnabled ? 'on' : 'off'}`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled, viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
    const page = await context.newPage();
    try {
      for (const { code, path, projects } of locales) {
        await page.goto(`http://127.0.0.1:4180/${path}${code === 'en' ? '?lang=en' : ''}`);
        if (javaScriptEnabled && code === 'en') await page.locator('.theme-toggle').click();
        await page.locator('.site-nav .compact-page-link').first().click();
        await expect(page).toHaveURL(`http://127.0.0.1:4180/${path}projects/`);
        await expect(page.locator('html')).toHaveAttribute('lang', code);
        if (javaScriptEnabled) await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
        await expect(page.locator('.site-nav a')).toHaveCount(4);
        await expect(page.locator('.site-nav a[aria-current="page"]')).toHaveText(projects);
        await page.locator('.site-nav a').nth(2).click();
        await expect(page).toHaveURL(`http://127.0.0.1:4180/${path}ai/`);
        await page.locator('.wordmark').click();
        await expect(page.locator('html')).toHaveAttribute('data-page', 'home');
        await page.locator('.site-nav .compact-page-link').last().click();
        await expect(page).toHaveURL(`http://127.0.0.1:4180/${path}ai/`);
        if (javaScriptEnabled) await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      }
    } finally { await context.close(); }
  });
}

for (const width of [390, 1440]) test(`responsive page navigation supports keyboard activation and printing at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/uk/');
  const buttons = page.locator(width <= 600 ? '.compact-page-link' : '.hero-navigation a');
  await buttons.first().focus();
  await page.keyboard.press(process.platform === 'darwin' && info.project.name === 'webkit' ? 'Alt+Tab' : 'Tab');
  await expect(buttons.last()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('http://127.0.0.1:4180/uk/ai/');
  await page.locator('.wordmark').click();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.hero-navigation')).toBeHidden();
  await expect(page.locator('.site-header')).toBeHidden();
});
