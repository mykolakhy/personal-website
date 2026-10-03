import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { publicSourceBytes } from './build.mjs';
import { aiStatsFiles, validateAISnapshot } from './ai-data.mjs';
import { claudeStatsFiles, validateClaudeSnapshot } from './claude-data.mjs';

// Upload only validated aggregates. Never move OpenAI credentials to a host.
export async function publishAIStats({ confirmed = false, includeClaude = false, run = execFileSync } = {}) {
  if (!confirmed) throw new Error('Explicit public-statistics confirmation is required.');
  const sources = await publicSourceBytes([...aiStatsFiles, ...(includeClaude ? claudeStatsFiles : [])]);
  const snapshot = validateAISnapshot(JSON.parse(sources.get(aiStatsFiles[0]).toString('utf8')));
  if (Date.parse(snapshot.updatedAt) > Date.now() + 300000) throw new Error('Cannot publish future AI statistics.');
  const claude = includeClaude ? validateClaudeSnapshot(JSON.parse(sources.get(claudeStatsFiles[0]).toString('utf8'))) : null;
  if (claude && Date.parse(claude.updatedAt) > Date.now() + 300000) throw new Error('Cannot publish future Claude statistics.');
  const directory = await mkdtemp(resolve(tmpdir(), 'portfolio-ai-publish-'));
  const asset = resolve(directory, 'ai-stats.json');
  const claudeAsset = resolve(directory, 'claude-stats.json');
  const repository = 'mykolakhy/personal-website';
  const gh = args => run('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });
  try {
    await writeFile(asset, JSON.stringify(snapshot, null, 2) + '\n', { mode: 0o600 });
    if (claude) await writeFile(claudeAsset, JSON.stringify(claude, null, 2) + '\n', { mode: 0o600 });
    const assets = [asset, ...(claude ? [claudeAsset] : [])];
    let exists = true;
    try { gh(['release', 'view', 'ai-activity', '--repo', repository]); }
    catch { exists = false; }
    if (!exists) gh(['release', 'create', 'ai-activity', ...assets, '--repo', repository, '--target', 'main', '--title', 'Public AI activity data', '--notes', 'Owner-approved aggregate AI metrics and monthly activity. No conversations, task names, private projects, or credentials. Not a software release.', '--latest=false']);
    else gh(['release', 'upload', 'ai-activity', ...assets, '--repo', repository, '--clobber']);
    // Reuse the established main-only refresh/deploy workflow and its hook.
    gh(['workflow', 'run', 'github-activity.yml', '--repo', repository, '--ref', 'main']);
  } catch { throw new Error('AI publication or deployment request failed. No credentials were printed.'); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await publishAIStats({ confirmed: process.argv.includes('--confirm-publication'), includeClaude: process.argv.includes('--include-claude') }); console.log('Published aggregate AI statistics and requested a main-branch rebuild.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
