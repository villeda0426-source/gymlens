// Pure matching between what a photo shows (EquipmentObservation) and the
// Supabase equipment knowledge catalog (docs/equipment-catalog.md). No I/O
// here, so every rule is testable with plain data.
//
// Ground rules, from the catalog contract:
// - The catalog has no approved reference images, so a machine's look can
//   establish its generic TYPE, never its exact model. An exact model or
//   series is only claimed from label text actually printed in the photo,
//   and only when that label agrees with what the photo shows.
// - Catalog search ranking is text relevance, never photo confidence. The
//   two are reported separately.
// - Gym evidence (permit drawings, operator inventories) only reorders
//   candidates of the type the photo already shows; it never changes the
//   type and never confirms that something is installed.
import type { EquipmentObservation } from "../../lib/ai";

export interface CatalogType {
  slug: string;
  name: string;
  name_es: string;
  category: string;
  aliases: string[];
  primary_muscles: string[];
}

export interface CatalogManufacturer {
  slug: string;
  name: string;
  aliases: string[];
}

// One row of public.search_equipment_catalog (the equipment_catalog_search view).
export interface CatalogItem {
  id: string;
  slug: string;
  display_name: string;
  display_name_es: string;
  type_slug: string;
  type_name: string;
  type_name_es: string;
  category: string;
  manufacturer_slug: string | null;
  manufacturer: string | null;
  model_identifier: string | null;
  series_name: string | null;
  identifier_specificity: "reported_model" | "reported_series" | "unspecified";
  aliases: string[];
  resistance_types: string[];
  evidence_count: number;
  has_verified_installation: boolean;
  approved_visual_reference_count: number;
}

export type IdentificationLevel = "model" | "series" | "manufacturer" | "type" | "none";

export type MatchReason =
  | "photo_type"
  | "alternative_type"
  | "label_model"
  | "label_series"
  | "label_brand"
  | "resistance"
  | "gym_source_listing";

export interface ScoredCandidate {
  catalog_item_id: string;
  display_name: string;
  display_name_es: string;
  type_slug: string;
  manufacturer: string | null;
  model_identifier: string | null;
  series_name: string | null;
  identifier_specificity: CatalogItem["identifier_specificity"];
  // Order from the catalog search (1 = most relevant text match). A
  // retrieval position, not a probability that this is the photographed item.
  retrieval_rank: number;
  match_reasons: MatchReason[];
  evidence_count: number;
  // Always as stored: no source in the seed is a verified installation.
  has_verified_installation: boolean;
}

export type RetakeHint = "show_full_machine" | "show_model_label" | null;

export interface CatalogAssessment {
  level: IdentificationLevel;
  type: { slug: string; name: string; name_es: string } | null;
  manufacturer: { slug: string; name: string } | null;
  item: ScoredCandidate | null;
  // Plausible catalog entries for the photographed type, best first. Empty
  // means "none of these" — the catalog has nothing compatible.
  candidates: ScoredCandidate[];
  alternative_types: Array<{ slug: string; name: string; name_es: string }>;
  retake_hint: RetakeHint;
  notes: string[];
}

// ─── Text normalization ──────────────────────────────────────────────────────

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// "HS-CP", "hs cp" and "HSCP" are the same printed code.
export function compactCode(value: string): string {
  return normalizeText(value).replace(/\s+/g, "");
}

const STOP_WORDS = new Set(["machine", "maquina", "de", "the", "a", "para", "con", "with", "station", "estacion", "equipment", "gym"]);

function tokens(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token && !STOP_WORDS.has(token))
    .map((token) => (token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token));
}

// How well a photo phrase names a catalog type: 1 = exact name/alias, then
// token overlap. Accents, case, plurals and "machine" are ignored.
function phraseScore(phrase: string, names: string[]): number {
  const target = tokens(phrase);
  if (target.length === 0) return 0;
  let best = 0;
  for (const name of names) {
    const candidate = tokens(name);
    if (candidate.length === 0) continue;
    if (candidate.join(" ") === target.join(" ")) return 1;
    const shared = target.filter((token) => candidate.includes(token)).length;
    const score = shared / Math.max(target.length, candidate.length);
    // Every word of the catalog name appears in the photo phrase
    // ("seated chest press" vs "chest press"): a strong, but not exact, match.
    const contained = shared === candidate.length ? Math.max(score, 0.85) : score;
    best = Math.max(best, contained);
  }
  return best;
}

export function typeNames(type: CatalogType): string[] {
  return [type.name, type.name_es, type.slug.replace(/-/g, " "), ...type.aliases];
}

export interface TypeMatch {
  type: CatalogType;
  score: number;
  source: "primary" | "alternative";
}

const TYPE_MATCH_THRESHOLD = 0.67;

// Everyday phrasings that the curated catalog names differently. Kept here,
// app-side, rather than written into the catalog's own aliases.
const PHRASE_SYNONYMS: Array<[RegExp, string]> = [
  [/\b(stationary|exercise|upright) (bike|cycle)\b/i, "upright exercise bike"],
  [/\bbicicleta (estatica|fija)\b/i, "upright exercise bike"],
  [/\bcable (cross ?over|crossover machine|station)\b/i, "cable functional trainer"],
  [/\bassisted (pull ?ups?|chin ?ups?|dips?)\b/i, "assisted chin dip machine"],
  [/\b(chest press|bench press) machine\b/i, "chest press machine"],
  [/\bseated (cable )?row\b/i, "row machine"],
];

function withSynonyms(phrase: string): string[] {
  const plain = normalizeText(phrase);
  const extra = PHRASE_SYNONYMS.filter(([pattern]) => pattern.test(plain)).map(([, name]) => name);
  return [phrase, ...extra];
}

// The catalog types the photo's description points to, best first.
export function resolveTypes(observation: EquipmentObservation, types: CatalogType[]): TypeMatch[] {
  const matches: TypeMatch[] = [];
  const consider = (phrases: string[], source: TypeMatch["source"]) => {
    let best: TypeMatch | null = null;
    for (const type of types) {
      const score = Math.max(...phrases.flatMap(withSynonyms).map((phrase) => phraseScore(phrase, typeNames(type))));
      if (score >= TYPE_MATCH_THRESHOLD && (!best || score > best.score)) best = { type, score, source };
    }
    if (best && !matches.some((match) => match.type.slug === best!.type.slug)) matches.push(best);
  };
  // The English type decides; the Spanish name only helps when English
  // matches nothing (so a loose translation can't override it).
  consider([observation.equipment_type].filter(Boolean), "primary");
  if (matches.length === 0) consider([observation.equipment_type_es].filter(Boolean), "primary");
  for (const alternative of observation.alternative_types.slice(0, 3)) consider([alternative], "alternative");
  return matches;
}

export function resolveManufacturer(
  brandText: string | null,
  manufacturers: CatalogManufacturer[]
): CatalogManufacturer | null {
  if (!brandText?.trim()) return null;
  const printed = compactCode(brandText);
  if (printed.length < 2) return null;
  for (const manufacturer of manufacturers) {
    // Unresolved research labels are never assigned from a photo.
    if (manufacturer.slug.includes("unresolved")) continue;
    const names = [manufacturer.name, manufacturer.slug.replace(/-/g, " "), ...manufacturer.aliases].map(compactCode);
    if (names.some((name) => name.length >= 2 && (printed === name || printed.includes(name) || (printed.length >= 4 && name.includes(printed))))) {
      return manufacturer;
    }
  }
  return null;
}

// Printed codes worth looking up: anything with a digit or a hyphen, plus
// whole short phrases from a model plate ("SUNRISE 480", "HS-CP").
export function labelCodes(observation: EquipmentObservation): string[] {
  const texts = [observation.model_text, ...observation.other_label_text].filter((text): text is string => !!text?.trim());
  const codes = new Set<string>();
  for (const text of texts) {
    const whole = text.trim();
    if (whole.length <= 24) codes.add(whole);
    for (const piece of whole.split(/[\s,/|]+/)) {
      if (piece.length >= 2 && /[0-9-]/.test(piece)) codes.add(piece);
    }
  }
  return [...codes].slice(0, 6);
}

// Whether printed text names this catalog entry's model or series.
function labelMatches(identifier: string | null, printed: string[]): boolean {
  if (!identifier) return false;
  const code = compactCode(identifier);
  if (code.length < 2) return false;
  return printed.some((text) => {
    const compact = compactCode(text);
    // Short codes ("340") must match exactly; longer ones may sit inside a
    // longer printed string ("HS-CP ISO-LATERAL").
    return compact === code || (code.length >= 4 && compact.includes(code));
  });
}

// ─── Assessment ──────────────────────────────────────────────────────────────

const RETAKE_CONFIDENCE = 0.6;
const MAX_CANDIDATES = 5;

export function assessCatalogMatch(args: {
  observation: EquipmentObservation;
  typeMatches: TypeMatch[];
  manufacturer: CatalogManufacturer | null;
  // Retrieval results in catalog relevance order (deduped by the caller).
  retrieved: CatalogItem[];
  // Catalog item ids that a gym's source documents list (optional context).
  gymListedIds?: Set<string>;
}): CatalogAssessment {
  const { observation, typeMatches, manufacturer, retrieved, gymListedIds } = args;
  const notes: string[] = [];
  const primary = typeMatches.find((match) => match.source === "primary") ?? null;
  const compatibleTypes = new Set(typeMatches.map((match) => match.type.slug));
  const printed = [observation.model_text, ...observation.other_label_text].filter((text): text is string => !!text?.trim());

  const scored = retrieved.map((item, index): ScoredCandidate & { score: number } => {
    const reasons: MatchReason[] = [];
    let score = 0;
    if (primary && item.type_slug === primary.type.slug) {
      reasons.push("photo_type");
      score += 40;
    } else if (compatibleTypes.has(item.type_slug)) {
      reasons.push("alternative_type");
      score += 20;
    }
    if (labelMatches(item.model_identifier, printed)) {
      reasons.push("label_model");
      score += 50;
    } else if (labelMatches(item.series_name, printed)) {
      reasons.push("label_series");
      score += 30;
    }
    if (manufacturer && item.manufacturer_slug === manufacturer.slug) {
      reasons.push("label_brand");
      score += 25;
    } else if (manufacturer && item.manufacturer_slug && item.manufacturer_slug !== manufacturer.slug) {
      // The printed brand contradicts this entry.
      score -= 40;
    }
    if (observation.resistance !== "unknown" && observation.resistance !== "none" && item.resistance_types.includes(observation.resistance)) {
      reasons.push("resistance");
      score += 5;
    } else if (
      observation.resistance !== "unknown" &&
      observation.resistance !== "none" &&
      item.resistance_types.length > 0 &&
      !item.resistance_types.includes(observation.resistance)
    ) {
      score -= 10;
    }
    // Gym listings only break ties between entries the photo already supports.
    if (gymListedIds?.has(item.id) && reasons.some((reason) => reason === "photo_type" || reason === "alternative_type")) {
      reasons.push("gym_source_listing");
      score += 3;
    }
    return {
      catalog_item_id: item.id,
      display_name: item.display_name,
      display_name_es: item.display_name_es,
      type_slug: item.type_slug,
      manufacturer: item.manufacturer,
      model_identifier: item.model_identifier,
      series_name: item.series_name,
      identifier_specificity: item.identifier_specificity,
      retrieval_rank: index + 1,
      match_reasons: reasons,
      evidence_count: item.evidence_count,
      has_verified_installation: item.has_verified_installation,
      score,
    };
  });

  // Only entries the photo is compatible with are candidates. A label match
  // on a different type is reported in notes, never offered as the answer.
  const compatible = scored.filter((candidate) => compatibleTypes.has(candidate.type_slug) && candidate.score > 0);
  const contradicting = scored.filter(
    (candidate) => !compatibleTypes.has(candidate.type_slug) && candidate.match_reasons.includes("label_model")
  );
  if (contradicting.length > 0 && typeMatches.length > 0) notes.push("label_matches_other_type");

  compatible.sort((a, b) => b.score - a.score || a.retrieval_rank - b.retrieval_rank);
  const candidates = compatible.slice(0, MAX_CANDIDATES).map(({ score: _score, ...candidate }) => candidate);

  // Exact model/series only from a printed label, and only when exactly one
  // compatible entry carries it (two brands sharing a code stays ambiguous
  // unless the printed brand settles it).
  const labelHits = (reason: MatchReason) =>
    compatible.filter(
      (candidate) =>
        candidate.match_reasons.includes(reason) &&
        (!manufacturer || candidate.match_reasons.includes("label_brand"))
    );
  const modelHits = labelHits("label_model");
  const seriesHits = labelHits("label_series");

  let level: IdentificationLevel = "none";
  let item: ScoredCandidate | null = null;
  if (modelHits.length === 1) {
    level = "model";
    item = candidates.find((candidate) => candidate.catalog_item_id === modelHits[0].catalog_item_id) ?? null;
  } else if (seriesHits.length === 1 && modelHits.length === 0) {
    level = "series";
    item = candidates.find((candidate) => candidate.catalog_item_id === seriesHits[0].catalog_item_id) ?? null;
  } else if (manufacturer && primary) {
    level = "manufacturer";
  } else if (primary) {
    level = "type";
  }
  if (modelHits.length > 1 || seriesHits.length > 1) notes.push("label_matches_several_entries");

  // The type the photo shows; for a model/series match, the type of that entry.
  const shownType = item ? typeMatches.find((match) => match.type.slug === item!.type_slug)?.type : primary?.type;

  let retake_hint: RetakeHint = null;
  if (observation.type_confidence < RETAKE_CONFIDENCE) {
    retake_hint = observation.full_machine_visible ? "show_model_label" : "show_full_machine";
  } else if ((level === "type" || level === "manufacturer") && candidates.length > 1 && observation.label_legibility !== "clear") {
    // Several catalog models fit and no label settled it.
    retake_hint = "show_model_label";
  }

  return {
    level,
    type: shownType ? { slug: shownType.slug, name: shownType.name, name_es: shownType.name_es } : null,
    manufacturer: manufacturer ? { slug: manufacturer.slug, name: manufacturer.name } : null,
    item,
    candidates,
    alternative_types: typeMatches
      .filter((match) => match.type.slug !== shownType?.slug)
      .map((match) => ({ slug: match.type.slug, name: match.type.name, name_es: match.type.name_es })),
    retake_hint,
    notes,
  };
}
