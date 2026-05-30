// Generates icon.png and adaptive-icon.png from the original backup:
//   - White (#FFFFFF) background
//   - Coral (#E04E4E) logo at 80% of the 1024×1024 canvas
//   - No transparency, no padding waste, no alpha channel
//
// Source: assets/icon.backup.png (original, cream bg + dark logo)
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(__dirname, "../assets");
const SRC    = path.join(ASSETS, "icon.backup.png");
const OUT    = path.join(ASSETS, "icon.png");
const OUT_AD = path.join(ASSETS, "adaptive-icon.png");
const SIZE   = 1024;
const FILL   = 0.80; // logo occupies 80% of canvas

// Colors
const CREAM  = { r: 250, g: 247, b: 240 };
const CORAL  = { r: 224, g: 78,  b: 78  }; // #E04E4E
const WHITE  = { r: 255, g: 255, b: 255 };
const DIST_SCALE = 80; // sum-of-channel-diffs at which pixel is "100% logo"

if (!fs.existsSync(SRC)) {
  console.error("icon.backup.png not found — re-run from project root");
  process.exit(1);
}

// ── 1. Read original RGBA pixels ──────────────────────────────────────────────
const { data, info } = await sharp(SRC)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width: W, height: H, channels } = info;
console.log(`Source: ${W}×${H}, channels=${channels}`);

// ── 2. Recolor: cream→white, logo strokes→coral (smooth edge blend) ───────────
const out = Buffer.alloc(W * H * 4);

for (let i = 0; i < data.length; i += channels) {
  const r = data[i], g = data[i+1], b = data[i+2];

  // How "logo-like" is this pixel? (0 = background, 1 = solid logo)
  const dist = Math.abs(r - CREAM.r) + Math.abs(g - CREAM.g) + Math.abs(b - CREAM.b);
  const t    = Math.min(dist / DIST_SCALE, 1.0);

  // Lerp from WHITE to CORAL based on t
  out[i]   = Math.round(WHITE.r + (CORAL.r - WHITE.r) * t);
  out[i+1] = Math.round(WHITE.g + (CORAL.g - WHITE.g) * t);
  out[i+2] = Math.round(WHITE.b + (CORAL.b - WHITE.b) * t);
  out[i+3] = 255; // fully opaque
}

// ── 3. Find bounding box of non-white content (logo) ─────────────────────────
let minX = W, maxX = 0, minY = H, maxY = 0;
const WHITE_THRESHOLD = 15; // sum-of-channel-diffs to count as "not white"

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const diff = Math.abs(out[i] - 255) + Math.abs(out[i+1] - 255) + Math.abs(out[i+2] - 255);
    if (diff > WHITE_THRESHOLD) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

const cW = maxX - minX + 1;
const cH = maxY - minY + 1;
console.log(`Logo bounding box: (${minX},${minY})→(${maxX},${maxY}) = ${cW}×${cH}`);
console.log(`Logo fills ${(cW/W*100).toFixed(1)}% W × ${(cH/H*100).toFixed(1)}% H of original`);

// ── 4. Crop to logo + 3% padding ─────────────────────────────────────────────
const PAD  = Math.round(Math.max(cW, cH) * 0.03);
const cL   = Math.max(0, minX - PAD);
const cT   = Math.max(0, minY - PAD);
const cCW  = Math.min(W - cL, cW + PAD * 2);
const cCH  = Math.min(H - cT, cH + PAD * 2);

// ── 5. Scale cropped logo to FILL fraction of output canvas ──────────────────
const logoSz = Math.round(SIZE * FILL);
const offset = Math.round((SIZE - logoSz) / 2);

const logoBuffer = await sharp(out, { raw: { width: W, height: H, channels: 4 } })
  .extract({ left: cL, top: cT, width: cCW, height: cCH })
  .resize(logoSz, logoSz, {
    fit: "contain",
    background: WHITE, // fills letterbox if logo is wide
  })
  .png()
  .toBuffer();

// ── 6. Write icon.png (iOS) — white canvas, no alpha ─────────────────────────
await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: WHITE } })
  .composite([{ input: logoBuffer, left: offset, top: offset }])
  .flatten({ background: WHITE })
  .removeAlpha()
  .png({ compressionLevel: 9 })
  .toFile(OUT);

// ── 7. Write adaptive-icon.png (Android foreground) — transparent bg ──────────
// Android adaptive icons: foreground is composited over backgroundColor in app.json.
// Use same logo at 60% so it stays within Android's "safe zone" (66% of icon area).
const adSz  = Math.round(SIZE * 0.60);
const adOff = Math.round((SIZE - adSz) / 2);

const adLogoBuffer = await sharp(out, { raw: { width: W, height: H, channels: 4 } })
  .extract({ left: cL, top: cT, width: cCW, height: cCH })
  .resize(adSz, adSz, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 }, // transparent letterbox
  })
  .png()
  .toBuffer();

// Recolor adaptive logo to coral on transparent background
const { data: adData, info: adInfo } = await sharp(adLogoBuffer)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const adOut = Buffer.alloc(adData.length);
for (let i = 0; i < adData.length; i += 4) {
  const r = adData[i], g = adData[i+1], b = adData[i+2], a = adData[i+3];
  // White pixels from letterbox → transparent
  const isWhite = r > 240 && g > 240 && b > 240;
  adOut[i]   = isWhite ? 255 : CORAL.r;
  adOut[i+1] = isWhite ? 255 : CORAL.g;
  adOut[i+2] = isWhite ? 255 : CORAL.b;
  adOut[i+3] = isWhite ? 0   : a;
}

await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r:0,g:0,b:0,alpha:0 } } })
  .composite([{
    input: await sharp(adOut, { raw: { width: adInfo.width, height: adInfo.height, channels: 4 } })
      .png().toBuffer(),
    left: adOff,
    top: adOff,
  }])
  .png({ compressionLevel: 9 })
  .toFile(OUT_AD);

// ── 8. Verify ─────────────────────────────────────────────────────────────────
const m1 = await sharp(OUT).metadata();
const m2 = await sharp(OUT_AD).metadata();
console.log(`\nicon.png:          ${m1.width}×${m1.height}, hasAlpha=${m1.hasAlpha}, size=${(fs.statSync(OUT).size/1024).toFixed(1)}KB`);
console.log(`adaptive-icon.png: ${m2.width}×${m2.height}, hasAlpha=${m2.hasAlpha}, size=${(fs.statSync(OUT_AD).size/1024).toFixed(1)}KB`);
console.log("\nDone — white background, coral logo at 80% scale.");
