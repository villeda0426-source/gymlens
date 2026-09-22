import fs from "node:fs/promises";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const input = "/Users/villedajr/SpotLift/docs/pitch-competitions/output/SpotLift-Pitch-Deck-1.0.7.pptx";
const output = "/Users/villedajr/SpotLift/docs/pitch-competitions/output/SpotLift-Pitch-Deck-1.0.7.pptx";
const preview = "/Users/villedajr/SpotLift/docs/pitch-competitions/email-update/final-slide.png";

const deck = await PresentationFile.importPptx(await FileBlob.load(input));
const found = await deck.inspect({ kind: "slide,textbox,shape", search: "villeda.0426@gmail.com", maxChars: 8000 });
const records = found.ndjson.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
const targets = records.filter((record) => record.id && JSON.stringify(record).includes("villeda.0426@gmail.com"));
if (targets.length !== 1) throw new Error(`Expected one email target, found ${targets.length}`);

const target = deck.resolve(targets[0].id);
target.text.replace("villeda.0426@gmail.com", "coachlift71@gmail.com");

const check = await deck.inspect({ kind: "slide,textbox,shape", search: "coachlift71@gmail.com", maxChars: 8000 });
if (!check.ndjson.includes("coachlift71@gmail.com")) throw new Error("Updated email was not found after edit");

const finalSlide = deck.slides.items[deck.slides.items.length - 1];
const png = await deck.export({ slide: finalSlide, format: "png", scale: 1 });
await fs.writeFile(preview, new Uint8Array(await png.arrayBuffer()));

const pptx = await PresentationFile.exportPptx(deck);
await pptx.save(output);
console.log(JSON.stringify({ output, preview, targetId: targets[0].id }));
