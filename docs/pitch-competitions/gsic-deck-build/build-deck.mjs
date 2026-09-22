import fs from "node:fs/promises";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const OUT = "/Users/villedajr/SpotLift/docs/pitch-competitions/output/SpotLift-GSIC-Groundbreakers-2026.pptx";
const PREVIEW = "/Users/villedajr/SpotLift/docs/pitch-competitions/gsic-deck-build/rendered";
const MONTAGE = "/Users/villedajr/SpotLift/docs/pitch-competitions/gsic-deck-build/montage.webp";
const HERO = "/Users/villedajr/SpotLift/coachlift-web/hero-app-screenshot.png";
const AVATAR = "/Users/villedajr/SpotLift/assets/images/avatar/fitness-avatar-curved-front.png";
const LOGO = "/Users/villedajr/SpotLift/assets/images/spotlift-letters-logo.png";

const W = 1280;
const H = 720;
const INK = "#0A0A0A";
const MUTED = "#555D66";
const PANEL = "#F2F2F2";
const RULE = "#B8BCC4";
const BLUE = "#3D8DFF";
const PALE = "#EAF5FB";

const deck = Presentation.create({ slideSize: { width: W, height: H } });

function addText(slide, text, position, fontSize, options = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position,
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
    name: options.name,
  });
  shape.text = text;
  shape.text.style = {
    fontSize,
    typeface: "Helvetica Neue",
    color: options.color || INK,
    bold: options.bold || false,
    alignment: options.alignment || "left",
    verticalAlignment: options.verticalAlignment || "top",
    autoFit: options.autoFit || "shrinkText",
  };
  return shape;
}

function addFooter(slide, n) {
  addText(slide, String(n), { left: 1184, top: 659, width: 54, height: 25 }, 13, { alignment: "right" });
}

function addTitle(slide, title, n) {
  addText(slide, title, { left: 41, top: 36, width: 1198, height: 110 }, 39, { bold: true });
  addFooter(slide, n);
}

function note(slide, sources) {
  slide.speakerNotes.textFrame.setText(`[Sources]\n${sources.join("\n")}`);
  slide.speakerNotes.setVisible(true);
}

const heroBytes = new Uint8Array(await fs.readFile(HERO));
const avatarBytes = new Uint8Array(await fs.readFile(AVATAR));
const logoBytes = new Uint8Array(await fs.readFile(LOGO));

// 1 — Cover: Codex Grid slide-08 composition.
{
  const slide = deck.slides.add();
  slide.background.fill = "#FFFFFF";
  addText(slide, "SPOTLIFT  ·  v1.0.7", { left: 41, top: 36, width: 360, height: 52 }, 24, { bold: true, color: BLUE });
  addText(slide, "Turn any gym machine into a confident next step", { left: 41, top: 142, width: 575, height: 220 }, 52, { bold: true });
  addText(slide, "Camera recognition becomes clear setup, safer movement, and a workout plan that adapts to the member.", { left: 41, top: 398, width: 560, height: 150 }, 25, { color: MUTED });
  addText(slide, "Adan Villeda · Founder & Developer", { left: 41, top: 590, width: 530, height: 40 }, 18, { bold: true });
  slide.shapes.add({ geometry: "roundRect", position: { left: 658, top: 42, width: 582, height: 588 }, fill: PALE, line: { style: "solid", fill: RULE, width: 1 } });
  slide.images.add({ blob: heroBytes, contentType: "image/png", alt: "SpotLift mobile app interface", fit: "contain", geometry: "roundRect", borderRadius: "rounded-xl", position: { left: 700, top: 63, width: 496, height: 546 } });
  addFooter(slide, 1);
  note(slide, ["Product screenshot: /Users/villedajr/SpotLift/coachlift-web/hero-app-screenshot.png", "Release record: https://docs.google.com/document/d/1mqNsyPUruYtmStTt_Nty36XTN3GgB7oKwaplCZ2GM5U"]);
}

// 2 — Problem / consequence: Codex Grid slide-10 composition.
{
  const slide = deck.slides.add();
  addTitle(slide, "A gym membership does not teach a beginner what to do next", 2);
  addText(slide, "The moment of highest uncertainty happens on the equipment floor—after access has already been purchased.", { left: 41, top: 170, width: 700, height: 125 }, 30, { color: MUTED });
  const items = [
    ["Identify", "What is this machine?"],
    ["Set up safely", "How should I adjust and use it?"],
    ["Turn it into action", "How does it fit into today’s workout?"],
  ];
  items.forEach(([h, b], i) => {
    const y = 330 + i * 94;
    slide.shapes.add({ geometry: "ellipse", position: { left: 52, top: y + 6, width: 24, height: 24 }, fill: BLUE, line: { style: "solid", fill: BLUE, width: 1 } });
    addText(slide, h, { left: 96, top: y, width: 250, height: 40 }, 24, { bold: true });
    addText(slide, b, { left: 355, top: y, width: 700, height: 50 }, 23, { color: MUTED });
  });
  note(slide, ["Founder problem thesis; no external quantitative claim used."]);
}

// 3 — Workflow: Codex Grid slide-07 composition.
{
  const slide = deck.slides.add();
  addTitle(slide, "Recognition is useful only when it changes the workout", 3);
  const cols = [
    ["01", "Capture", "Take a photo or upload an image of unfamiliar gym equipment."],
    ["02", "Match", "Normalize the AI result, match it to the catalog, and handle uncertainty safely."],
    ["03", "Coach", "Deliver setup, safety, target muscles, videos, and an editable workout plan."],
  ];
  cols.forEach(([n, h, b], i) => {
    const x = 41 + i * 411;
    addText(slide, n, { left: x, top: 205, width: 80, height: 64 }, 48, { bold: true, color: BLUE });
    addText(slide, h, { left: x, top: 300, width: 350, height: 58 }, 32, { bold: true });
    addText(slide, b, { left: x, top: 390, width: 350, height: 190 }, 22, { color: MUTED });
  });
  note(slide, ["Release capabilities and recognition workflow: https://docs.google.com/document/d/1mqNsyPUruYtmStTt_Nty36XTN3GgB7oKwaplCZ2GM5U"]);
}

// 4 — Release readiness: Codex Grid slide-08 composition.
{
  const slide = deck.slides.add();
  addTitle(slide, "v1.0.7 is a pilot-ready mobile product foundation", 4);
  addText(slide, "iOS build 41 · Android version code 5", { left: 41, top: 182, width: 575, height: 66 }, 30, { bold: true, color: BLUE });
  addText(slide, "Guest access and accounts", { left: 41, top: 286, width: 575, height: 50 }, 26, { bold: true });
  addText(slide, "English and Spanish localization", { left: 41, top: 365, width: 575, height: 50 }, 26, { bold: true });
  addText(slide, "Scan history, saved equipment, feedback, and Coach workout editing", { left: 41, top: 444, width: 575, height: 96 }, 26, { bold: true });
  addText(slide, "Built for controlled gym pilots; a live production smoke test remains a release gate.", { left: 41, top: 570, width: 575, height: 54 }, 18, { color: MUTED });
  slide.shapes.add({ geometry: "roundRect", position: { left: 658, top: 148, width: 582, height: 482 }, fill: PANEL, line: { style: "solid", fill: RULE, width: 1 } });
  slide.images.add({ blob: avatarBytes, contentType: "image/png", alt: "SpotLift visual muscle avatar", fit: "contain", position: { left: 770, top: 178, width: 360, height: 422 } });
  note(slide, ["Release version, build identifiers, feature set, and smoke-test status: https://docs.google.com/document/d/1mqNsyPUruYtmStTt_Nty36XTN3GgB7oKwaplCZ2GM5U", "Product avatar asset: /Users/villedajr/SpotLift/assets/images/avatar/fitness-avatar-curved-front.png"]);
}

// 5 — Recognition reliability.
{
  const slide = deck.slides.add();
  addTitle(slide, "The defensible layer is reliable recognition—not a chatbot", 5);
  const cols = [
    ["Dedicated matching", "A purpose-built service maps AI output to the supported equipment catalog."],
    ["Safe uncertainty", "Normalized results, confidence handling, and fallbacks reduce unsupported answers."],
    ["Release discipline", "Contract checks, regression coverage, visual regression, and monitoring protect the workflow."],
  ];
  cols.forEach(([h, b], i) => {
    const x = 41 + i * 411;
    slide.shapes.add({ geometry: "rect", position: { left: x, top: 232, width: 375, height: 397 }, fill: i === 1 ? PALE : PANEL, line: { style: "solid", fill: RULE, width: 1 } });
    addText(slide, h, { left: x + 28, top: 278, width: 319, height: 72 }, 27, { bold: true });
    addText(slide, b, { left: x + 28, top: 388, width: 319, height: 182 }, 21, { color: MUTED });
  });
  note(slide, ["Recognition architecture, uncertainty handling, fallbacks, regression coverage, and monitoring: https://docs.google.com/document/d/1mqNsyPUruYtmStTt_Nty36XTN3GgB7oKwaplCZ2GM5U"]);
}

// 6 — Business model and pilot path.
{
  const slide = deck.slides.add();
  addTitle(slide, "Start with the member; prove value with the gym", 6);
  addText(slide, "A controlled pilot connects product engagement to the onboarding outcomes operators care about.", { left: 41, top: 145, width: 1197, height: 82 }, 25, { color: MUTED });
  const stats = [
    ["Free", "Recognition and essential equipment guidance drive trial"],
    ["Premium", "Personalized plans and AI coaching deepen retention"],
    ["B2B", "Gym licensing can scale a co-branded onboarding layer"],
  ];
  stats.forEach(([s, b], i) => {
    const x = 41 + i * 411;
    slide.shapes.add({ geometry: "roundRect", position: { left: x, top: 317, width: 375, height: 312 }, fill: PANEL, line: { style: "solid", fill: "none", width: 0 } });
    addText(slide, s, { left: x + 32, top: 356, width: 310, height: 90 }, 44, { bold: true, color: BLUE, verticalAlignment: "bottom" });
    addText(slide, b, { left: x + 32, top: 476, width: 310, height: 112 }, 21, { bold: true });
  });
  note(slide, ["Business model: founder-approved TechRise application plan, August 4, 2026.", "Product capabilities supporting the model: https://docs.google.com/document/d/1mqNsyPUruYtmStTt_Nty36XTN3GgB7oKwaplCZ2GM5U"]);
}

// 7 — Ask: Codex Grid slide-26 composition.
{
  const slide = deck.slides.add();
  addText(slide, "SPOTLIFT", { left: 41, top: 40, width: 230, height: 54 }, 24, { bold: true, color: BLUE });
  addText(slide, "Prove that one confident scan creates a stronger member journey", { left: 41, top: 170, width: 1040, height: 280 }, 52, { bold: true, verticalAlignment: "bottom" });
  addText(slide, "Seeking gym and equipment partners", { left: 41, top: 515, width: 500, height: 42 }, 23, { bold: true, color: BLUE });
  addText(slide, "Measure scan → guidance → workout conversion", { left: 41, top: 565, width: 570, height: 34 }, 20, { color: MUTED });
  addText(slide, "Validate confidence, activation, and repeat use", { left: 41, top: 605, width: 570, height: 34 }, 20, { color: MUTED });
  addText(slide, "Adan Villeda · villeda.0426@gmail.com", { left: 765, top: 580, width: 474, height: 42 }, 20, { alignment: "right", bold: true });
  note(slide, ["Company logo: /Users/villedajr/SpotLift/assets/images/spotlift-letters-logo.png", "Pilot thesis: founder-approved GSIC application strategy."]);
}

await fs.mkdir(PREVIEW, { recursive: true });
for (const [index, slide] of deck.slides.items.entries()) {
  const png = await deck.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(`${PREVIEW}/slide-${index + 1}.png`, new Uint8Array(await png.arrayBuffer()));
  const layout = await slide.export({ format: "layout" });
  await fs.writeFile(`${PREVIEW}/slide-${index + 1}.layout.json`, await layout.text());
}
const montage = await deck.export({ format: "webp", montage: true, scale: 1 });
await fs.writeFile(MONTAGE, new Uint8Array(await montage.arrayBuffer()));
const pptx = await PresentationFile.exportPptx(deck);
await pptx.save(OUT);
console.log(OUT);
