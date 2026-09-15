import { stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// PNG files are the editable source artwork. Commit the generated WebP files
// too, so a normal application build does not need to run an image encoder.
// Only standalone display assets are resized. Sprite sheet source rectangles
// in GameCanvas.tsx use fixed pixel coordinates and must keep their geometry.
const assets = [
  // The logo renders at 360 CSS pixels; 720 pixels supplies a 2x display asset.
  { source: "public/assets/logo.png", dimensions: [1254, 1254], width: 720 },
  // These icons render at 50 CSS pixels or less, including the game canvas.
  { source: "public/assets/robot.png", dimensions: [685, 677], width: 192, lossless: true },
  { source: "public/assets/token.png", dimensions: [1254, 1254], width: 192, lossless: true },
  { source: "public/assets/stun-bot.png", dimensions: [256, 256], lossless: true },
  { source: "public/assets/tree-hideout.png", dimensions: [160, 204], lossless: true },
  { source: "public/assets/red-alarm-light-off.png", dimensions: [256, 256], lossless: true },
  { source: "public/assets/red-alarm-light-on.png", dimensions: [256, 256], lossless: true },
  { source: "public/assets/red-alarm-light-glow.png", dimensions: [256, 256], lossless: true },
  { source: "public/assets/clanker-respawn-sprite.png", dimensions: [3072, 512] },
  { source: "public/assets/clanker-stun-sprite.png", dimensions: [2560, 512] },
  { source: "public/assets/clanker-pop-sprite.png", dimensions: [3552, 444] },
  // Keep the full map resolution for the canvas on high-density displays.
  { source: "src/assets/facility-map.png", dimensions: [1254, 1254] },
];

const results = [];

for (const asset of assets) {
  const inputPath = resolve(root, asset.source);
  const output = asset.source.replace(/\.png$/, ".webp");
  const outputPath = resolve(root, output);
  const metadata = await sharp(inputPath).metadata();

  if (metadata.width !== asset.dimensions[0] || metadata.height !== asset.dimensions[1]) {
    throw new Error(`Unexpected dimensions for ${asset.source}; review the resize and sprite geometry settings.`);
  }

  let pipeline = sharp(inputPath);
  if (asset.width) {
    pipeline = pipeline.resize({ width: asset.width, withoutEnlargement: true });
  }

  const info = await pipeline.webp({
    quality: 92,
    alphaQuality: 100,
    effort: 6,
    lossless: asset.lossless ?? false,
  }).toFile(outputPath);
  const originalBytes = (await stat(inputPath)).size;

  results.push({
    asset: output,
    dimensions: `${info.width}x${info.height}`,
    originalBytes,
    optimizedBytes: info.size,
    reduction: `${((1 - info.size / originalBytes) * 100).toFixed(1)}%`,
  });
}

console.table(results);
const originalBytes = results.reduce((sum, asset) => sum + asset.originalBytes, 0);
const optimizedBytes = results.reduce((sum, asset) => sum + asset.optimizedBytes, 0);
console.log(`Total: ${originalBytes.toLocaleString("en-US")} -> ${optimizedBytes.toLocaleString("en-US")} bytes (${((1 - optimizedBytes / originalBytes) * 100).toFixed(1)}% smaller).`);
