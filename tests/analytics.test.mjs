import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { securityHeaders } from '../scripts/public-files.mjs';
import { build } from '../scripts/build.mjs';

test('analytics CSP permits only the automatic beacon and production RUM endpoint', () => {
  const baseline = securityHeaders(['sha256-example']);
  const analytics = securityHeaders(['sha256-example'], { webAnalytics: true });
  const policy = analytics['Content-Security-Policy'];
  assert.match(policy, /script-src 'self' 'sha256-example' https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js\//);
  assert.match(policy, /connect-src https:\/\/mykolakhytra\.com\/cdn-cgi\/rum;/);
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|\*|connect-src 'self'|connect-src https:\/\/cloudflareinsights\.com/);
  for (const [name, value] of Object.entries(baseline)) {
    if (name !== 'Content-Security-Policy') assert.equal(analytics[name], value);
  }
  assert.equal(policy.replace(' https://static.cloudflareinsights.com/beacon.min.js https://static.cloudflareinsights.com/beacon.min.js/', '').replace('connect-src https://mykolakhytra.com/cdn-cgi/rum;', "connect-src 'none';"), baseline['Content-Security-Policy']);
  assert.match(securityHeaders()['Content-Security-Policy'], /connect-src 'none'/);
  assert.doesNotMatch(securityHeaders()['Content-Security-Policy'], /cloudflareinsights/);
});

test('only the exact production URL enables analytics CSP, without embedding telemetry', async () => {
  const destination = await mkdtemp(resolve(tmpdir(), 'portfolio-analytics-'));
  try {
    for (const siteURL of ['https://mykolakhytra.com/', null, 'https://preview.mykolakhytra.pages.dev/', 'https://mykolakhytra.com/subpath/', 'https://portfolio.example/']) {
      await build({ destination, siteURL });
      const headers = await readFile(resolve(destination, '_headers'), 'utf8');
      if (siteURL === 'https://mykolakhytra.com/') {
        assert.match(headers, /\nhttps:\/\/mykolakhytra\.com\/\*\n  Strict-Transport-Security: max-age=300\n/);
        assert.doesNotMatch(headers.split('\nhttps://')[0], /Strict-Transport-Security/);
        assert.doesNotMatch(headers, /includeSubDomains|preload/);
      } else assert.doesNotMatch(headers, /Strict-Transport-Security/);
      if (siteURL === 'https://mykolakhytra.com/') assert.match(headers, /connect-src https:\/\/mykolakhytra\.com\/cdn-cgi\/rum/);
      else {
        assert.match(headers, /connect-src 'none'/);
        assert.doesNotMatch(headers, /cloudflareinsights/);
      }
      for (const page of ['index.html', 'uk/index.html', 'it/projects/index.html', 'de/ai/index.html', '404.html']) {
        assert.doesNotMatch(await readFile(resolve(destination, page), 'utf8'), /data-cf-beacon|cloudflareinsights/, 'Cloudflare injects the only beacon at the edge');
      }
    }
  } finally { await rm(destination, { recursive: true, force: true }); }
});
