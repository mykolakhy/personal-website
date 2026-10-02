import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const code of ['en', 'uk', 'it', 'de']) for (const kind of ['projects', 'ai']) for (const theme of ['light', 'dark']) for (const width of [320, 1440]) {
  test(`${code} ${kind} page is complete and accessible in ${theme} at ${width}px`, async ({ page }) => {
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) errors.push(response.url()); });
    page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4180')) external.push(request.url()); });
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: theme });
    await page.goto(`/${code === 'en' ? '' : code + '/'}${kind}/`);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('html')).toHaveAttribute('lang', code);
    await expect(page.locator('html')).toHaveAttribute('data-page', kind);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('main > section')).toHaveCount(3);
    await expect(page.locator('.site-nav a[aria-current="page"]')).toHaveCount(1);
    const labels = await page.locator('.site-nav a').allTextContents();
    expect(new Set(labels).size).toBe(4);
    if (kind === 'projects') {
      await expect(page.locator('[data-repository]')).toHaveCount(3);
      await expect(page.locator('[data-total]')).toHaveCount(4);
      expect(await page.locator('[data-repository]').first().evaluate(el => el.getBoundingClientRect().top)).toBeLessThan(await page.locator('.github-metrics').evaluate(el => el.getBoundingClientRect().top));
    } else {
      await expect(page.locator('#ai-workflow .principle')).toHaveCount(3);
      await expect(page.locator('[data-ai-metric]')).toHaveCount(5);
      await expect(page.locator('[data-ai-month]')).toHaveCount(12);
    }
    await page.locator('.language-switcher summary').click();
    await expect(page.locator('.language-list a')).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const targets = await page.locator('.wordmark,.site-nav a,.theme-toggle,.language-switcher summary,.language-list a,.page-back,.page-next a').evaluateAll(elements => elements.map(el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, height: el.getBoundingClientRect().height })));
    for (const target of targets) { expect(target.left).toBeGreaterThanOrEqual(0); expect(target.right).toBeLessThanOrEqual(width); expect(target.height).toBeGreaterThanOrEqual(44); }
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    await page.locator('.language-switcher summary').press('Escape');
    await expect(page.locator('.site-nav a[inert]')).toHaveCount(0);
    expect(external).toEqual([]); expect(errors).toEqual([]);
  });
}

for (const kind of ['projects', 'ai']) {
  test(`${kind} preserves its page, section and theme when switching languages and returning home`, async ({ page }) => {
    const hash = kind === 'projects' ? '#github' : '#ai-activity';
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(`/uk/${kind}/${hash}`);
    await page.locator('.theme-toggle').click();
    for (const code of ['it', 'de', 'en', 'uk']) {
      await page.locator('.language-switcher summary').click();
      await page.locator(`.language-list a[data-language="${code}"]`).click();
      await expect(page).toHaveURL(`http://127.0.0.1:4180/${code === 'en' ? '' : code + '/'}${kind}/${code === 'en' ? '?lang=en' : ''}${hash}`);
      await expect(page.locator('html')).toHaveAttribute('data-page', kind);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    }
    await page.goto(`/${kind}/${hash}`);
    await expect(page).toHaveURL(`http://127.0.0.1:4180/uk/${kind}/${hash}`);
    await page.locator('.site-nav a').last().click();
    await expect(page).toHaveURL('http://127.0.0.1:4180/uk/#contact');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.goBack();
    await expect(page.locator('html')).toHaveAttribute('data-page', kind);
    await page.locator('.page-back').click();
    await expect(page).toHaveURL('http://127.0.0.1:4180/uk/');
  });
}

test('legacy one-page links reach moved content and retain explicit language choices', async ({ page }) => {
  for (const [hash, destination] of [['github', 'projects/#github'], ['ai-workflow', 'ai/#ai-workflow'], ['ai-activity', 'ai/#ai-activity']]) {
    await page.goto(`/uk/#${hash}`);
    await expect(page).toHaveURL(`http://127.0.0.1:4180/uk/${destination}`);
  }
  await page.goto('/?lang=en#ai-activity');
  await expect(page).toHaveURL('http://127.0.0.1:4180/ai/?lang=en#ai-activity');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.goto('/it/#writing');
  await expect(page).toHaveURL('http://127.0.0.1:4180/it/#expertise');
  await page.goto('/de/#ci-case');
  await expect(page.locator('#ci-case')).toHaveAttribute('open', '');
});

test('all twelve pages and page-language navigation work without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 900 } });
  const page = await context.newPage();
  try {
    for (const code of ['en', 'uk', 'it', 'de']) for (const kind of ['', 'projects/', 'ai/']) {
      const response = await page.goto(`http://127.0.0.1:4180/${code === 'en' ? '' : code + '/'}${kind}`);
      expect(response.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', code);
      await expect(page.locator('h1')).toHaveCount(1);
      await page.locator('.language-switcher summary').click();
      await page.locator('.language-list a[data-language="en"]').click();
      await expect(page).toHaveURL(`http://127.0.0.1:4180/${kind}?lang=en`);
    }
    await page.goto('http://127.0.0.1:4180/uk/#ai-activity');
    await expect(page.locator('#ai-activity .text-link')).toBeVisible();
    await page.locator('#ai-activity .text-link').click();
    await expect(page).toHaveURL('http://127.0.0.1:4180/uk/ai/');
    await expect(page.locator('[data-ai-metric]')).toHaveCount(5);
  } finally { await context.close(); }
});
