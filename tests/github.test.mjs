import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectSnapshot, githubRequest, validateSnapshot, latestSnapshot, snapshotURL, featuredRepos, parsePublicCalendar, fetchPublicCalendar, calendarURL } from '../scripts/github-data.mjs';
import { renderGithub, githubEnglish, monthlyActivity } from '../scripts/github-section.mjs';
import { triggerDeployment } from '../scripts/deploy-github-update.mjs';
import { publicSourceBytes } from '../scripts/build.mjs';
import { readCatalogs, renderPage } from '../scripts/i18n.mjs';

const saved = JSON.parse(await readFile('data/github-stats.json', 'utf8'));
const copy = () => structuredClone(saved);
test('snapshot accepts only bounded public data with complete dates and consistent totals', () => {
  assert.equal(validateSnapshot(saved), saved);
  assert.deepEqual(saved.projects.map(project => project.name), featuredRepos);
  for (const mutate of [
    data => data.secret = 'private', data => data.owner = 'someone-else',
    data => data.days.pop(), data => data.days[1].date = data.days[0].date,
    data => data.days[0].count = -1, data => data.days[0].count = 0.5,
    data => data.totals.contributions++, data => data.totals.activeDays++,
    data => data.days[0].level = 5, data => data.projects[0].name = 'exclusive-resorts-qa-take-home',
    data => data.projects[0].url = 'https://evil.example', data => data.projects.push(data.projects[0]),
    data => data.updatedAt = 'not-a-date', data => data.from = '2026-02-99',
    data => data.ci.id = 'javascript:alert(1)', data => data.ci.conclusion = 'unknown',
    data => data.ci.sha = '<script>', data => data.ci.url = 'https://evil.example',
  ]) {
    const data = copy(); mutate(data);
    assert.throws(() => validateSnapshot(data), /Invalid public GitHub snapshot/);
  }
});

const emptyPage = () => ({ nodes: [], pageInfo: { hasNextPage: false, endCursor: null } });
function emptyCollection() {
  return { pullRequestContributions: emptyPage(), pullRequestReviewContributions: emptyPage() };
}
test('collector paginates events, filters private and restricted work, and emits no private metadata', async () => {
  const queries = [], requests = [];
  const from = saved.from, occurredAt = from + 'T12:00:00Z';
  const repo = isPrivate => ({ isPrivate, name: 'never-publish-this-name' });
  const event = (entity, isPrivate = false) => ({ occurredAt, isRestricted: false, ...(entity ? { [entity]: { repository: repo(isPrivate) } } : { repository: repo(isPrivate) }) });
  const request = async (endpoint, body) => {
    requests.push(endpoint);
    if (endpoint === 'graphql') {
      queries.push(body.query);
      const collection = emptyCollection();
      if (body.query.includes('after:')) {
        collection.pullRequestContributions.nodes = [event('pullRequest')];
      } else if (body.query.includes(`from:"${from}`)) {
        collection.pullRequestContributions = { nodes: [event('pullRequest'), event('pullRequest', true), { ...event('pullRequest'), isRestricted: true }], pageInfo: { hasNextPage: true, endCursor: 'next-page' } };
        collection.pullRequestReviewContributions.nodes = [event('pullRequest'), event('pullRequest', true), { ...event('pullRequest'), isRestricted: true }];
      }
      return { data: { user: { contributionsCollection: collection } } };
    }
    if (endpoint.includes('actions/')) return { workflow_runs: [] };
    const name = endpoint.split('/').at(-1);
    return { full_name: `mykolakhy/${name}`, private: name === 'PixelKit', fork: false, pushed_at: saved.updatedAt };
  };
  const result = await collectSnapshot(request, new Date(saved.updatedAt), async () => saved.days);
  assert.deepEqual(result.totals, { contributions: saved.totals.contributions, activeDays: saved.totals.activeDays, pullRequests: 2, reviews: 1 });
  assert.deepEqual(result.days, saved.days);
  assert.equal(result.ci, null);
  assert.deepEqual(result.projects.map(project => project.name), ['personal-website', 'they-are-frogs']);
  assert.doesNotMatch(JSON.stringify(result), /never-publish|exclusive-resorts|secret/);
  assert.ok(queries.some(query => query.includes('after:"next-page"')));
  assert.equal(queries.filter(query => !query.includes('after:')).length, Math.ceil(saved.days.length / 31));
  for (const query of queries) assert.doesNotMatch(query, /contributionCalendar|commitContributionsByRepository|nameWithOwner|resourcePath|\bbody\b|\bmessage\b|\btitle\b|restrictedContributionsCount/);
  assert.ok(requests.some(endpoint => endpoint.includes('branch=main&event=push&status=completed')));
});

test('collector refuses truncated or errored data instead of presenting a partial count', async () => {
  for (const collection of [{}, { ...emptyCollection(), pullRequestContributions: { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } } }]) await assert.rejects(collectSnapshot(async () => ({ data: { user: { contributionsCollection: collection } } }), new Date(saved.updatedAt), async () => saved.days), /Incomplete/);
  await assert.rejects(collectSnapshot(async () => ({ errors: [{ message: 'Do not expose this' }] }), new Date(saved.updatedAt), async () => saved.days), /Incomplete/);
});

test('API credentials stay in the collector; public REST reads need no token and errors reveal none', async () => {
  const calls = [];
  const request = githubRequest({ token: 'test-secret', fetcher: async (url, options) => { calls.push({ url, options }); return new Response('{}'); } });
  await request('graphql', { query: '{user{login}}' });
  await request('repos/mykolakhy/PixelKit');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-secret');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.equal(calls[1].options.headers.Authorization, undefined);
  const failure = githubRequest({ token: 'test-secret', fetcher: async () => new Response('test-secret', { status: 403 }) });
  await assert.rejects(failure('graphql', {}), error => !error.message.includes('test-secret'));
});

test('remote updates are validated, bounded, newer and fall back safely when unavailable', async () => {
  const older = copy(); older.updatedAt = older.to + 'T00:00:00.000Z';
  const current = copy(); current.updatedAt = current.to + 'T00:01:00.000Z';
  assert.deepEqual(await latestSnapshot(older, async url => { assert.equal(url, snapshotURL); return new Response(JSON.stringify(current)); }), current);
  assert.equal(await latestSnapshot(current, async () => new Response(JSON.stringify(older))), current);
  for (const response of [new Response('', { status: 404 }), new Response('not JSON'), new Response('a'.repeat(100001)), new Response(JSON.stringify({ ...current, secret: 'private' }))]) {
    assert.equal(await latestSnapshot(older, async () => response), older);
  }
  assert.equal(await latestSnapshot(older, async () => { throw new Error('Offline'); }), older);
});

test('every language renders accessible static data, projects and CI without untrusted HTML', async () => {
  const sources = await publicSourceBytes();
  const template = sources.get('index.html').toString('utf8');
  const catalogs = readCatalogs(template, sources);
  for (const code of ['en', 'uk', 'it', 'de']) {
    const catalog = catalogs.get(code);
    const html = renderPage(template, code, catalog, saved);
    assert.equal([...html.matchAll(/data-date="/g)].length, saved.days.length);
    assert.equal([...html.matchAll(/data-repository="/g)].length, 3);
    assert.ok(html.includes(catalog['github.note']));
    assert.ok(html.includes(catalog['github.monthlyTitle']));
    assert.match(html, /tabindex="0" role="group" aria-label=/);
    assert.match(html, /<dl class="github-months">/);
    assert.doesNotMatch(html, /exclusive-resorts|github-data|undefined|data-i18n|github_pat_|ghp_/);
    assert.ok(html.includes(`actions/runs/${saved.ci.id}`));
    assert.match(html, /datetime="\d{4}-\d{2}-\d{2}T/);
  }
  const attack = renderGithub(saved, 'en', { ...githubEnglish, 'github.personalBody': '\"><script>alert(1)</script>' });
  assert.match(attack, /&lt;script&gt;/); assert.doesNotMatch(attack, /<script>/);
  assert.match(renderGithub(null, 'en'), /unavailable/);
  const noCI = copy(); noCI.ci = null;
  assert.match(renderGithub(noCI, 'en'), /Run data unavailable/);
  assert.doesNotMatch(renderGithub(noCI, 'en'), /data-conclusion="success"/);
  const rendered = renderGithub(saved, 'en');
  for (const day of saved.days) assert.ok(rendered.includes(`data-level="${day.level}" data-date="${day.date}" data-count="${day.count}"`));
});

function calendarHTML() {
  return `<h2>${saved.totals.contributions.toLocaleString('en')}\n contributions in the last year</h2><table>${[...saved.days].reverse().map((day, i) => `<td class="ContributionCalendar-day" data-date="${day.date}" data-level="${day.level}" id="contribution-day-component-${i}"></td><tool-tip for="contribution-day-component-${i}">${day.count ? `${day.count.toLocaleString('en')} contributions` : 'No contributions'} on a date.</tool-tip>`).join('')}</table>`;
}
test('monthly activity is exactly twelve calendar months, newest first, with exact source sums', () => {
  const months = monthlyActivity(saved);
  assert.equal(months.length, 12);
  assert.equal(months[0].month, saved.to.slice(0, 7));
  assert.equal(months.filter(month => month.partial).length, 1);
  assert.equal(months[0].partial, true);
  for (let index = 0; index < months.length; index++) {
    const month = months[index];
    const days = saved.days.filter(day => day.date.startsWith(month.month));
    assert.equal(month.count, days.reduce((sum, day) => sum + day.count, 0));
    assert.equal(month.activeDays, days.filter(day => day.count > 0).length);
    if (index > 0) assert.ok(month.month < months[index - 1].month);
  }
  const empty = copy(); empty.days.forEach(day => { day.count = 0; day.level = 0; });
  assert.ok(monthlyActivity(empty).every(month => month.count === 0 && month.activeDays === 0));
  for (const month of months) assert.match(renderGithub(saved, 'en'), new RegExp(`data-month="${month.month}"`));
});
test('anonymous profile calendar preserves GitHub totals, dates and levels without an owner token', async () => {
  const html = calendarHTML();
  assert.deepEqual(parsePublicCalendar(html, saved.to), saved.days);
  const result = await fetchPublicCalendar(saved.to, async (url, options) => {
    assert.equal(url, calendarURL); assert.equal(options.credentials, 'omit'); assert.equal(options.headers.Authorization, undefined); assert.equal(options.redirect, 'error');
    return new Response(html);
  });
  assert.deepEqual(result, saved.days);
  for (const invalid of [html.replace(/contributions in the last year/, 'unknown heading'), html.replace(/data-level="\d"/, 'data-level="5"'), html.replace(/data-date="[^"]+"/, 'data-date="invalid"'), html.replace(/<tool-tip[^>]+>[\s\S]*?<\/tool-tip>/, ''), html + html, html.replace(saved.totals.contributions.toLocaleString('en'), '0')]) assert.throws(() => parsePublicCalendar(invalid, saved.to), /Incomplete/);
  assert.throws(() => parsePublicCalendar(html, '1900-01-01'), /Incomplete/);
  await assert.rejects(fetchPublicCalendar(saved.to, async () => new Response('a'.repeat(2000001))), /large/);
  await assert.rejects(fetchPublicCalendar(saved.to, async () => new Response('', { status: 503 })), /unavailable/);
});

test('deploy trigger is restricted to Cloudflare, requires confirmation and never exposes its secret', async () => {
  const hook = 'https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/test-secret';
  let calls = 0;
  await triggerDeployment(hook, async (url, options) => { calls++; assert.equal(url, hook); assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error'); return new Response('{"success":true}'); });
  assert.equal(calls, 1);
  for (const value of ['', 'http://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/id', 'https://evil.example/id', hook + '?secret=exposed', 'https://user:pass@api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/id']) await assert.rejects(triggerDeployment(value), /configured|Invalid/);
  for (const fetcher of [async () => new Response('{"success":false}'), async () => new Response('', { status: 500 }), async () => { throw new Error(hook); }]) await assert.rejects(triggerDeployment(hook, fetcher), error => !error.message.includes('test-secret'));
});

test('refresh workflow writes only its data release from main, without exposing credentials to PRs', async () => {
  const workflow = await readFile('.github/workflows/github-activity.yml', 'utf8');
  assert.match(workflow, /cron: '23 5 \* \* \*'/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /pull_request|git push|git commit|--force|--admin|wrangler|CLOUDFLARE_API_TOKEN/);
  for (const match of workflow.matchAll(/uses:\s+([^\s#]+)/g)) assert.match(match[1], /^actions\/(checkout|setup-node)@[a-f0-9]{40}$/);
  assert.match(workflow, /needs: refresh/);
  assert.match(workflow, /secrets\.CLOUDFLARE_DEPLOY_HOOK/);
});
