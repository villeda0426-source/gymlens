// Read-only access to the Supabase equipment knowledge catalog
// (docs/equipment-catalog.md): the type and manufacturer vocabularies, and
// candidate retrieval through public.search_equipment_catalog. Never writes
// to the catalog — AI output is not curated data.
//
// search_equipment_catalog's p_query is a websearch tsquery: every word must
// match, so "seated chest press machine" finds nothing. Retrieval therefore
// filters by resolved type/manufacturer slugs and looks up printed model
// codes one at a time, rather than passing the photo description as text.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogItem, CatalogManufacturer, CatalogType } from "./equipmentMatching";

const VOCABULARY_TTL_MS = 10 * 60 * 1000;
const CATALOG_TIMEOUT_MS = 6000;

export interface CatalogVocabulary {
  types: CatalogType[];
  manufacturers: CatalogManufacturer[];
}

export interface CatalogRetrievalRequest {
  typeSlugs: string[];
  manufacturerSlug: string | null;
  labelCodes: string[];
  gymSlug?: string | null;
}

export interface CatalogRetrieval {
  items: CatalogItem[];
  gymListedIds: Set<string>;
}

export interface EquipmentCatalog {
  vocabulary(): Promise<CatalogVocabulary>;
  retrieve(request: CatalogRetrievalRequest): Promise<CatalogRetrieval>;
}

function withTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), CATALOG_TIMEOUT_MS)),
  ]);
}

type RpcParams = {
  p_query?: string;
  p_type_slug?: string;
  p_manufacturer_slug?: string;
  p_gym_slug?: string;
  p_limit?: number;
};

export function createSupabaseEquipmentCatalog(supabase: SupabaseClient): EquipmentCatalog {
  let cached: { at: number; value: CatalogVocabulary } | null = null;

  const search = async (params: RpcParams): Promise<CatalogItem[]> => {
    const { data, error } = await withTimeout(
      supabase.rpc("search_equipment_catalog", { p_limit: 25, ...params }),
      "Catalog search"
    );
    if (error) throw new Error(`Catalog search failed: ${error.message}`);
    return (data ?? []) as CatalogItem[];
  };

  return {
    async vocabulary() {
      if (cached && Date.now() - cached.at < VOCABULARY_TTL_MS) return cached.value;
      const [types, manufacturers] = await Promise.all([
        withTimeout(
          supabase.from("equipment_catalog_types").select("slug, name, name_es, category, aliases, primary_muscles"),
          "Catalog types"
        ),
        withTimeout(supabase.from("equipment_catalog_manufacturers").select("slug, name, aliases"), "Catalog manufacturers"),
      ]);
      if (types.error) throw new Error(`Catalog types failed: ${types.error.message}`);
      if (manufacturers.error) throw new Error(`Catalog manufacturers failed: ${manufacturers.error.message}`);
      const value = {
        types: (types.data ?? []) as CatalogType[],
        manufacturers: (manufacturers.data ?? []) as CatalogManufacturer[],
      };
      cached = { at: Date.now(), value };
      return value;
    },

    async retrieve({ typeSlugs, manufacturerSlug, labelCodes, gymSlug }) {
      const calls: Array<Promise<CatalogItem[]>> = [];
      for (const typeSlug of typeSlugs.slice(0, 3)) calls.push(search({ p_type_slug: typeSlug }));
      // A printed code can name an entry even when the type wasn't resolved.
      for (const code of labelCodes.slice(0, 3)) calls.push(search({ p_query: code, p_limit: 10 }));
      if (manufacturerSlug && typeSlugs.length === 0) calls.push(search({ p_manufacturer_slug: manufacturerSlug }));

      const results = await Promise.all(calls);
      const seen = new Set<string>();
      const items: CatalogItem[] = [];
      // Interleave label lookups first: an exact printed code is the most
      // relevant text match there is.
      const ordered = [...results.slice(typeSlugs.slice(0, 3).length), ...results.slice(0, typeSlugs.slice(0, 3).length)];
      for (const result of ordered) {
        for (const item of result) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          items.push(item);
        }
      }

      let gymListedIds = new Set<string>();
      if (gymSlug && typeSlugs.length > 0) {
        try {
          const listed = await Promise.all(
            typeSlugs.slice(0, 3).map((typeSlug) => search({ p_type_slug: typeSlug, p_gym_slug: gymSlug }))
          );
          gymListedIds = new Set(listed.flat().map((item) => item.id));
        } catch {
          // Gym context is optional; identification works without it.
        }
      }
      return { items, gymListedIds };
    },
  };
}
