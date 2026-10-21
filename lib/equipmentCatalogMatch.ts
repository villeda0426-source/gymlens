// The `catalog_match` part of an /api/identify response
// (server/services/equipmentScanService.ts). Catalog ids here are
// equipment_catalog_items rows — never public.equipment ids, which stay in
// the result's own `id`.
export type CatalogIdentificationLevel = "model" | "series" | "manufacturer" | "type" | "none";

export interface CatalogCandidate {
  catalog_item_id: string;
  display_name: string;
  display_name_es: string;
  type_slug: string;
  manufacturer: string | null;
  model_identifier: string | null;
  series_name: string | null;
  identifier_specificity: "reported_model" | "reported_series" | "unspecified";
  // Catalog text-relevance order — not a probability.
  retrieval_rank: number;
  match_reasons: string[];
  evidence_count: number;
  has_verified_installation: boolean;
}

export interface CatalogMatch {
  status: "matched" | "no_candidates" | "unavailable";
  level: CatalogIdentificationLevel | null;
  type: { slug: string; name: string; name_es: string } | null;
  manufacturer: { slug: string; name: string } | null;
  item: CatalogCandidate | null;
  candidates: CatalogCandidate[];
  alternative_types: Array<{ slug: string; name: string; name_es: string }>;
  retake_hint: "show_full_machine" | "show_model_label" | null;
  notes: string[];
  photo: {
    type_confidence: number;
    label_legibility: "none" | "partial" | "clear";
    full_machine_visible: boolean;
    brand_text: string | null;
    model_text: string | null;
  };
  basis: { type: "photo"; manufacturer: "printed_label" | null; model: "printed_label" | null };
  reference_images_used: false;
}

export function parseCatalogMatch(value: unknown): CatalogMatch | null {
  if (!value || typeof value !== "object") return null;
  const match = value as CatalogMatch;
  return typeof match.status === "string" && Array.isArray(match.candidates) ? match : null;
}

// Catalog entries worth naming as "possible models": ones that actually name
// a manufacturer, series or model (a bare generic entry adds nothing).
export function possibleModels(match: CatalogMatch, max = 3): CatalogCandidate[] {
  if (match.level !== "type" && match.level !== "manufacturer") return [];
  return match.candidates
    .filter((candidate) => candidate.manufacturer || candidate.model_identifier || candidate.series_name)
    .slice(0, max);
}
