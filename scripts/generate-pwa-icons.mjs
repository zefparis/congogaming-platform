/**
 * Generates PWA icon assets from public/images/okapi.PNG.
 * Composites the okapi image centred on a solid #0a0a0a background
 * so icons are never transparent on Android/iOS home screens.
 *
 * Usage:  node scripts/generate-pwa-icons.mjs
 */

import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = resolve(__dirname, '..');
const src       = resolve(root, 'public/images/okapi.PNG');
const outDir    = resolve(root, 'public/icons');

mkdirSync(outDir, { recursive: true });

const BG = { r: 10, g: 10, b: 10, alpha: 255 };

const targets = [
  { name: 'icon-192.png',        size: 192 },
  { name: 'icon-512.png',        size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
];

for (const { name, size } of targets) {
  const padding   = Math.round(size * 0.12);
  const innerSize = size - padding * 2;

  const resized = await sharp(src)
    .resize(innerSize, innerSize, {
      fit:        'contain',
      background: { r: 10, g: 10, b: 10, alpha: 0 },
    })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width:    size,
      height:   size,
      channels: 4,
      background: BG,
    },
  })
    .composite([{ input: resized, gravity: 'centre' }])
    .png()
    .toFile(resolve(outDir, name));

  console.log(`✓  ${name}  (${size}×${size})`);
}

console.log('\nDone — icons written to public/icons/');
