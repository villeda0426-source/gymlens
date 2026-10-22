// Equipment scan flow with mocked AI, catalog and database — no network,
// no paid calls. Run: npm run test:server
import { test } from "node:test";
import assert from "node:assert/strict";
import type { EquipmentIdentification, EquipmentObservation } from "../../lib/ai";
import type { EquipmentCatalog, CatalogRetrievalRequest } from "../services/equipmentCatalogService";
import type { CatalogItem, CatalogManufacturer, CatalogType } from "../services/equipmentMatching";
import { resolveTypes } from "../services/equipmentMatching";
import { scanEquipment, type LegacyEquipmentRepo, type ScanDeps } from "../services/equipmentScanService";

// ─── Fixtures (shaped like the live catalog rows) ────────────────────────────

const TYPES: CatalogType[] = [
  { slug: "leg-press", name: "Leg press", name_es: "Prensa de piernas", category: "machine", aliases: ["linear leg press", "prensa", "seated leg press"], primary_muscles: ["quads", "glutes"] },
  { slug: "chest-press-machine", name: "Chest press machine", name_es: "Máquina de press de pecho", category: "machine", aliases: ["seated chest press", "press de pecho"], primary_muscles: ["chest"] },
  { slug: "shoulder-press-machine", name: "Shoulder press machine", name_es: "Máquina de press de hombros", category: "machine", aliases: ["overhead press machine"], primary_muscles: ["shoulders"] },
  { slug: "smith-machine", name: "Smith machine", name_es: "Máquina Smith", category: "machine", aliases: ["multipower"], primary_muscles: [] },
  { slug: "treadmill", name: "Treadmill", name_es: "Cinta de correr", category: "cardio", aliases: ["running machine", "caminadora"], primary_muscles: [] },
  { slug: "elliptical", name: "Elliptical trainer", name_es: "Máquina elíptica", category: "cardio", aliases: ["cross trainer", "eliptica"], primary_muscles: [] },
];

const MANUFACTURERS: CatalogManufacturer[] = [
  { slug: "life-fitness", name: "Life Fitness", aliases: ["LIFE FITNESS"] },
  { slug: "cybex", name: "Cybex", aliases: ["CYBEX"] },
  { slug: "hammer-strength", name: "Hammer Strength", aliases: [] },
  { slug: "ivan-unresolved-source-label", name: "Ivan (unresolved source label)", aliases: ["Ivan"] },
];

function item(partial: Partial<CatalogItem> & Pick<CatalogItem, "id" | "type_slug" | "display_name">): CatalogItem {
  const type = TYPES.find((t) => t.slug === partial.type_slug)!;
  return {
    slug: partial.id,
    display_name_es: partial.display_name,
    type_name: type.name,
    type_name_es: type.name_es,
    category: type.category,
    manufacturer_slug: null,
    manufacturer: null,
    model_identifier: null,
    series_name: null,
    identifier_specificity: "unspecified",
    aliases: [],
    resistance_types: [],
    evidence_count: 1,
    has_verified_installation: false,
    approved_visual_reference_count: 0,
    ...partial,
  };
}

const ITEMS: CatalogItem[] = [
  item({ id: "cat-lp-cybex-eagle", type_slug: "leg-press", display_name: "Cybex Eagle Leg press", manufacturer_slug: "cybex", manufacturer: "Cybex", series_name: "Eagle", identifier_specificity: "reported_series", resistance_types: ["weight_stack"] }),
  item({ id: "cat-lp-hs-slp", type_slug: "leg-press", display_name: "Life Fitness HS-SLP Leg press", manufacturer_slug: "life-fitness", manufacturer: "Life Fitness", model_identifier: "HS-SLP", identifier_specificity: "reported_model", resistance_types: ["plate_loaded"] }),
  item({ id: "cat-lp-generic", type_slug: "leg-press", display_name: "Leg press", resistance_types: ["plate_loaded"] }),
  item({ id: "cat-cp-hs-cp", type_slug: "chest-press-machine", display_name: "Life Fitness HS-CP Chest press machine", manufacturer_slug: "life-fitness", manufacturer: "Life Fitness", model_identifier: "HS-CP", identifier_specificity: "reported_model", resistance_types: ["plate_loaded"] }),
  item({ id: "cat-cp-generic", type_slug: "chest-press-machine", display_name: "Chest press machine" }),
  item({ id: "cat-sp-lf", type_slug: "shoulder-press-machine", display_name: "Life Fitness Shoulder press machine", manufacturer_slug: "life-fitness", manufacturer: "Life Fitness" }),
  item({ id: "cat-smith-hssm", type_slug: "smith-machine", display_name: "Life Fitness HSSM Smith machine", manufacturer_slug: "life-fitness", manufacturer: "Life Fitness", model_identifier: "HSSM", identifier_specificity: "reported_model" }),
  item({ id: "cat-smith-generic", type_slug: "smith-machine", display_name: "Smith machine" }),
  item({ id: "cat-tm-clst", type_slug: "treadmill", display_name: "Life Fitness CLST Treadmill", manufacturer_slug: "life-fitness", manufacturer: "Life Fitness", model_identifier: "CLST", identifier_specificity: "reported_model" }),
];

// public.equipment — the existing app table; ids deliberately unlike catalog ids.
const LEGACY_ROWS = [
  { id: "legacy-leg-press", name: "Leg Press Machine" },
  { id: "legacy-chest-press", name: "Chest Press Machine" },
  { id: "legacy-shoulder-press", name: "Shoulder Press Machine" },
  { id: "legacy-smith", name: "Smith Machine" },
  { id: "legacy-treadmill", name: "Treadmill" },
];

function observation(partial: Partial<EquipmentObservation>): EquipmentObservation {
  return {
    is_gym_equipment: true,
    equipment_type: "leg press",
    equipment_type_es: "",
    alternative_types: [],
    category: "machine",
    type_confidence: 0.9,
    resistance: "unknown",
    visible_features: [],
    brand_text: null,
    model_text: null,
    other_label_text: [],
    full_machine_visible: true,
    label_legibility: "none",
    ...partial,
  };
}

const FULL_IDENTIFICATION: EquipmentIdentification = {
  name: "Sled Push",
  name_es: "Trineo de empuje",
  category: "accessory",
  confidence: 0.86,
  description: "A weighted sled pushed along the floor.",
  description_es: "Un trineo con peso que se empuja por el suelo.",
  muscle_groups: ["quads", "glutes"],
  tutorial_steps: [{ step: 1, instruction: "Lean in and drive with your legs.", instruction_es: "Inclínate y empuja con las piernas." }],
  safety_tips: ["Keep a neutral spine."],
  safety_tips_es: ["Mantén la espalda neutra."],
  difficulty: "beginner",
  search_query: "sled push form",
};

interface Harness {
  deps: ScanDeps;
  calls: { identify: number; retrieve: CatalogRetrievalRequest[]; saved: string[] };
}

function harness(options: {
  observation: EquipmentObservation;
  catalogFails?: boolean;
  saveFails?: boolean;
  listFails?: boolean;
  gymListedIds?: string[];
  identification?: EquipmentIdentification;
}): Harness {
  const calls = { identify: 0, retrieve: [] as CatalogRetrievalRequest[], saved: [] as string[] };
  const catalog: EquipmentCatalog = {
    async vocabulary() {
      if (options.catalogFails) throw new Error("Catalog types failed: connection refused");
      return { types: TYPES, manufacturers: MANUFACTURERS };
    },
    async retrieve(request) {
      calls.retrieve.push(request);
      if (options.catalogFails) throw new Error("Catalog search failed: connection refused");
      // Mirrors the RPC: filter by type slug, or a single printed code.
      const byType = ITEMS.filter((entry) => request.typeSlugs.includes(entry.type_slug));
      const byCode = ITEMS.filter((entry) =>
        request.labelCodes.some((code) => entry.model_identifier && entry.display_name.toLowerCase().includes(code.toLowerCase()))
      );
      const seen = new Set<string>();
      const items = [...byCode, ...byType].filter((entry) => (seen.has(entry.id) ? false : (seen.add(entry.id), true)));
      return { items, gymListedIds: new Set(options.gymListedIds ?? []) };
    },
  };
  const legacy: LegacyEquipmentRepo = {
    async list() {
      if (options.listFails) throw new Error("equipment list: connection reset");
      return LEGACY_ROWS;
    },
    async fetch(id) {
      const row = LEGACY_ROWS.find((entry) => entry.id === id);
      return row ? { ...row, name_es: row.name, tutorial_steps: [], safety_tips: [] } : null;
    },
    async fetchVideos() {
      return [];
    },
    async save(identification) {
      if (options.saveFails) return null;
      calls.saved.push(identification.name);
      return { id: "legacy-new-row" };
    },
    async saveVideos() {},
    async recordIdentification() {
      return "identification-1";
    },
  };
  const deps: ScanDeps = {
    observe: async () => options.observation,
    identify: async () => {
      calls.identify += 1;
      return options.identification ?? FULL_IDENTIFICATION;
    },
    catalog,
    legacy,
    videos: async () => [],
    rememberPendingSave: () => "save-token-1",
  };
  return { deps, calls };
}

const scan = (h: Harness, saveRetry = true, gymSlug: string | null = null) =>
  scanEquipment({ image: "base64", userId: "user-1", saveRetry, gymSlug }, h.deps);

const match = (body: Record<string, unknown>) => body.catalog_match as any;

// ─── Tests ───────────────────────────────────────────────────────────────────

test("clear type match: generic type, catalog candidates, no model claimed", async () => {
  const h = harness({ observation: observation({ equipment_type: "leg press", type_confidence: 0.92 }) });
  const { status, body } = await scan(h);
  assert.equal(status, 200);
  assert.equal(body.id, "legacy-leg-press");
  assert.equal(body.confidence, 0.92);
  const m = match(body);
  assert.equal(m.status, "matched");
  assert.equal(m.level, "type");
  assert.equal(m.type.slug, "leg-press");
  assert.equal(m.item, null);
  assert.equal(m.basis.model, null);
  assert.ok(m.candidates.length >= 2);
  assert.ok(m.candidates.every((c: any) => c.type_slug === "leg-press"));
  assert.ok(m.candidates.every((c: any) => Number.isInteger(c.retrieval_rank) && !("confidence" in c)));
  assert.equal(m.reference_images_used, false);
});

test("readable model code: exact model from the printed label, with brand", async () => {
  const h = harness({
    observation: observation({
      equipment_type: "seated chest press",
      equipment_type_es: "press de pecho sentado",
      brand_text: "LIFE FITNESS",
      model_text: "HS-CP",
      label_legibility: "clear",
      resistance: "plate_loaded",
    }),
  });
  const { body } = await scan(h);
  const m = match(body);
  assert.equal(m.level, "model");
  assert.equal(m.item.catalog_item_id, "cat-cp-hs-cp");
  assert.equal(m.item.model_identifier, "HS-CP");
  assert.deepEqual(m.basis, { type: "photo", manufacturer: "printed_label", model: "printed_label" });
  assert.equal(m.manufacturer.slug, "life-fitness");
  assert.equal(m.retake_hint, null);
  // The legacy row still carries the tutorials; catalog id stays in catalog_match.
  assert.equal(body.id, "legacy-chest-press");
  assert.notEqual(body.id, m.item.catalog_item_id);
});

test("model code printed without its hyphen still matches, brand unreadable", async () => {
  const h = harness({ observation: observation({ equipment_type: "chest press", model_text: "HSCP", label_legibility: "clear" }) });
  const m = match((await scan(h)).body);
  assert.equal(m.level, "model");
  assert.equal(m.item.catalog_item_id, "cat-cp-hs-cp");
  assert.equal(m.basis.manufacturer, null);
});

test("ambiguous machine: several candidates, alternates and a retake hint", async () => {
  const h = harness({
    observation: observation({
      equipment_type: "chest press",
      alternative_types: ["shoulder press machine"],
      type_confidence: 0.5,
      full_machine_visible: false,
      label_legibility: "partial",
    }),
  });
  const { status, body } = await scan(h);
  assert.equal(status, 200);
  assert.equal(body.confidence, 0.5);
  const m = match(body);
  assert.equal(m.level, "type");
  assert.equal(m.item, null);
  assert.equal(m.retake_hint, "show_full_machine");
  assert.deepEqual(m.alternative_types.map((t: any) => t.slug), ["shoulder-press-machine"]);
  assert.ok(m.candidates.length >= 2);
  assert.deepEqual((body.alternates as any[]).map((a) => a.id), ["legacy-shoulder-press"]);
  // Alternates carry no invented confidence.
  assert.ok((body.alternates as any[]).every((a) => !("confidence" in a)));
});

test("several models fit and no label: asks for the model label", async () => {
  const h = harness({ observation: observation({ equipment_type: "leg press", type_confidence: 0.85, label_legibility: "none" }) });
  const m = match((await scan(h)).body);
  assert.equal(m.level, "type");
  assert.equal(m.retake_hint, "show_model_label");
});

test("equipment absent from the catalog: 'none of these', full identification, catalog untouched", async () => {
  const h = harness({ observation: observation({ equipment_type: "sled push", equipment_type_es: "trineo", type_confidence: 0.8 }) });
  const { status, body } = await scan(h);
  assert.equal(status, 200);
  const m = match(body);
  assert.equal(m.status, "no_candidates");
  assert.equal(m.level, "none");
  assert.deepEqual(m.candidates, []);
  assert.equal(h.calls.identify, 1);
  assert.deepEqual(h.calls.saved, ["Sled Push"]);
  assert.equal(body.id, "legacy-new-row");
  // Confidence is the lower of photo and full identification, never 1.
  assert.equal(body.confidence, 0.8);
});

test("catalog outage: scan still succeeds, catalog marked unavailable", async () => {
  const h = harness({ observation: observation({ equipment_type: "smith machine", type_confidence: 0.88 }), catalogFails: true });
  const { status, body } = await scan(h);
  assert.equal(status, 200);
  assert.equal(body.id, "legacy-smith");
  const m = match(body);
  assert.equal(m.status, "unavailable");
  assert.equal(m.level, null);
  assert.deepEqual(m.candidates, []);
});

test("cached name match no longer means 100% / exact model", async () => {
  const h = harness({ observation: observation({ equipment_type: "smith machine", type_confidence: 0.62 }) });
  const { body } = await scan(h);
  assert.equal(body.fromCache, true);
  assert.equal(body.id, "legacy-smith");
  assert.equal(body.confidence, 0.62);
  assert.notEqual(body.confidence, 1);
  const m = match(body);
  assert.equal(m.level, "type");
  assert.equal(m.item, null);
  assert.equal(m.basis.model, null);
});

test("a label that names a different type never overrides the photo", async () => {
  const h = harness({
    observation: observation({ equipment_type: "treadmill", equipment_type_es: "cinta de correr", category: "cardio", model_text: "HS-SLP", label_legibility: "clear" }),
  });
  const m = match((await scan(h)).body);
  assert.notEqual(m.level, "model");
  assert.equal(m.type.slug, "treadmill");
  assert.ok(m.candidates.every((c: any) => c.type_slug === "treadmill"));
  assert.ok(m.notes.includes("label_matches_other_type"));
});

test("a printed brand that contradicts an entry rules it out", async () => {
  const h = harness({ observation: observation({ equipment_type: "chest press", brand_text: "CYBEX", label_legibility: "partial" }) });
  const m = match((await scan(h)).body);
  assert.equal(m.level, "manufacturer");
  assert.equal(m.manufacturer.slug, "cybex");
  assert.ok(m.candidates.every((c: any) => c.manufacturer !== "Life Fitness"));
});

test("gym listings reorder within the photographed type but never override it", async () => {
  const h = harness({
    observation: observation({ equipment_type: "smith machine", type_confidence: 0.9 }),
    gymListedIds: ["cat-lp-hs-slp", "cat-smith-generic"],
  });
  const m = match((await scan(h, true, "some-gym")).body);
  assert.equal(m.type.slug, "smith-machine");
  assert.ok(!m.candidates.some((c: any) => c.catalog_item_id === "cat-lp-hs-slp"));
  const listed = m.candidates.find((c: any) => c.catalog_item_id === "cat-smith-generic");
  assert.ok(listed.match_reasons.includes("gym_source_listing"));
  assert.equal(listed.has_verified_installation, false);
});

test("unclear or non-equipment photo is refused, not forced into a match", async () => {
  const notEquipment = await scan(harness({ observation: observation({ is_gym_equipment: false }) }));
  assert.equal(notEquipment.status, 422);
  const blurry = await scan(harness({ observation: observation({ type_confidence: 0.2 }) }));
  assert.equal(blurry.status, 422);
});

test("save failure: newer apps get a retry token, older builds keep the 502", async () => {
  const obs = observation({ equipment_type: "sled push", type_confidence: 0.8 });
  const retry = await scan(harness({ observation: obs, saveFails: true }), true);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.save_failed, true);
  assert.equal(retry.body.save_token, "save-token-1");
  assert.equal(retry.body.id, null);
  assert.ok(retry.body.catalog_match);

  const legacy = await scan(harness({ observation: obs, saveFails: true }), false);
  assert.equal(legacy.status, 502);
  assert.equal(legacy.body.error, "I identified the equipment but couldn't save it. Please try again.");
});

test("equipment list outage: identification kept for a save retry, nothing written blind", async () => {
  const h = harness({ observation: observation({ equipment_type: "sled push", type_confidence: 0.8 }), listFails: true });
  const result = await scan(h, true);
  assert.equal(result.status, 200);
  assert.equal(result.body.save_failed, true);
  assert.equal(result.body.save_token, "save-token-1");
  assert.equal(result.body.name, "Sled Push");
  // Saving without the list could duplicate an existing machine.
  assert.deepEqual(h.calls.saved, []);
});

test("legacy response shape is preserved for existing app builds", async () => {
  const { body } = await scan(harness({ observation: observation({ equipment_type: "leg press" }) }));
  for (const key of ["id", "name", "confidence", "videos", "identification_id", "fromCache", "alternates"]) {
    assert.ok(key in body, `missing ${key}`);
  }
  assert.equal(typeof body.confidence, "number");
  assert.ok(Array.isArray(body.alternates));
});

test("the English type decides when the Spanish name disagrees", () => {
  const matches = resolveTypes(observation({ equipment_type: "smith machine", equipment_type_es: "prensa de piernas" }), TYPES);
  assert.equal(matches[0].type.slug, "smith-machine");
});

test("Spanish and accented names resolve to catalog types", () => {
  const matches = resolveTypes(
    observation({ equipment_type: "", equipment_type_es: "Máquina elíptica", alternative_types: ["caminadora"] }),
    TYPES
  );
  assert.equal(matches[0].type.slug, "elliptical");
  assert.equal(matches[1].type.slug, "treadmill");
});
