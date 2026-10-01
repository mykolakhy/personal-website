import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { publicFiles } from '../scripts/public-files.mjs';

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
  for (const file of ['scripts/build.mjs', 'scripts/public-files.mjs', ...publicFiles]) {
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
  return { destination, build: () => build({ destination }) };
}

for (const [name, options] of [
  ['public file linked to private data', { linkedFile: 'assets/fonts/ibm-plex-sans-OFL.txt' }],
  ['HTML linked to private data', { linkedFile: 'index.html' }],
  ['public directory linked outside the source tree', { linkedDirectory: 'assets/fonts' }],
  ['public file linked to another public file', { linkedFile: 'assets/fonts/ibm-plex-sans-OFL.txt', internalLink: true }],
  ['dangling public-file link', { linkedFile: 'assets/fonts/ibm-plex-sans-OFL.txt', danglingLink: true }],
  ['directory in place of a public file', { directoryFile: 'assets/fonts/ibm-plex-sans-OFL.txt' }],
  ['missing public file', { missingFile: 'assets/fonts/ibm-plex-sans-OFL.txt' }],
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
