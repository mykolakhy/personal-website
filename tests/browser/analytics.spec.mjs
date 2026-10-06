import { test, expect } from '@playwright/test';
import { securityHeaders } from '../../scripts/public-files.mjs';

// All traffic is fulfilled locally. Never send synthetic visits to Cloudflare.
for (const webAnalytics of [false, true]) {
  test(`analytics CSP ${webAnalytics ? 'allows only production beacons' : 'blocks telemetry in previews'}`, async ({ page }) => {
    const scriptRequests = [];
    const beacons = [];
    const forbiddenRequests = [];
    const script = `document.documentElement.dataset.beaconLoaded = 'yes'; navigator.sendBeacon('https://mykolakhytra.com/cdn-cgi/rum', 'synthetic-test-only');`;
    await page.route('**/*', async route => {
      const request = route.request();
      const url = request.url();
      if (url === 'https://mykolakhytra.com/') {
        return route.fulfill({ contentType: 'text/html', headers: securityHeaders([], { webAnalytics }), body: '<!doctype html><html><head><script defer src="https://static.cloudflareinsights.com/beacon.min.js"></script><script defer src="https://static.cloudflareinsights.com/beacon.min.js/test-version"></script></head><body><h1>Local analytics fixture</h1></body></html>' });
      }
      if (url === 'https://mykolakhytra.com/cdn-cgi/rum' && request.method() === 'POST') {
        beacons.push(request.postData());
        return route.fulfill({ status: 204 });
      }
      if (url === 'https://static.cloudflareinsights.com/beacon.min.js' || url === 'https://static.cloudflareinsights.com/beacon.min.js/test-version') {
        scriptRequests.push(url);
        return route.fulfill({ contentType: 'text/javascript', body: script });
      }
      forbiddenRequests.push(url);
      return route.abort();
    });
    await page.goto('https://mykolakhytra.com/');
    await expect(page.getByRole('heading')).toHaveText('Local analytics fixture');
    if (webAnalytics) {
      await expect(page.locator('html')).toHaveAttribute('data-beacon-loaded', 'yes');
      await expect.poll(() => beacons.length).toBe(2);
      expect(scriptRequests).toHaveLength(2);
      expect(beacons).toEqual(['synthetic-test-only', 'synthetic-test-only']);
    } else {
      await expect(page.locator('html')).not.toHaveAttribute('data-beacon-loaded');
      expect(scriptRequests).toEqual([]);
      expect(beacons).toEqual([]);
    }
    const blocked = await page.evaluate(async () => {
      const endpoints = ['https://mykolakhytra.com/other-endpoint', 'https://cloudflareinsights.com/cdn-cgi/rum', 'https://api.openai.com/'];
      const results = await Promise.all(endpoints.map(async url => { try { await fetch(url); return false; } catch { return true; } }));
      const scriptBlocked = await new Promise(resolve => {
        const element = document.createElement('script');
        element.src = 'https://static.cloudflareinsights.com/unrelated.js';
        element.onload = () => resolve(false); element.onerror = () => resolve(true);
        document.head.append(element);
      });
      return [...results, scriptBlocked];
    });
    expect(blocked).toEqual([true, true, true, true]);
    expect(forbiddenRequests).toEqual([]);
  });
}
