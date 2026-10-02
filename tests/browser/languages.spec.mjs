import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const locales = [
  { code: 'en', path: '/', short: 'EN', contact: 'Contact', cv: 'Download CV' },
  { code: 'uk', path: '/uk/', short: 'UA', contact: 'Контакти', cv: 'Завантажити CV (англійською)' },
  { code: 'it', path: '/it/', short: 'IT', contact: 'Contatti', cv: 'Scarica il CV (in inglese)' },
  { code: 'de', path: '/de/', short: 'DE', contact: 'Kontakt', cv: 'CV herunterladen (Englisch)' },
];

for (const locale of locales) {
  for (const width of [375, 1440]) {
    test(`${locale.code}: language button restores its default style after closing at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(locale.path);
      const button = page.locator('.language-switcher summary');
      const menu = page.locator('.language-switcher');
      const expectClosed = async () => {
        await expect(menu).not.toHaveAttribute('open', '');
        await expect(button).toHaveCSS('color', 'rgb(237, 241, 245)');
        await expect(button).toHaveCSS('border-top-color', 'rgb(70, 81, 95)');
        await expect(page.locator('.site-nav a[inert]')).toHaveCount(0);
      };
      await expectClosed();
      for (let cycle = 0; cycle < 2; cycle++) {
        await button.click();
        await expect(menu).toHaveAttribute('open', '');
        await expect(button).toHaveCSS('color', 'rgb(198, 242, 78)');
        await expect(button).toHaveCSS('border-top-color', 'rgb(198, 242, 78)');
        await button.click();
        // The pointer is still over the summary; hover must not look open.
        await expectClosed();
      }
      await button.press('Enter');
      await expect(menu).toHaveAttribute('open', '');
      await button.press('Escape');
      await expectClosed();
      await expect(button).toBeFocused();
      await button.click();
      await page.locator('.hero-lede').click();
      await expectClosed();
    });
  }
  for (const width of [320, 375, 600, 601, 768, 1440]) {
    test(`${locale.code}: complete accessible layout at ${width}px`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('response', response => { if (response.status() >= 400) errors.push(response.url()); });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(locale.path);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('html')).toHaveAttribute('lang', locale.code);
      await expect(page.locator('main section')).toHaveCount(9);
      await expect(page.locator('h1')).toHaveText('Mykola Khytra.');
      await expect(page.locator('.hero-actions a[download]')).toContainText(locale.cv);
      for (const id of ['ci-case', 'api-case', 'team-case']) await page.locator(`#${id} summary`).click();
      await page.locator('.language-switcher summary').click();
      await expect(page.locator('.language-list a[aria-current="page"]')).toHaveAttribute('data-language', locale.code);
      await expect(page.locator('.language-list a')).toHaveCount(4);
      // Native details emits its toggle event asynchronously after opening.
      await expect.poll(() => page.evaluate(() => {
        const menu = document.querySelector('.language-list').getBoundingClientRect();
        return [...document.querySelectorAll('.site-nav a')].every(link => {
          const rect = link.getBoundingClientRect();
          const covered = rect.left < menu.right && rect.right > menu.left && rect.top < menu.bottom && rect.bottom > menu.top;
          return link.inert === covered;
        });
      })).toBe(true);
      const metrics = await page.evaluate(() => {
        const button = document.querySelector('.language-switcher summary').getBoundingClientRect();
        const menu = document.querySelector('.language-list').getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth - innerWidth,
          dropdownGap: menu.top - button.bottom,
          dropdownRight: menu.right - button.right,
          wordmarkCenter: (() => {
            const rect = document.querySelector('.wordmark').getBoundingClientRect();
            return (rect.top + rect.bottom - button.top - button.bottom) / 2;
          })(),
          navigation: [...document.querySelectorAll('.site-nav a')].map(el => {
            const rect = el.getBoundingClientRect();
            return { inert: el.inert, covered: rect.left < menu.right && rect.right > menu.left && rect.top < menu.bottom && rect.bottom > menu.top };
          }),
          targets: [...document.querySelectorAll('.site-nav a, .wordmark, .language-switcher summary, .language-list a')].map(el => {
            const rect = el.getBoundingClientRect(); return { left: rect.left, right: rect.right, height: rect.height };
          }),
        };
      });
      expect(metrics.overflow).toBeLessThanOrEqual(1);
      expect(metrics.dropdownGap).toBeCloseTo(8, 0);
      expect(metrics.dropdownRight).toBeCloseTo(0, 0);
      if (width <= 600) {
        expect(Math.abs(metrics.wordmarkCenter)).toBeLessThan(1);
      }
      for (const link of metrics.navigation) expect(link.inert).toBe(link.covered);
      for (const target of metrics.targets) {
        expect(target.height).toBeGreaterThanOrEqual(44);
        expect(target.left).toBeGreaterThanOrEqual(0);
        expect(target.right).toBeLessThanOrEqual(width);
      }
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
      await page.locator('.language-switcher summary').press('Escape');
      await expect(page.locator('.language-switcher')).not.toHaveAttribute('open', '');
      await expect(page.locator('.site-nav a[inert]')).toHaveCount(0);
      await page.getByRole('navigation').getByRole('link', { name: locale.contact, exact: true }).click();
      const headerBottom = await page.locator('.site-header').evaluate(el => el.getBoundingClientRect().bottom);
      await expect.poll(() => page.locator('#contact-title').evaluate(el => el.getBoundingClientRect().top)).toBeGreaterThan(headerBottom);
      expect(errors).toEqual([]);
    });
  }
}

test('switcher preserves the section, remembers the language and honors explicit routes', async ({ page }) => {
  await page.goto('/#ci-case');
  await page.locator('.language-switcher summary').press('Enter');
  await page.getByRole('link', { name: 'Українська', exact: true }).click();
  await expect(page).toHaveURL(/\/uk\/#ci-case$/);
  await expect(page.locator('#ci-case')).toHaveAttribute('open', '');
  await page.goto('/#contact');
  await expect(page).toHaveURL(/\/uk\/#contact$/);
  await page.goto('/de/#work');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await page.locator('.language-switcher summary').click();
  await page.getByRole('link', { name: 'English', exact: true }).click();
  await expect(page).toHaveURL(/\/\?lang=en#work$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('.language-switcher summary').click();
  await page.locator('h1').click();
  await expect(page.locator('.language-switcher')).not.toHaveAttribute('open', '');
});

test('all languages and language links work without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const locale of locales) {
    await page.goto('http://127.0.0.1:4180' + locale.path);
    await expect(page.locator('html')).toHaveAttribute('lang', locale.code);
    await expect(page.locator('main section')).toHaveCount(9);
    await page.locator('#ci-case summary').click();
    await expect(page.locator('#ci-case')).toHaveAttribute('open', '');
    await page.locator('.language-switcher summary').click();
    await page.getByRole('link', { name: 'English', exact: true }).click();
    await expect(page).toHaveURL(/\/\?lang=en/);
    const pdf = await page.request.get(await page.locator('.hero-actions a[download]').getAttribute('href'));
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  }
  await context.close();
});

test('blocked storage does not prevent language switching', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage disabled', 'SecurityError'); } });
  });
  await page.goto('/it/#writing');
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  await page.locator('.language-switcher summary').click();
  await page.getByRole('link', { name: 'English', exact: true }).click();
  await expect(page).toHaveURL(/\/\?lang=en#writing$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('invalid stored languages cannot cause redirects', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('portfolio-language', 'https://untrusted.example/'));
  await page.goto('/#work');
  await expect(page).toHaveURL('http://127.0.0.1:4180/#work');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('covered navigation restores on outside click and resizing an open menu', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/uk/');
  await page.locator('.language-switcher summary').click();
  await expect.poll(() => page.locator('.site-nav a[inert]').count()).toBeGreaterThan(0);
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(page.locator('.language-switcher')).toHaveAttribute('open', '');
  await expect(page.locator('.site-nav a[inert]')).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 900 });
  await expect.poll(() => page.locator('.site-nav a[inert]').count()).toBeGreaterThan(0);
  await page.locator('.hero-lede').click();
  await expect(page.locator('.language-switcher')).not.toHaveAttribute('open', '');
  await expect(page.locator('.site-nav a[inert]')).toHaveCount(0);
  await page.getByRole('navigation').getByRole('link', { name: 'Контакти' }).click();
  await expect(page).toHaveURL(/#contact$/);
});
