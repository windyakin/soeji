import sharp from 'sharp';
import { readFileSync } from 'fs';

const svg = readFileSync('./public/soeji_r.svg');

async function generateIcons() {
  try {
    // Standard PWA icons
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

    // iOS用 Apple Touch Icons
    await sharp(svg)
      .resize(180, 180)
      .png()
      .toFile('./public/apple-touch-icon-180x180.png');
    console.log('Generated apple-touch-icon-180x180.png');

    await sharp(svg)
      .resize(152, 152)
      .png()
      .toFile('./public/apple-touch-icon-152x152.png');
    console.log('Generated apple-touch-icon-152x152.png');

    await sharp(svg)
      .resize(120, 120)
      .png()
      .toFile('./public/apple-touch-icon-120x120.png');
    console.log('Generated apple-touch-icon-120x120.png');

    console.log('All PWA icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
