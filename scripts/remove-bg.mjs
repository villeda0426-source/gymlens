import { Jimp, intToRGBA, rgbaToInt } from "jimp";

const FILES = [
  "coachlift-web/logo.png",
  "assets/images/coachlift-logo.png",
];

// Euclidean distance in RGB space from pure white
function distanceFromWhite(r, g, b) {
  return Math.sqrt(
    (255 - r) ** 2 +
    (255 - g) ** 2 +
    (255 - b) ** 2
  );
}

async function removeBg(filePath) {
  const img = await Jimp.read(filePath);
  const { width, height } = img.bitmap;

  img.scan(0, 0, width, height, function (x, y, idx) {
    const r = this.bitmap.data[idx + 0];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];

    // Threshold: pixels within distance 40 of white become transparent.
    // Pixels between 40–80 get partial transparency for smooth anti-aliased edges.
    const dist = distanceFromWhite(r, g, b);
    if (dist < 40) {
      this.bitmap.data[idx + 3] = 0; // fully transparent
    } else if (dist < 80) {
      // Linear fade: edge anti-aliasing
      const alpha = Math.round(((dist - 40) / 40) * 255);
      this.bitmap.data[idx + 3] = alpha;
    }
    // else: keep pixel fully opaque
  });

  await img.write(filePath);
  console.log(`✓  ${filePath}`);
}

for (const f of FILES) {
  await removeBg(f);
}
console.log("Done.");
