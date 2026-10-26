// Read-only checks against the real Supabase catalog (public anon key, no
// AI calls, no writes). Skipped unless CATALOG_LIVE=1:
//   CATALOG_LIVE=1 node --env-file=.env --require ts-node/register --test server/__tests__/equipmentCatalog.live.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import type { EquipmentObservation } from "../../lib/ai";
import { createSupabaseEquipmentCatalog } from "../services/equipmentCatalogService";
import { assessCatalogMatch, labelCodes, resolveManufacturer, resolveTypes } from "../services/equipmentMatching";

const live = process.env.CATALOG_LIVE === "1";
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

function observation(partial: Partial<EquipmentObservation>): EquipmentObservation {
  return {
    is_gym_equipment: true, equipment_type: "", equipment_type_es: "", alternative_types: [], category: "machine",
    type_confidence: 0.9, resistance: "unknown", visible_features: [], brand_text: null, model_text: null,
    other_label_text: [], full_machine_visible: true, label_legibility: "none", ...partial,
  };
}

test("live catalog: real types, a model plate, and Spanish names", { skip: !live }, async () => {
  const catalog = createSupabaseEquipmentCatalog(createClient(process.env.SUPABASE_URL!, anonKey));
  const vocabulary = await catalog.vocabulary();
  assert.ok(vocabulary.types.length >= 90);

  const run = async (obs: EquipmentObservation) => {
    const typeMatches = resolveTypes(obs, vocabulary.types);
    const manufacturer = resolveManufacturer(obs.brand_text, vocabulary.manufacturers);
    const retrieval = await catalog.retrieve({ typeSlugs: typeMatches.map((m) => m.type.slug), manufacturerSlug: manufacturer?.slug ?? null, labelCodes: labelCodes(obs) });
    return assessCatalogMatch({ observation: obs, typeMatches, manufacturer, retrieved: retrieval.items });
  };

  const legPress = await run(observation({ equipment_type: "leg press" }));
  assert.equal(legPress.type?.slug, "leg-press");
  assert.equal(legPress.level, "type");
  assert.ok(legPress.candidates.length > 1);

  const plate = await run(observation({ equipment_type: "chest press machine", brand_text: "LIFE FITNESS", model_text: "HS-CP", label_legibility: "clear" }));
  assert.equal(plate.level, "model");
  assert.equal(plate.item?.model_identifier, "HS-CP");

  const spanish = await run(observation({ equipment_type: "", equipment_type_es: "cinta de correr", category: "cardio" }));
  assert.equal(spanish.type?.slug, "treadmill");

  const absent = await run(observation({ equipment_type: "sled push" }));
  assert.equal(absent.level, "none");
  assert.deepEqual(absent.candidates, []);
});
