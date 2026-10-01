import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
const fonts = [
  ['@fontsource-variable/space-grotesk', 'space-grotesk-latin-wght-normal.woff2', 'space-grotesk'],
  ['@fontsource-variable/jetbrains-mono', 'jetbrains-mono-latin-wght-normal.woff2', 'jetbrains-mono'],
  ['@fontsource-variable/jetbrains-mono', 'jetbrains-mono-cyrillic-wght-normal.woff2', 'jetbrains-mono'],
  ...[400, 500, 600].map((weight) => ['@fontsource/ibm-plex-sans', 'ibm-plex-sans-latin-' + weight + '-normal.woff2', 'ibm-plex-sans']),
  ...[400, 500, 600].map((weight) => ['@fontsource/ibm-plex-sans', 'ibm-plex-sans-cyrillic-' + weight + '-normal.woff2', 'ibm-plex-sans']),
];
await mkdir(resolve(root, 'assets/fonts'), { recursive: true });
for (const [pkg, file, license] of fonts) {
  await copyFile(resolve(root, 'node_modules', pkg, 'files', file), resolve(root, 'assets/fonts', file));
  await copyFile(resolve(root, 'node_modules', pkg, 'LICENSE'), resolve(root, 'assets/fonts', license + '-OFL.txt'));
}
// The source stays private. Sharp strips metadata by default; do not keep it.
const original = resolve(process.argv[2] || resolve(root, 'assets/avatar.png'));
for (const width of [320, 640]) {
  const image = sharp(original).rotate().resize({ width, withoutEnlargement: true });
  await image.clone().avif({ quality: 55, effort: 6 }).toFile(resolve(root, 'assets/portrait-' + width + '.avif'));
  await image.clone().webp({ quality: 78 }).toFile(resolve(root, 'assets/portrait-' + width + '.webp'));
  if (width === 640) await image.clone().jpeg({ quality: 80, mozjpeg: true }).toFile(resolve(root, 'assets/portrait-640.jpg'));
}
await sharp(resolve(root, 'assets/social-preview.svg')).png().toFile(resolve(root, 'assets/social-preview.png'));
console.log('Prepared metadata-free portraits, local fonts and social preview.');
