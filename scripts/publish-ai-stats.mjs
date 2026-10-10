import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { publicSourceBytes } from './build.mjs';
import { aiStatsFiles, aiSnapshotURL, validateAISnapshot, assertAIProgress, readPublicSnapshot } from './ai-data.mjs';
import { claudeStatsFiles, claudeSnapshotURL, validateClaudeSnapshot, assertClaudeProgress } from './claude-data.mjs';

// Upload only validated aggregates. Never move OpenAI credentials to a host.
export async function publishAIStats({ confirmed = false, includeClaude = false, allowMetricCorrection = false, run = execFileSync, fetcher = fetch, now = new Date(), readSources = publicSourceBytes } = {}) {
  if (!confirmed) throw new Error('Explicit public-statistics confirmation is required.');
  const sources = await readSources([...aiStatsFiles, ...(includeClaude ? claudeStatsFiles : [])]);
  const snapshot = validateAISnapshot(JSON.parse(sources.get(aiStatsFiles[0]).toString('utf8')));
  if (!Number.isSafeInteger(snapshot.summary.lifetimeTokens)) throw new Error('Publication requires numeric lifetime AI tokens.');
  const claude = includeClaude ? validateClaudeSnapshot(JSON.parse(sources.get(claudeStatsFiles[0]).toString('utf8'))) : null;
  for (const value of [snapshot, ...(claude ? [claude] : [])]) {
    const age = now.getTime() - Date.parse(value.updatedAt);
    if (!Number.isFinite(age) || age < -300000 || age > 15 * 60 * 1000) throw new Error('Publication requires statistics collected within the last 15 minutes, not future data.');
  }
  const repository = 'mykolakhy/personal-website';
  const gh = args => run('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });
  let release, exists = true;
  try { release = JSON.parse(gh(['api', `repos/${repository}/releases/tags/ai-activity`])); }
  catch (error) {
    // Only a confirmed 404 means a first publication. Auth, network and parser
    // failures must not be treated as an empty release and bypass comparison.
    if (!/\(HTTP 404\)/.test(String(error.stderr ?? ''))) throw new Error('Cannot verify existing public AI statistics. Nothing was published.');
    exists = false;
  }
  if (exists) {
    if (release?.draft !== false || !Array.isArray(release.assets) || !release.assets.every(asset => typeof asset?.name === 'string') || !release.assets.some(asset => asset.name === 'ai-stats.json')) throw new Error('Cannot verify existing public AI statistics. Nothing was published.');
    try {
      const previous = await readPublicSnapshot(aiSnapshotURL, validateAISnapshot, fetcher);
      assertAIProgress(snapshot, previous, { allowMetricCorrection });
      if (claude && release.assets.some(asset => asset.name === 'claude-stats.json')) {
        const previousClaude = await readPublicSnapshot(claudeSnapshotURL, validateClaudeSnapshot, fetcher);
        assertClaudeProgress(claude, previousClaude, { allowMetricCorrection });
      }
    } catch { throw new Error('Public AI comparison failed: unavailable data, an older snapshot or cumulative regression. Nothing was published.'); }
  }
  const directory = await mkdtemp(resolve(tmpdir(), 'portfolio-ai-publish-'));
  const asset = resolve(directory, 'ai-stats.json');
  const claudeAsset = resolve(directory, 'claude-stats.json');
  try {
    await writeFile(asset, JSON.stringify(snapshot, null, 2) + '\n', { mode: 0o600 });
    if (claude) await writeFile(claudeAsset, JSON.stringify(claude, null, 2) + '\n', { mode: 0o600 });
    const assets = [asset, ...(claude ? [claudeAsset] : [])];
    if (!exists) gh(['release', 'create', 'ai-activity', ...assets, '--repo', repository, '--target', 'main', '--title', 'Public AI activity data', '--notes', 'Owner-approved aggregate AI metrics and monthly activity. No conversations, task names, private projects, or credentials. Not a software release.', '--latest=false']);
    else gh(['release', 'upload', 'ai-activity', ...assets, '--repo', repository, '--clobber']);
    // Reuse the established main-only refresh/deploy workflow and its hook.
    gh(['workflow', 'run', 'github-activity.yml', '--repo', repository, '--ref', 'main']);
  } catch { throw new Error('AI publication or deployment request failed. No credentials were printed.'); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await publishAIStats({ confirmed: process.argv.includes('--confirm-publication'), includeClaude: process.argv.includes('--include-claude'), allowMetricCorrection: process.argv.includes('--confirm-metric-correction') }); console.log('Published aggregate AI statistics and requested a main-branch rebuild.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
