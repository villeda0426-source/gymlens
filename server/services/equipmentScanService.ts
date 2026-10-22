// Equipment scan: photo -> observation -> catalog candidates -> qualified
// result.
//
// ORDER — database first, full AI only when nothing matches:
// 1. Read the photo (observe): a short vision call that only says what
//    type of machine it is and any printed brand/model text. A photo can't
//    be looked up without this step; it writes nothing.
// 2. Look it up in our database: the research catalog
//    (equipment_catalog_*) and the app's equipment library
//    (public.equipment). A library match returns its stored tutorial,
//    videos and safety tips — no further AI call (fromCache: true).
// 3. Only when the library has no match: full AI identification
//    (instructions, safety, video search), saved to the library so the
//    next scan of that machine is a step-2 match (fromCache: false). Every outside call (OpenAI, Supabase, YouTube) is injected through
// ScanDeps so the whole flow runs in tests with mocked responses
// (server/__tests__/equipmentScan.test.ts).
//
// Two identities stay separate on purpose:
// - `id` / `equipment_id` is a public.equipment row: the app's existing
//   tutorials, videos, saves and history hang off it.
// - `catalog_match.*.catalog_item_id` is an equipment_catalog_items row from
//   the research catalog. It is never written into public.equipment.
//
// And two kinds of "confidence" stay separate:
// - `confidence` (and catalog_match.photo.type_confidence) is how sure the
//   vision model is of the generic type, from the photo. A name/cache match
//   in public.equipment no longer turns this into 1.0.
// - candidate `retrieval_rank` is catalog text relevance — never a probability.
import type { EquipmentIdentification, EquipmentObservation } from "../../lib/ai";
import type { YouTubeVideo } from "../../lib/youtube";
import type { EquipmentCatalog } from "./equipmentCatalogService";
import {
  assessCatalogMatch,
  labelCodes,
  normalizeText,
  resolveManufacturer,
  resolveTypes,
  typeNames,
  type CatalogAssessment,
} from "./equipmentMatching";

// ─── Legacy name matching (public.equipment) ─────────────────────────────────

export function normalizeStr(s: string): string {
  return normalizeText(s);
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Text similarity between two equipment names. Used only to find which
// existing public.equipment row holds tutorials for a type — it says nothing
// about how sure we are of what the photo shows.
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeStr(a);
  const nb = normalizeStr(b);
  if (na === nb) return 1.0;
  // Containment only for real names — a short alias like "amt" must not
  // match whatever happens to contain those letters.
  if (Math.min(na.length, nb.length) >= 5 && (na.includes(nb) || nb.includes(na))) return 0.95;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshtein(na, nb) / maxLen;
}

export function findBestLegacyMatch(
  names: string[],
  list: { id: string; name: string }[]
): { id: string; name: string } | null {
  let best: { id: string; name: string } | null = null;
  let bestScore = 0;
  for (const name of names.filter(Boolean)) {
    for (const eq of list) {
      const score = nameSimilarity(name, eq.name);
      if (score > bestScore) {
        bestScore = score;
        best = eq;
      }
    }
  }
  return bestScore >= 0.9 ? best : null;
}

// ─── Dependencies ────────────────────────────────────────────────────────────

export interface LegacyEquipmentRepo {
  list(): Promise<{ id: string; name: string }[]>;
  fetch(id: string): Promise<Record<string, unknown> | null>;
  fetchVideos(id: string): Promise<unknown[]>;
  save(identification: EquipmentIdentification, list: { id: string; name: string }[]): Promise<{ id: string } | null>;
  saveVideos(id: string, videos: YouTubeVideo[]): Promise<void>;
  recordIdentification(equipmentId: string, name: string, raw: object | null, userId: string | null): Promise<string | null>;
}

export interface ScanDeps {
  observe(image: string): Promise<EquipmentObservation>;
  identify(image: string): Promise<EquipmentIdentification>;
  catalog: EquipmentCatalog;
  legacy: LegacyEquipmentRepo;
  videos(searchQuery: string): Promise<YouTubeVideo[]>;
  rememberPendingSave(identification: EquipmentIdentification, videos: YouTubeVideo[], userId: string | null): string;
}

export interface ScanRequest {
  image: string;
  userId: string | null;
  // Newer apps keep a result whose save failed and retry only the save.
  saveRetry: boolean;
  // Optional gym context for ordering candidates; never proof of availability.
  gymSlug?: string | null;
}

export interface ScanResult {
  status: number;
  body: Record<string, unknown>;
}

export const UNCLEAR_PHOTO_ERROR =
  "I couldn't identify that equipment confidently. Try a closer photo with the full machine visible.";
const SAVE_FAILED_ERROR = "I identified the equipment but couldn't save it. Please try again.";

// Below this, the photo doesn't support even a generic type.
const MIN_TYPE_CONFIDENCE = 0.35;
// Below this, other plausible types are offered as alternates (matches the
// app's "Strong match" badge threshold in ScanResultSheet).
const ALTERNATES_BELOW = 0.75;

type CatalogMatchBody = Omit<CatalogAssessment, "level"> & {
  status: "matched" | "no_candidates" | "unavailable";
  level: CatalogAssessment["level"] | null;
  photo: {
    type_confidence: number;
    label_legibility: EquipmentObservation["label_legibility"];
    full_machine_visible: boolean;
    brand_text: string | null;
    model_text: string | null;
  };
  // What each part of the answer rests on.
  basis: {
    type: "photo";
    manufacturer: "printed_label" | null;
    model: "printed_label" | null;
  };
  // The catalog has no approved reference images yet, so no answer is a
  // visual model match.
  reference_images_used: false;
};

async function matchCatalog(
  observation: EquipmentObservation,
  catalog: EquipmentCatalog,
  gymSlug: string | null | undefined
): Promise<{ assessment: CatalogAssessment | null; status: CatalogMatchBody["status"]; typeAliases: string[] }> {
  try {
    const vocabulary = await catalog.vocabulary();
    const typeMatches = resolveTypes(observation, vocabulary.types);
    const manufacturer = resolveManufacturer(observation.brand_text, vocabulary.manufacturers);
    const codes = labelCodes(observation);
    const retrieval = await catalog.retrieve({
      typeSlugs: typeMatches.map((match) => match.type.slug),
      manufacturerSlug: manufacturer?.slug ?? null,
      labelCodes: codes,
      gymSlug,
    });
    const assessment = assessCatalogMatch({
      observation,
      typeMatches,
      manufacturer,
      retrieved: retrieval.items,
      gymListedIds: retrieval.gymListedIds,
    });
    const primary = typeMatches.find((match) => match.source === "primary");
    return {
      assessment,
      status: assessment.level === "none" && assessment.candidates.length === 0 ? "no_candidates" : "matched",
      typeAliases: primary ? typeNames(primary.type) : [],
    };
  } catch (error: any) {
    // The catalog is extra context; a scan still works without it.
    console.error("[identify] catalog unavailable:", error?.message ?? error);
    return { assessment: null, status: "unavailable", typeAliases: [] };
  }
}

function catalogMatchBody(
  observation: EquipmentObservation,
  assessment: CatalogAssessment | null,
  status: CatalogMatchBody["status"]
): CatalogMatchBody {
  const base = assessment ?? {
    level: null,
    type: null,
    manufacturer: null,
    item: null,
    candidates: [],
    alternative_types: [],
    retake_hint: observation.type_confidence < 0.6 ? (observation.full_machine_visible ? "show_model_label" : "show_full_machine") : null,
    notes: [],
  };
  return {
    ...base,
    level: assessment ? assessment.level : null,
    status,
    photo: {
      type_confidence: observation.type_confidence,
      label_legibility: observation.label_legibility,
      full_machine_visible: observation.full_machine_visible,
      brand_text: observation.brand_text,
      model_text: observation.model_text,
    },
    basis: {
      type: "photo",
      manufacturer: assessment?.manufacturer ? "printed_label" : null,
      model: assessment && (assessment.level === "model" || assessment.level === "series") ? "printed_label" : null,
    },
    reference_images_used: false,
  };
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

// Other plausible types the app already has tutorials for.
function legacyAlternates(
  observation: EquipmentObservation,
  assessment: CatalogAssessment | null,
  list: { id: string; name: string }[],
  excludeId: string | undefined
): Array<{ id: string; name: string }> {
  if (observation.type_confidence >= ALTERNATES_BELOW) return [];
  const names = [
    ...(assessment?.alternative_types.map((type) => type.name) ?? []),
    ...observation.alternative_types,
  ];
  const seen = new Set<string>(excludeId ? [excludeId] : []);
  const alternates: Array<{ id: string; name: string }> = [];
  for (const name of names) {
    const match = findBestLegacyMatch([name], list);
    if (match && !seen.has(match.id)) {
      seen.add(match.id);
      alternates.push({ id: match.id, name: match.name });
    }
    if (alternates.length >= 2) break;
  }
  return alternates;
}

export async function scanEquipment(request: ScanRequest, deps: ScanDeps): Promise<ScanResult> {
  const observation = await deps.observe(request.image);
  const typeConfidence = clampConfidence(observation.type_confidence);
  console.log(
    "[identify] observed:",
    observation.equipment_type,
    "| type confidence:", typeConfidence.toFixed(2),
    "| brand:", observation.brand_text ?? "—",
    "| model:", observation.model_text ?? "—"
  );

  if (!observation.is_gym_equipment || !observation.equipment_type.trim() || typeConfidence < MIN_TYPE_CONFIDENCE) {
    return { status: 422, body: { error: UNCLEAR_PHOTO_ERROR } };
  }

  const [catalogResult, legacyList] = await Promise.all([
    matchCatalog({ ...observation, type_confidence: typeConfidence }, deps.catalog, request.gymSlug),
    deps.legacy.list().catch((error) => {
      console.error("[identify] equipment list error:", error?.message ?? error);
      return null;
    }),
  ]);
  // Unknown list: tutorials can't be matched, and saving could duplicate a
  // machine that already exists — so a new identification is kept for a
  // save retry instead of written blind.
  const listUnavailable = legacyList === null;
  const legacyRows = legacyList ?? [];
  const catalog_match = catalogMatchBody({ ...observation, type_confidence: typeConfidence }, catalogResult.assessment, catalogResult.status);
  console.log("[identify] catalog:", catalog_match.status, "| level:", catalog_match.level ?? "—", "| candidates:", catalog_match.candidates.length);

  // ── Tutorials already in public.equipment for this type ─────────────────
  const legacyNames = [
    observation.equipment_type,
    catalog_match.type?.name ?? "",
    ...catalogResult.typeAliases,
  ];
  const legacyMatch = findBestLegacyMatch(legacyNames, legacyRows);
  if (legacyMatch) {
    const cached = await deps.legacy.fetch(legacyMatch.id);
    if (cached) {
      const [videos, identificationId] = await Promise.all([
        deps.legacy.fetchVideos(legacyMatch.id),
        deps.legacy.recordIdentification(legacyMatch.id, legacyMatch.name, null, request.userId),
      ]);
      return {
        status: 200,
        body: {
          ...cached,
          // The photo's type confidence — a name match is not certainty.
          confidence: typeConfidence,
          videos,
          identification_id: identificationId,
          fromCache: true,
          alternates: legacyAlternates(observation, catalogResult.assessment, legacyRows, legacyMatch.id),
          catalog_match,
        },
      };
    }
  }

  // ── No library match: full AI identification for instructions ──────────
  console.log("[identify] no library match for", observation.equipment_type, "— calling full AI identification");
  const identification = await deps.identify(request.image);
  if (
    !identification?.name ||
    /unknown|not (gym )?equipment|unable to identify/i.test(identification.name) ||
    identification.confidence < 0.55
  ) {
    return { status: 422, body: { error: UNCLEAR_PHOTO_ERROR } };
  }

  const videos = await deps.videos(identification.search_query);
  const equipment = listUnavailable ? null : await deps.legacy.save(identification, legacyRows);
  const confidence = Math.min(typeConfidence, clampConfidence(identification.confidence));

  if (!equipment) {
    if (!request.saveRetry) return { status: 502, body: { error: SAVE_FAILED_ERROR } };
    return {
      status: 200,
      body: {
        ...identification,
        confidence,
        id: null,
        videos,
        identification_id: null,
        fromCache: false,
        alternates: [],
        save_failed: true,
        save_token: deps.rememberPendingSave(identification, videos, request.userId),
        catalog_match,
      },
    };
  }

  await deps.legacy.saveVideos(equipment.id, videos);
  const identificationId = await deps.legacy.recordIdentification(
    equipment.id,
    identification.name,
    identification as unknown as object,
    request.userId
  );

  return {
    status: 200,
    body: {
      ...identification,
      confidence,
      id: equipment.id,
      videos,
      identification_id: identificationId,
      fromCache: false,
      alternates: legacyAlternates(observation, catalogResult.assessment, legacyRows, equipment.id),
      catalog_match,
    },
  };
}
