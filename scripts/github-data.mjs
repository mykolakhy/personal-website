import { execFileSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const githubStatsFiles = ['data/github-stats.json'];
export const owner = 'mykolakhy';
export const websiteRepo = 'personal-website';
export const featuredRepos = ['personal-website', 'PixelKit', 'they-are-frogs'];
export const snapshotURL = 'https://github.com/mykolakhy/personal-website/releases/download/github-activity/github-stats.json';
export const calendarURL = `https://github.com/users/${owner}/contributions`;
const dayMS = 86400000;
const dateOnly = value => new Date(value).toISOString().slice(0, 10);
const integer = value => Number.isSafeInteger(value) && value >= 0 && value <= 10000000;
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && dateOnly(value) === value;
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
const keys = (object, allowed) => object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).length === allowed.length && Object.keys(object).every(key => allowed.includes(key));
export const conclusions = ['success', 'failure', 'cancelled', 'timed_out', 'neutral', 'skipped', 'action_required', 'stale'];

export function validateSnapshot(value) {
  const invalid = () => { throw new Error('Invalid public GitHub snapshot.'); };
  if (!keys(value, ['version', 'owner', 'updatedAt', 'from', 'to', 'days', 'totals', 'projects', 'ci']) || value.version !== 2 || value.owner !== owner || !timestamp(value.updatedAt) || !date(value.from) || !date(value.to)) invalid();
  if (!Array.isArray(value.days) || value.days.length < 365 || value.days.length > 371 || dateOnly(value.updatedAt) !== value.to || Date.parse(value.to) - Date.parse(value.from) !== (value.days.length - 1) * dayMS || new Date(value.from).getUTCDay() !== 0) invalid();
  let total = 0, active = 0;
  for (let index = 0; index < value.days.length; index++) {
    const day = value.days[index];
    if (!keys(day, ['date', 'count', 'level']) || day.date !== dateOnly(Date.parse(value.from) + index * dayMS) || !integer(day.count) || !Number.isInteger(day.level) || day.level < 0 || day.level > 4 || (day.count === 0) !== (day.level === 0)) invalid();
    total += day.count; active += Number(day.count > 0);
  }
  const totals = value.totals;
  if (!keys(totals, ['contributions', 'activeDays', 'pullRequests', 'reviews']) || !Object.values(totals).every(integer) || totals.contributions !== total || totals.activeDays !== active) invalid();
  if (!Array.isArray(value.projects) || value.projects.length > 3 || new Set(value.projects.map(project => project.name)).size !== value.projects.length) invalid();
  for (const project of value.projects) if (!keys(project, ['name', 'pushedAt']) || !featuredRepos.includes(project.name) || !timestamp(project.pushedAt)) invalid();
  if (value.ci !== null && (!keys(value.ci, ['id', 'conclusion', 'completedAt', 'sha']) || !Number.isSafeInteger(value.ci.id) || value.ci.id <= 0 || !conclusions.includes(value.ci.conclusion) || !timestamp(value.ci.completedAt) || !/^[a-f0-9]{40}$/.test(value.ci.sha))) invalid();
  return value;
}

// Only the calendar visible WITHOUT authentication is published. Owner-scoped
// GraphQL calendars differ from the public profile and can disclose hidden work.
// GitHub's HTML endpoint is not a versioned API: reject changes rather than
// silently publish incomplete or incorrectly interpreted data.
export function parsePublicCalendar(html, expectedTo) {
  const invalid = () => { throw new Error('Incomplete public GitHub calendar.'); };
  const heading = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map(match => match[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()).find(text => /^[\d,]+ contributions? in the last year$/.test(text));
  if (!heading || !date(expectedTo)) invalid();
  const total = Number(heading.split(' ')[0].replaceAll(',', ''));
  const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
  const counts = new Map();
  for (const match of html.matchAll(/<tool-tip\b([^>]*)>([\s\S]*?)<\/tool-tip>/g)) {
    const id = attributes(match[1]).for;
    if (!id?.startsWith('contribution-day-component-')) continue;
    const label = match[2].replace(/<[^>]*>/g, '').trim();
    const count = /^No contributions on /.test(label) ? 0 : /^[\d,]+ contributions? on /.test(label) ? Number(label.split(' ')[0].replaceAll(',', '')) : NaN;
    if (!integer(count) || counts.has(id)) invalid();
    counts.set(id, count);
  }
  const days = [];
  for (const match of html.matchAll(/<td\b[^>]*>/g)) {
    const attrs = attributes(match[0]);
    if (!attrs['data-date'] || !attrs.class?.split(/\s+/).includes('ContributionCalendar-day')) continue;
    const count = counts.get(attrs.id), level = Number(attrs['data-level']);
    if (!date(attrs['data-date']) || !integer(count) || !/^[0-4]$/.test(attrs['data-level']) || (count === 0) !== (level === 0)) invalid();
    days.push({ date: attrs['data-date'], count, level });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  if (days.length < 365 || days.length > 371 || days.at(-1)?.date !== expectedTo || new Date(days[0].date).getUTCDay() !== 0 || !integer(total) || days.reduce((sum, day) => sum + day.count, 0) !== total || counts.size !== days.length) invalid();
  for (let index = 0; index < days.length; index++) if (days[index].date !== dateOnly(Date.parse(days[0].date) + index * dayMS)) invalid();
  return days;
}

async function boundedText(response, limit) {
  const reader = response.body.getReader();
  const chunks = []; let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > limit) { await reader.cancel(); throw new Error('Response too large.'); }
    chunks.push(value);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
}

export async function fetchPublicCalendar(expectedTo, fetcher = fetch) {
  const response = await fetcher(calendarURL, { headers: { Accept: 'text/html', 'Accept-Language': 'en' }, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Public GitHub calendar unavailable.');
  return parsePublicCalendar(await boundedText(response, 2000000), expectedTo);
}

// Do not fetch private titles, names, paths, URLs, messages or review bodies.
// Visibility is checked for every event even when a local owner token can see it.
const types = {
  pullRequests: ['pullRequestContributions', 'pullRequest'],
  reviews: ['pullRequestReviewContributions', 'pullRequest'],
};
const pageInfo = 'pageInfo { hasNextPage endCursor }';
function connection(type, cursor = null) {
  const [field, entity] = types[type];
  return `${field}(first:100${cursor ? `,after:${JSON.stringify(cursor)}` : ''}) { nodes { occurredAt isRestricted ${entity ? `${entity} { repository { isPrivate } }` : 'repository { isPrivate }'} } ${pageInfo} }`;
}
function collectionQuery(from, to, selection) {
  return `query { user(login:"${owner}") { contributionsCollection(from:"${from}",to:"${to}") { ${selection} } } }`;
}
function publicEvent(node, type) {
  const entity = types[type][1];
  return node && node.isRestricted === false && (entity ? node[entity]?.repository : node.repository)?.isPrivate === false;
}
export async function collectSnapshot(request, now = new Date(), calendar = fetchPublicCalendar) {
  const to = dateOnly(now), days = await calendar(to), from = days[0]?.date;
  const byDate = new Map(days.map(day => [day.date, day]));
  const totals = { contributions: days.reduce((sum, day) => sum + day.count, 0), activeDays: days.filter(day => day.count > 0).length, pullRequests: 0, reviews: 0 };
  function add(occurredAt, count, type) {
    if (!timestamp(occurredAt) || !integer(count)) throw new Error('Invalid contribution event.');
    const day = byDate.get(occurredAt.slice(0, 10));
    if (!day) throw new Error('Contribution outside the requested range.');
    totals[type] += count;
  }
  // Only public PR/review metrics use GraphQL. The calendar counts and intensity
  // levels come directly from GitHub's anonymous profile, never a sum of events.
  for (let offset = 0; offset < days.length; offset += 31) {
    const start = `${days[offset].date}T00:00:00Z`;
    const endIndex = Math.min(offset + 30, days.length - 1);
    const end = endIndex === days.length - 1 ? now.toISOString() : `${days[endIndex].date}T23:59:59.999Z`;
    const selections = Object.keys(types).map(type => connection(type)).join(' ');
    const result = await request('graphql', { query: collectionQuery(start, end, selections) });
    const collection = result.data?.user?.contributionsCollection;
    if (result.errors || !collection) throw new Error('Incomplete GitHub contribution data.');
    for (const type of Object.keys(types)) {
      const field = types[type][0];
      let page = collection[field], pageNumber = 0;
      if (!page) throw new Error('Incomplete GitHub event data.');
      const cursors = new Set();
      while (page) {
        for (const node of page.nodes) if (publicEvent(node, type)) add(node.occurredAt, 1, type);
        if (!page.pageInfo.hasNextPage) break;
        const cursor = page.pageInfo.endCursor;
        if (!cursor || cursors.has(cursor) || ++pageNumber > 100) throw new Error('Incomplete GitHub event data.');
        cursors.add(cursor);
        const next = await request('graphql', { query: collectionQuery(start, end, connection(type, cursor)) });
        if (next.errors) throw new Error('Incomplete GitHub event data.');
        page = next.data?.user?.contributionsCollection?.[field];
        if (!page) throw new Error('Missing GitHub event data.');
      }
    }
  }
  const projects = [];
  for (const name of featuredRepos) {
    try {
      const repo = await request(`repos/${owner}/${name}`);
      if (repo.private === false && repo.full_name === `${owner}/${name}` && repo.fork === false) projects.push({ name, pushedAt: repo.pushed_at });
    } catch (error) { if (error.status !== 404) throw error; }
  }
  const runs = await request(`repos/${owner}/${websiteRepo}/actions/workflows/ci.yml/runs?branch=main&event=push&status=completed&per_page=1`);
  const run = runs.workflow_runs?.[0];
  const ci = run ? { id: run.id, conclusion: run.conclusion, completedAt: run.updated_at, sha: run.head_sha } : null;
  return validateSnapshot({ version: 2, owner, updatedAt: now.toISOString(), from, to, days, totals, projects, ci });
}

export function githubRequest({ local = false, token = process.env.GH_TOKEN, fetcher = fetch } = {}) {
  return async (endpoint, body) => {
    if (local) {
      try {
        const args = ['api', endpoint];
        if (body) args.push('-f', `query=${body.query}`);
        return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
      } catch (cause) {
        const error = new Error('GitHub request failed.');
        if (/HTTP 404/.test(String(cause.stderr))) error.status = 404;
        throw error;
      }
    }
    if (!token) throw new Error('GH_TOKEN is required for the GitHub data collector.');
    const response = await fetcher(`https://api.github.com/${endpoint}`, {
      method: body ? 'POST' : 'GET', headers: { ...(body ? { Authorization: `Bearer ${token}` } : {}), Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) { const error = new Error(`GitHub request failed (${response.status}).`); error.status = response.status; throw error; }
    return response.json();
  };
}

export async function latestSnapshot(fallback, fetcher = fetch) {
  try {
    // A public release asset: no credentials are used by Cloudflare or visitors.
    const response = await fetcher(snapshotURL, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Snapshot unavailable.');
    const text = await boundedText(response, 100000);
    const current = validateSnapshot(JSON.parse(text));
    if (Date.parse(current.updatedAt) > Date.now() + 300000) throw new Error('Future snapshot.');
    return Date.parse(current.updatedAt) > Date.parse(fallback.updatedAt) ? current : fallback;
  } catch { console.warn('GitHub update unavailable; using the dated, validated snapshot.'); return fallback; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const snapshot = await collectSnapshot(githubRequest({ local: process.argv.includes('--local') }));
    if (process.argv.includes('--stdout')) console.log(JSON.stringify(snapshot, null, 2));
    else {
      const path = resolve(import.meta.dirname, '..', githubStatsFiles[0]);
      await mkdir(resolve(path, '..'), { recursive: true });
      await writeFile(path, JSON.stringify(snapshot, null, 2) + '\n');
      console.log(`Updated public GitHub snapshot: ${snapshot.totals.contributions} contributions, ${snapshot.projects.length} projects.`);
    }
  } catch { console.error('GitHub snapshot refresh failed. Existing data was not replaced.'); process.exitCode = 1; }
}
