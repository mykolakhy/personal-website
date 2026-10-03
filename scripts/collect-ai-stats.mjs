import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { lstat, realpath, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { aggregateAIUsage, aiStatsFiles, validateAISnapshot } from './ai-data.mjs';

// Local-only read through Codex's supported account interface. Do not extract or
// copy auth.json; never run this collector on a hosted website or CI runner.
export async function readAccountUsage({ start = spawn, timeout = 30000 } = {}) {
  const child = start('codex', ['app-server', '--listen', 'stdio://'], { stdio: ['pipe', 'pipe', 'ignore'] });
  const lines = createInterface({ input: child.stdout });
  let bytes = 0;
  return new Promise((done, reject) => {
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true; clearTimeout(timer); lines.close(); child.stdin.end(); child.kill();
      if (error) reject(new Error('AI statistics could not be read. Check your local Codex login and version.'));
      else done(result);
    };
    const timer = setTimeout(() => finish(true), timeout);
    const send = message => { try { child.stdin.write(JSON.stringify(message) + '\n'); } catch { finish(true); } };
    child.on('error', () => finish(true));
    child.on('exit', () => finish(true));
    child.stdin.on('error', () => finish(true));
    child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > 8 * 1024 * 1024) finish(true); });
    lines.on('line', line => {
      if (settled) return;
      if (Buffer.byteLength(line) > 8 * 1024 * 1024) return finish(true);
      let message;
      try { message = JSON.parse(line); } catch { return finish(true); }
      if (message.id === 1) {
        if (message.error || !message.result) return finish(true);
        send({ method: 'initialized', params: {} });
        send({ id: 2, method: 'account/usage/read', params: {} });
      } else if (message.id === 2) {
        if (message.error || !message.result) return finish(true);
        finish(false, message.result);
      }
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'personal_website_stats', title: 'Personal website stats', version: '1.0.0' } } });
  });
}

export async function collectAIStats(options) {
  return aggregateAIUsage(await readAccountUsage(options));
}

export async function saveAIStats(snapshot) {
  validateAISnapshot(snapshot);
  const directory = resolve(import.meta.dirname, '..', 'data');
  if (await realpath(directory) !== directory || !(await lstat(directory)).isDirectory()) throw new Error('Unsafe AI data directory.');
  const target = resolve(directory, '..', aiStatsFiles[0]);
  try { if (!(await lstat(target)).isFile() || await realpath(target) !== target) throw new Error('Unsafe AI snapshot target.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = resolve(directory, `.ai-stats-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await rename(temporary, target);
  } finally { await unlink(temporary).catch(() => {}); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.env.CI || process.env.CF_PAGES) throw new Error('Local collector only.');
    const snapshot = await collectAIStats();
    if (process.argv.includes('--stdout')) console.log(JSON.stringify(snapshot, null, 2));
    else { await saveAIStats(snapshot); console.log('Updated aggregate AI snapshot. No conversations or credentials were saved.'); }
  } catch { console.error('AI refresh failed. Existing data was not replaced. Use a local, signed-in Codex CLI; never copy credentials into the repository or CI.'); process.exitCode = 1; }
}
