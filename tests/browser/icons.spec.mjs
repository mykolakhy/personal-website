import { test, expect } from '@playwright/test';

for (const theme of ['dark', 'light']) {
  test(`diagonal arrows remain vector icons in every language and page in ${theme}`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('portfolio-theme', value), theme);
    for (const prefix of ['', 'uk/', 'it/', 'de/']) for (const route of ['', 'projects/', 'ai/']) {
      await page.setViewportSize({ width: 393, height: 852 });
      await page.goto(`/${prefix}${route}${prefix ? '' : '?lang=en'}`);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const icons = page.locator('svg.arrow-icon');
      const expectedCount = route === '' ? 4 : route === 'ai/' ? 1 : await page.locator('.github-project').count() + 3;
      await expect(icons).toHaveCount(expectedCount);
      expect(await page.locator('body').textContent()).not.toContain('↗');
      for (const width of [320, 393, 1440]) {
        await page.setViewportSize({ width, height: 852 });
        const measurements = await icons.evaluateAll(elements => elements.map(icon => {
          const rect = icon.getBoundingClientRect(), style = getComputedStyle(icon);
          return {
            tag: icon.tagName, hidden: icon.getAttribute('aria-hidden'), focusable: icon.getAttribute('focusable'),
            text: icon.textContent, paths: icon.querySelectorAll('path').length,
            shape: icon.querySelector('path')?.getAttribute('d'), fill: style.fill, stroke: style.stroke, color: style.color,
            width: rect.width, height: rect.height, right: rect.right,
          };
        }));
        for (const icon of measurements) {
          expect(icon.tag).toBe('svg');
          expect(icon.hidden).toBe('true');
          expect(icon.focusable).toBe('false');
          expect(icon.text).toBe('');
          expect(icon.paths).toBe(1);
          expect(icon.shape).toBe('M5 19 19 5M5 5h14v14');
          expect(icon.fill).toBe('none');
          expect(icon.stroke).toBe(icon.color);
          expect(icon.width).toBeGreaterThanOrEqual(14);
          expect(icon.width).toBeLessThanOrEqual(24);
          expect(icon.height).toBe(icon.width);
          expect(icon.right).toBeLessThanOrEqual(width);
        }
      }
      const link = route === '' ? page.locator('.hero-actions a[href="#contact"]') : page.locator('.page-next-inner a[href$="#contact"]');
      expect(await link.getAttribute('href')).toMatch(/#contact$/);
      if (route === '') {
        await expect(link).toHaveAccessibleName({ '': 'Let’s talk', 'uk/': 'Поговорімо', 'it/': 'Parliamone', 'de/': 'Kontakt aufnehmen' }[prefix]);
      }
    }
  });
}
