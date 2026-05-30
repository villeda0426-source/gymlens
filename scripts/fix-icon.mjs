// Fixes the app icon:
// 1. Swaps cream background (#FAF7F0) → coral (#E04E4E) pixel-by-pixel
// 2. Finds the logo bounding box (now: non-coral pixels)
// 3. Crops to logo + padding, scales to fill 75% of 1024×1024
// 4. Places on coral background, no alpha channel
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(__dirname, "../assets");
const SRC    = path.join(ASSETS, "icon.backup.png"); // always read from original
const OUT    = path.join(ASSETS, "icon.png");
const SIZE   = 1024;
const LOGO_FILL = 0.75; // logo fills this fraction of the output canvas

// Colors
const CREAM = { r: 250, g: 247, b: 240 };
const CORAL = { r: 224, g: 78,  b: 78  }; // #E04E4E
const TOLERANCE = 20; // max sum of channel diffs to count as "background"

if (!fs.existsSync(SRC)) {
  console.error("icon.backup.png not found");
  process.exit(1);
}

// ── Step 1: read raw RGBA pixels ─────────────────────────────────────────────
const { data, info } = await sharp(SRC)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width: W, height: H, channels } = info;
console.log(`Source: ${W}×${H}, channels=${channels}`);

// ── Step 2: swap cream → coral ────────────────────────────────────────────────
let swapped = 0;
for (let i = 0; i < data.length; i += channels) {
  const dr = Math.abs(data[i]   - CREAM.r);
  const dg = Math.abs(data[i+1] - CREAM.g);
  const db = Math.abs(data[i+2] - CREAM.b);
  if (dr + dg + db <= TOLERANCE) {
    data[i]   = CORAL.r;
    data[i+1] = CORAL.g;
    data[i+2] = CORAL.b;
    data[i+3] = 255;
    swapped++;
  }
}
console.log(`Background-swapped ${swapped.toLocaleString()} cream pixels → coral`);

// ── Step 3: find bounding box of non-coral content ───────────────────────────
let minX = W, maxX = 0, minY = H, maxY = 0;

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * channels;
    const dr = Math.abs(data[i]   - CORAL.r);
    const dg = Math.abs(data[i+1] - CORAL.g);
    const db = Math.abs(data[i+2] - CORAL.b);
    if (dr + dg + db > TOLERANCE) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

const contentW = maxX - minX + 1;
const contentH = maxY - minY + 1;
console.log(`Logo bounding box: (${minX},${minY})→(${maxX},${maxY}) = ${contentW}×${contentH}`);
console.log(`Logo fills ${(contentW/W*100).toFixed(1)}% W × ${(contentH/H*100).toFixed(1)}% H of original`);

// ── Step 4: crop to logo + 5% padding ────────────────────────────────────────
const PAD     = Math.round(Math.max(contentW, contentH) * 0.05);
const cropL   = Math.max(0, minX - PAD);
const cropT   = Math.max(0, minY - PAD);
const cropW   = Math.min(W - cropL, contentW + PAD * 2);
const cropH   = Math.min(H - cropT, contentH + PAD * 2);

// ── Step 5: build output image from swapped pixel data ───────────────────────
const logoTargetSize = Math.round(SIZE * LOGO_FILL);

// Turn the modified pixel buffer back into a PNG, then extract + scale
const swappedPng = await sharp(Buffer.from(data), {
  raw: { width: W, height: H, channels },
})
  .extract({ left: cropL, top: cropT, width: cropW, height: cropH })
  .resize(logoTargetSize, logoTargetSize, {
    fit: "contain",
    background: CORAL,
  })
  .png()
  .toBuffer();

// ── Step 6: composite onto full coral canvas, strip alpha ────────────────────
const offset = Math.round((SIZE - logoTargetSize) / 2);

await sharp({
  create: { width: SIZE, height: SIZE, channels: 3, background: CORAL },
})
  .composite([{ input: swappedPng, left: offset, top: offset }])
  .flatten({ background: CORAL })
  .removeAlpha()
  .png({ compressionLevel: 9 })
  .toFile(OUT);

// ── Verify ────────────────────────────────────────────────────────────────────
const meta = await sharp(OUT).metadata();
console.log(`\nOutput: ${meta.width}×${meta.height}, hasAlpha=${meta.hasAlpha}`);
console.log(`File size: ${fs.statSync(OUT).size.toLocaleString()} bytes`);
console.log("Done — icon.png is now coral background, logo at 75% scale, no alpha.");
