import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const input = path.join(__dirname, '../public/images/okapi.png');
const output = path.join(__dirname, '../public/images/og-image.jpg');

// Fond noir 1200x630 avec okapi centré transparent
await sharp({
  create: {
    width: 1200,
    height: 630,
    channels: 3,
    background: { r: 0, g: 0, b: 0 }
  }
})
.composite([{
  input: await sharp(input)
    .resize(580, 580, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer(),
  gravity: 'centre'
}])
.jpeg({ quality: 85 })
.toFile(output);

console.log('og-image.jpg generated at', output);
