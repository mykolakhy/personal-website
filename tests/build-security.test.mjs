import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, link, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { publicFiles } from '../scripts/public-files.mjs';
import { translationFiles, pageTemplateFiles } from '../scripts/i18n.mjs';
import { githubStatsFiles } from '../scripts/github-data.mjs';
import { aiStatsFiles } from '../scripts/ai-data.mjs';
import { claudeStatsFiles } from '../scripts/claude-data.mjs';

const root = resolve(import.meta.dirname, '..');
const privateMarker = 'Synthetic private data must never reach the build.\n';

async function fixture(context, { linkedFile, linkedDirectory, missingFile, directoryFile, internalLink = false, danglingLink = false } = {}) {
  const workspace = await mkdtemp(resolve(tmpdir(), 'portfolio-build-security-'));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const source = resolve(workspace, 'source');
  const destination = resolve(workspace, 'dist');
  const privateFile = resolve(workspace, 'private.txt');
  await writeFile(privateFile, privateMarker);
  if (linkedDirectory) {
    const privateDirectory = resolve(workspace, 'private-directory');
    await mkdir(privateDirectory);
    const target = resolve(source, linkedDirectory);
    await mkdir(dirname(target), { recursive: true });
    await symlink(privateDirectory, target, 'dir');
  }
  for (const file of ['scripts/build.mjs', 'scripts/public-files.mjs', 'scripts/i18n.mjs', 'scripts/icons.mjs', 'scripts/github-data.mjs', 'scripts/github-section.mjs', 'scripts/ai-data.mjs', 'scripts/ai-section.mjs', 'scripts/ai-months.mjs', 'scripts/claude-data.mjs', 'scripts/claude-section.mjs', ...publicFiles, ...pageTemplateFiles, ...translationFiles, ...githubStatsFiles, ...aiStatsFiles, ...claudeStatsFiles]) {
    if (file === missingFile) continue;
    const target = resolve(source, file);
    await mkdir(dirname(target), { recursive: true });
    if (file === linkedFile) {
      const linkTarget = internalLink ? resolve(source, 'assets/fonts/space-grotesk-OFL.txt')
        : danglingLink ? resolve(workspace, 'missing-private.txt') : privateFile;
      await symlink(linkTarget, target);
    } else if (file === directoryFile) {
      await mkdir(target);
    } else {
      await copyFile(resolve(root, file), target);
    }
  }
  if (linkedDirectory === 'assets/fonts') {
    await writeFile(resolve(source, 'assets/fonts/ibm-plex-sans-OFL.txt'), privateMarker);
  }
  const { build } = await import(pathToFileURL(resolve(source, 'scripts/build.mjs')));
  return { source, destination, build: () => build({ destination }) };
}

for (const [name, options] of [
  ['public file linked to private data', { linkedFile: 'assets/fonts/ibm-plex-sans-OFL.txt' }],
  ['HTML linked to private data', { linkedFile: 'index.html' }],
  ['public directory linked outside the source tree', { linkedDirectory: 'assets/fonts' }],
  ['public file linked to another public file', { linkedFile: 'assets/fonts/ibm-plex-sans-OFL.txt', internalLink: true }],
  ['dangling public-file link', { linkedFile: 'assets/fonts/ibm-plex-sans-OFL.txt', danglingLink: true }],
  ['directory in place of a public file', { directoryFile: 'assets/fonts/ibm-plex-sans-OFL.txt' }],
  ['missing public file', { missingFile: 'assets/fonts/ibm-plex-sans-OFL.txt' }],
  ['translation linked to private data', { linkedFile: 'locales/uk.json' }],
  ['translation directory linked outside the source tree', { linkedDirectory: 'locales' }],
  ['GitHub snapshot linked to private data', { linkedFile: 'data/github-stats.json' }],
  ['GitHub snapshot directory linked outside the source tree', { linkedDirectory: 'data' }],
  ['secondary page template linked to private data', { linkedFile: 'pages/ai.html' }],
  ['secondary page directory linked outside the source tree', { linkedDirectory: 'pages' }],
  ['AI snapshot linked to private data', { linkedFile: 'data/ai-stats.json' }],
  ['Claude snapshot linked to private data', { linkedFile: 'data/claude-stats.json' }],
]) {
  test(`build rejects ${name} before creating output`, async (context) => {
    const { build, destination } = await fixture(context, options);
    await assert.rejects(build(), /Unsafe public source:/);
    await assert.rejects(stat(destination), { code: 'ENOENT' });
  });
}

test('invalid public sources leave existing output unchanged', async (context) => {
  const { build, destination } = await fixture(context, { linkedFile: 'assets/fonts/ibm-plex-sans-OFL.txt' });
  await mkdir(destination);
  const previousHTML = 'Previously built public content.\n';
  await writeFile(resolve(destination, 'index.html'), previousHTML);
  await assert.rejects(build(), /Unsafe public source:/);
  assert.equal(await readFile(resolve(destination, 'index.html'), 'utf8'), previousHTML);
  assert.deepEqual(await readdir(destination), ['index.html']);
});

test('incomplete translations leave an existing build unchanged', async context => {
  const { source, build, destination } = await fixture(context);
  const catalog = JSON.parse(await readFile(resolve(source, 'locales/de.json'), 'utf8'));
  delete catalog['hero.tagline'];
  await writeFile(resolve(source, 'locales/de.json'), JSON.stringify(catalog));
  await mkdir(destination);
  await writeFile(resolve(destination, 'index.html'), 'Previously built public content.');
  await assert.rejects(build(), /Missing de translation: hero.tagline/);
  assert.equal(await readFile(resolve(destination, 'index.html'), 'utf8'), 'Previously built public content.');
  assert.deepEqual(await readdir(destination), ['index.html']);
});

test('invalid GitHub snapshot leaves an existing build unchanged', async context => {
  const { source, build, destination } = await fixture(context);
  const snapshot = JSON.parse(await readFile(resolve(source, 'data/github-stats.json'), 'utf8'));
  snapshot.projects.push({ name: 'private-repository', pushedAt: snapshot.updatedAt });
  await writeFile(resolve(source, 'data/github-stats.json'), JSON.stringify(snapshot));
  await mkdir(destination);
  await writeFile(resolve(destination, 'index.html'), 'Previously built public content.');
  await assert.rejects(build(), /Invalid public GitHub snapshot/);
  assert.equal(await readFile(resolve(destination, 'index.html'), 'utf8'), 'Previously built public content.');
  assert.deepEqual(await readdir(destination), ['index.html']);
});

test('AI snapshots with private fields are rejected before changing output', async context => {
  const { source, build, destination } = await fixture(context);
  const snapshot = JSON.parse(await readFile(resolve(source, 'data/ai-stats.json'), 'utf8'));
  snapshot.threadUsage = [{ title: privateMarker }];
  await writeFile(resolve(source, 'data/ai-stats.json'), JSON.stringify(snapshot));
  await mkdir(destination);
  await writeFile(resolve(destination, 'index.html'), 'Previously built public content.');
  await assert.rejects(build(), /Invalid public AI snapshot/);
  assert.equal(await readFile(resolve(destination, 'index.html'), 'utf8'), 'Previously built public content.');
  assert.deepEqual(await readdir(destination), ['index.html']);
});

test('Claude snapshots with private fields are rejected before changing output', async context => {
  const { source, build, destination } = await fixture(context);
  const snapshot = JSON.parse(await readFile(resolve(source, 'data/claude-stats.json'), 'utf8'));
  snapshot.longestSession = { sessionId: privateMarker };
  await writeFile(resolve(source, 'data/claude-stats.json'), JSON.stringify(snapshot));
  await mkdir(destination);
  await writeFile(resolve(destination, 'index.html'), 'Previously built public content.');
  await assert.rejects(build(), /Invalid public Claude snapshot/);
  assert.equal(await readFile(resolve(destination, 'index.html'), 'utf8'), 'Previously built public content.');
  assert.deepEqual(await readdir(destination), ['index.html']);
});

for (const kind of ['root link', 'parent link', 'dangling root link', 'internal directory link', 'output file link', 'output hard link', 'directory instead of file']) {
  test(`build rejects ${kind} without changing outside files or existing output`, async context => {
    const { build, destination } = await fixture(context);
    const outside = resolve(dirname(destination), 'outside');
    await mkdir(outside);
    await writeFile(resolve(outside, 'index.html'), privateMarker);
    if (kind === 'root link') await symlink(outside, destination, 'dir');
    else if (kind === 'dangling root link') await symlink(resolve(outside, 'missing'), destination, 'dir');
    else if (kind === 'parent link') {
      const parent = dirname(destination);
      const alias = resolve(parent, 'alias'); await symlink(outside, alias, 'dir');
      const { build: buildModule } = await import('../scripts/build.mjs');
      await assert.rejects(buildModule({ destination: resolve(alias, 'nested/dist'), siteURL: null }), /Unsafe build destination/);
      assert.deepEqual(await readdir(outside), ['index.html']);
      assert.equal(await readFile(resolve(outside, 'index.html'), 'utf8'), privateMarker);
      return;
    } else {
      await mkdir(destination);
      if (kind === 'internal directory link') {
        await writeFile(resolve(destination, 'index.html'), 'Previous build');
        await symlink(outside, resolve(destination, 'assets'), 'dir');
      } else if (kind === 'output file link') await symlink(resolve(outside, 'index.html'), resolve(destination, 'index.html'));
      else if (kind === 'output hard link') await link(resolve(outside, 'index.html'), resolve(destination, 'index.html'));
      else await mkdir(resolve(destination, 'index.html'));
    }
    await assert.rejects(build(), /Unsafe build destination|Unexpected build output/);
    assert.deepEqual(await readdir(outside), ['index.html']);
    assert.equal(await readFile(resolve(outside, 'index.html'), 'utf8'), privateMarker);
    if (kind === 'internal directory link') assert.equal(await readFile(resolve(destination, 'index.html'), 'utf8'), 'Previous build');
  });
}
