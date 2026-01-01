import sharp from 'sharp';
import { readFileSync } from 'fs';

const svg = readFileSync('./public/soeji.svg');

async function generateIcons() {
  try {
    await sharp(svg)
      .resize(192, 192)
      .png()
      .toFile('./public/pwa-192x192.png');

    console.log('Generated pwa-192x192.png');

    await sharp(svg)
      .resize(512, 512)
      .png()
      .toFile('./public/pwa-512x512.png');

    console.log('Generated pwa-512x512.png');

    console.log('All PWA icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
