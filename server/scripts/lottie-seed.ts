/**
 * Searches LottieFiles for gym/fitness animations, then:
 *   - Updates existing equipment rows with lottie_animation_url
 *   - Uses OpenAI to generate data for new equipment and inserts them
 *
 * Run: npx ts-node --project server/tsconfig.json server/scripts/lottie-seed.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });
import { createStructuredResponse } from "../services/openaiService";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const LOTTIE_GRAPHQL = "https://graphql.lottiefiles.com/2022-08";

const SEARCH_TERMS = [
  "gym",
  "exercise",
  "workout",
  "fitness",
  "squat",
  "deadlift",
  "bench press",
  "curl",
  "row",
  "press",
  "machine",
  "dumbbell",
  "barbell",
  "cable",
  "pullup",
  "pushup",
  "lunge",
  "plank",
];

interface LottieAnimation {
  id: number;
  name: string;
  lottieUrl: string;
  jsonUrl: string;
  description: string;
}

interface EquipmentRow {
  id: string;
  name: string;
}

// ─── LottieFiles helpers ────────────────────────────────────────────────────

async function searchLottie(query: string, first = 20): Promise<LottieAnimation[]> {
  const gql = `
    { searchPublicAnimations(query: ${JSON.stringify(query)}, first: ${first}) {
        edges { node { id name lottieUrl jsonUrl description } }
      }
    }`;
  const res = await fetch(LOTTIE_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: gql }),
  });
  const json = (await res.json()) as any;
  return (json.data?.searchPublicAnimations?.edges ?? []).map((e: any) => e.node);
}

// ─── Supabase helpers ────────────────────────────────────────────────────────

function sbHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

async function getAllEquipment(): Promise<EquipmentRow[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/equipment?select=id,name&limit=500`, {
    headers: sbHeaders(),
  });
  return res.json() as Promise<EquipmentRow[]>;
}

async function updateEquipmentLottie(id: string, url: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/equipment?id=eq.${id}`, {
    method: "PATCH",
    headers: sbHeaders(),
    body: JSON.stringify({ lottie_animation_url: url }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PATCH failed (${res.status}): ${body}`);
  }
}

async function insertEquipment(data: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/equipment`, {
    method: "POST",
    headers: sbHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`INSERT failed (${res.status}): ${body}`);
  }
  const rows = (await res.json()) as { id: string }[];
  return rows[0]?.id ?? "unknown";
}

// ─── Name-matching helper ────────────────────────────────────────────────────

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function findExistingMatch(animName: string, equipment: EquipmentRow[]): EquipmentRow | null {
  const an = normalize(animName);

  // Exact match
  const exact = equipment.find((e) => normalize(e.name) === an);
  if (exact) return exact;

  // Contained match (animation name contains equipment name or vice versa)
  const contained = equipment.find((e) => {
    const en = normalize(e.name);
    return an.includes(en) || en.includes(an);
  });
  return contained ?? null;
}

// ─── OpenAI helper ───────────────────────────────────────────────────────────

interface EquipmentData {
  isEquipment: boolean;
  name: string;
  name_es: string;
  description: string;
  description_es: string;
  muscle_groups: string[];
  category: "machine" | "free weights" | "bodyweight" | "cable" | "cardio" | "accessory";
  difficulty: "beginner" | "intermediate" | "advanced";
  tutorial_steps: { step: number; instruction: string; instruction_es: string }[];
  safety_tips: string[];
  safety_tips_es: string[];
}

async function generateEquipmentData(animationName: string): Promise<EquipmentData> {
  return createStructuredResponse<EquipmentData>({
    instructions:
      "You are a fitness equipment catalog editor. Reject generic animation labels. For recognizable equipment or exercises, provide concise bilingual catalog data and conservative safety guidance.",
    input: `Animation library label: ${animationName}`,
    schemaName: "equipment_seed_data",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["isEquipment", "name", "name_es", "description", "description_es", "muscle_groups", "category", "difficulty", "tutorial_steps", "safety_tips", "safety_tips_es"],
      properties: {
        isEquipment: { type: "boolean" },
        name: { type: "string" },
        name_es: { type: "string" },
        description: { type: "string" },
        description_es: { type: "string" },
        muscle_groups: { type: "array", items: { type: "string" } },
        category: { type: "string", enum: ["machine", "free weights", "bodyweight", "cable", "cardio", "accessory"] },
        difficulty: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
        tutorial_steps: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["step", "instruction", "instruction_es"],
            properties: {
              step: { type: "integer" },
              instruction: { type: "string" },
              instruction_es: { type: "string" },
            },
          },
        },
        safety_tips: { type: "array", items: { type: "string" } },
        safety_tips_es: { type: "array", items: { type: "string" } },
      },
    },
    maxOutputTokens: 1200,
    timeoutMs: 30000,
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🏋️  GymLens Lottie Seed — starting\n");

  // 1. Gather all LottieFiles animations
  console.log("📡 Searching LottieFiles...");
  const seenIds = new Set<number>();
  const allAnimations: LottieAnimation[] = [];

  for (const term of SEARCH_TERMS) {
    const results = await searchLottie(term, 20);
    let newCount = 0;
    for (const a of results) {
      if (!seenIds.has(a.id) && a.lottieUrl) {
        seenIds.add(a.id);
        allAnimations.push(a);
        newCount++;
      }
    }
    console.log(`  "${term}" → ${results.length} results, ${newCount} new unique`);
    // Small delay to be polite to the API
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log(`\n✅ Collected ${allAnimations.length} unique Lottie animations\n`);

  // 2. Fetch existing equipment
  const equipment = await getAllEquipment();
  console.log(`📋 Found ${equipment.length} existing equipment records in Supabase\n`);

  // 3. Process each animation
  let updated = 0;
  let created = 0;
  let skipped = 0;

  for (const anim of allAnimations) {
    const match = findExistingMatch(anim.name, equipment);

    if (match) {
      // Update existing row
      try {
        await updateEquipmentLottie(match.id, anim.lottieUrl);
        console.log(`  ✏️  Updated "${match.name}" → ${anim.lottieUrl.slice(0, 60)}...`);
        updated++;
      } catch (err: any) {
        console.error(`  ❌ Failed to update "${match.name}": ${err.message}`);
        skipped++;
      }
    } else {
      // Ask OpenAI if this is real equipment worth inserting
      try {
        const data = await generateEquipmentData(anim.name);
        if (!data.isEquipment) {
          console.log(`  ⏭️  Skipped "${anim.name}" (not specific equipment)`);
          skipped++;
          continue;
        }

        // Check again with the AI-cleaned name in case it matches now
        const rematch = findExistingMatch(data.name, equipment);
        if (rematch) {
          await updateEquipmentLottie(rematch.id, anim.lottieUrl);
          console.log(`  ✏️  Updated (AI-matched) "${rematch.name}" → ${anim.lottieUrl.slice(0, 50)}...`);
          updated++;
          continue;
        }

        const newId = await insertEquipment({
          name: data.name,
          name_es: data.name_es,
          description: data.description,
          description_es: data.description_es,
          muscle_groups: data.muscle_groups,
          category: data.category,
          difficulty: data.difficulty,
          tutorial_steps: data.tutorial_steps,
          safety_tips: data.safety_tips,
          safety_tips_es: data.safety_tips_es,
          lottie_animation_url: anim.lottieUrl,
        });
        console.log(`  ➕ Inserted "${data.name}" (id: ${newId})`);
        // Add to local list so later duplicates get matched
        equipment.push({ id: newId, name: data.name });
        created++;
      } catch (err: any) {
        console.error(`  ❌ Failed to process "${anim.name}": ${err.message}`);
        skipped++;
      }
      // Keep catalog generation deliberately paced.
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 SUMMARY");
  console.log(`   Updated:  ${updated} existing equipment rows`);
  console.log(`   Created:  ${created} new equipment rows`);
  console.log(`   Skipped:  ${skipped} animations (generic or errors)`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
