import { constants } from 'node:fs';
import { open, realpath, lstat, writeFile, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { aggregateClaudeCache, validateClaudeSnapshot, claudeStatsFiles } from './claude-data.mjs';

export async function collectClaudeStats({ path = resolve(homedir(), '.claude', 'stats-cache.json'), now = new Date() } = {}) {
  let handle;
  try {
    if (await realpath(path) !== path || !(await lstat(path)).isFile()) throw new Error();
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error();
    const chunks = []; let bytes = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      bytes += chunk.length; if (bytes > 2 * 1024 * 1024) throw new Error(); chunks.push(chunk);
    }
    return aggregateClaudeCache(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))), now);
  } catch { throw new Error('Claude statistics could not be read from the local aggregate cache.'); }
  finally { await handle?.close(); }
}

export async function saveClaudeStats(snapshot) {
  validateClaudeSnapshot(snapshot);
  const target = resolve(import.meta.dirname, '..', claudeStatsFiles[0]);
  const directory = dirname(target);
  if (await realpath(directory) !== directory || !(await lstat(directory)).isDirectory()) throw new Error('Unsafe Claude data directory.');
  try { if (!(await lstat(target)).isFile() || await realpath(target) !== target) throw new Error('Unsafe Claude snapshot target.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = resolve(directory, `.claude-stats-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await rename(temporary, target);
  } finally { await unlink(temporary).catch(() => {}); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.env.CI || process.env.CF_PAGES) throw new Error('Local collector only.');
    const snapshot = await collectClaudeStats();
    if (process.argv.includes('--stdout')) console.log(JSON.stringify(snapshot, null, 2));
    else { await saveClaudeStats(snapshot); console.log('Updated Claude aggregates. The cache coverage date is preserved; no conversations or credentials were saved.'); }
  } catch { console.error('Claude refresh failed. Existing data was not replaced. Check the local aggregate cache; never copy conversations or credentials into the repository or CI.'); process.exitCode = 1; }
}
