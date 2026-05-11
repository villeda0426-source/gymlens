import { Jimp } from "jimp";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const CREAM = 0xfaf7f0ff;
const DARK = 0x0a0a0aff;

async function makeIcon(outputPath, size, bgColor, logoScale = 0.6) {
  const bg = new Jimp({ width: size, height: size, color: bgColor });
  const logo = await Jimp.read(join(ROOT, "assets/images/coachlift-logo.png"));

  const maxDim = Math.round(size * logoScale);
  const ratio = Math.min(maxDim / logo.width, maxDim / logo.height);
  const lw = Math.round(logo.width * ratio);
  const lh = Math.round(logo.height * ratio);
  logo.resize({ w: lw, h: lh });

  const x = Math.round((size - lw) / 2);
  const y = Math.round((size - lh) / 2);
  bg.composite(logo, x, y);
  await bg.write(outputPath);
  console.log(`✓ ${outputPath} (${size}×${size})`);
}

async function makeSplash(outputPath, w, h, bgColor, logoScale = 0.45) {
  const bg = new Jimp({ width: w, height: h, color: bgColor });
  const logo = await Jimp.read(join(ROOT, "assets/images/coachlift-logo.png"));

  const maxDim = Math.round(Math.min(w, h) * logoScale);
  const ratio = Math.min(maxDim / logo.width, maxDim / logo.height);
  const lw = Math.round(logo.width * ratio);
  const lh = Math.round(logo.height * ratio);
  logo.resize({ w: lw, h: lh });

  const x = Math.round((w - lw) / 2);
  const y = Math.round((h - lh) / 2);
  bg.composite(logo, x, y);
  await bg.write(outputPath);
  console.log(`✓ ${outputPath} (${w}×${h})`);
}

async function makeFavicon(outputPath) {
  const logo = await Jimp.read(join(ROOT, "assets/images/coachlift-logo.png"));
  logo.resize({ w: 32, h: 32 });
  await logo.write(outputPath);
  console.log(`✓ ${outputPath} (32×32)`);
}

(async () => {
  // iOS app icon — cream background, logo centered
  await makeIcon(join(ROOT, "assets/icon.png"), 1024, CREAM);

  // iOS splash — cream background, logo centered, portrait
  await makeSplash(join(ROOT, "assets/splash.png"), 1284, 2778, CREAM);

  // Android adaptive icon foreground — dark background, logo centered
  await makeIcon(join(ROOT, "assets/adaptive-icon.png"), 1024, DARK, 0.55);

  // Web favicon
  await makeFavicon(join(ROOT, "assets/favicon.png"));

  console.log("\nAll assets generated successfully.");
})();
