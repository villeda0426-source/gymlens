# Supabase equipment knowledge catalog

Built and verified October 20, 2026, in SpotLift's existing Supabase project.

[Open the Supabase project](https://supabase.com/dashboard/project/oododetbegvhnhmwfgoq/editor).

## Delivered data

| Data | Count |
|---|---:|
| Catalog entries | 315 |
| Entries enabled as potential identification candidates | 294 |
| Equipment types with English/Spanish names, aliases and generic visual cues | 98 |
| Manufacturer labels | 35 |
| Original research evidence records | 365 |
| Sources and research leads | 19 |
| Gym/facility records | 8 |
| Approved visual reference images | 0 |

Entries may represent an exact reported identifier, a series, or an unspecified model. They are potential matches, not 315 visually verified models. Storage, recovery and unresolved categories are retained but excluded from default identification searches. Type-level muscle and visual metadata is curated separately from manufacturer facts.

## Structure

- `equipment_catalog_types`: canonical equipment categories, English/Spanish names, aliases, primary muscles and generic visual cues.
- `equipment_catalog_manufacturers`: normalized manufacturer labels with original aliases. An unresolved source label is not silently assigned to another company.
- `equipment_catalog_items`: type/manufacturer/model or series candidates, resistance labels and reference-readiness status.
- `equipment_catalog_sources`: source URLs, dates, document locators and access status. Research leads are distinguished from extracted inventories.
- `equipment_catalog_gyms`: facility context, including a separate Wilkinson facility for Princeton.
- `equipment_catalog_evidence`: all 365 original records, linked to catalog items and gyms, including quantities, units, zones, drawing codes, flags and original record payloads.
- `equipment_catalog_media`: ready for approved reference images, model-label photos, diagrams and manuals. It starts empty.
- `equipment_catalog_imports`: seed provenance and checksum.
- `equipment_catalog_search`: an RLS-respecting, read-only view joining useful catalog fields.
- `search_equipment_catalog`: a read-only RPC with filters and text relevance ordering.

The source assertions are retained even where several descriptions map to a shared candidate. A zero quantity means the item was not planned in that source, while null means quantity unknown. Gym filtering excludes zero-quantity evidence. No evidence is marked as a verified current installation. Published quantities from plans remain planned, not current availability.

## Query from the app

Use the existing Supabase client with its publishable/anon key and optional user session. Never ship a service-role key or database password to the app.

```typescript
const { data, error } = await supabase.rpc('search_equipment_catalog', {
  p_query: 'leg press',
  p_manufacturer_slug: 'matrix',
  p_category: 'machine',
  p_limit: 20,
});
if (error) throw error;
```

Supported optional parameters:

| Parameter | Example |
|---|---|
| `p_query` | `smith`, `CLST`, `cinta de correr` |
| `p_category` | `machine`, `cardio`, `cable`, `free_weight`, `accessory`, `bodyweight` |
| `p_manufacturer_slug` | `matrix`, `life-fitness`, `hammer-strength` |
| `p_type_slug` | `leg-press`, `smith-machine`, `treadmill` |
| `p_muscle` | `chest`, `back`, `quads`, `glutes` |
| `p_resistance` | `plate_loaded`, `weight_stack`, `cable`, `bodyweight`, `free_weight`, `air`, `pneumatic` |
| `p_gym_slug` | `planet-fitness-centreville-va`, `la-fitness-broadview-il` |
| `p_include_non_training` | `true` to include storage, recovery and unresolved research entries |
| `p_limit` | 1-100; default 25 |

Pass null or omit a filter to leave it unconstrained. Results include `evidence_count`, `has_verified_installation`, `identifier_specificity`, `visual_verification_status` and `approved_visual_reference_count`. Those fields distinguish useful leads from confirmed facts.

```sql
-- SQL Editor example:
select * from public.search_equipment_catalog(
  p_query => 'smith',
  p_manufacturer_slug => 'life-fitness'
);

-- Inspect the evidence behind one candidate:
select g.name, e.zone, e.quantity, e.quantity_unit,
       e.availability_status, e.current_installation_verified,
       s.url, e.source_locator, e.quality_flags
from public.equipment_catalog_evidence e
join public.equipment_catalog_gyms g on g.id=e.gym_id
join public.equipment_catalog_sources s on s.source_key=e.source_key
where e.catalog_item_id = '<candidate UUID>'::uuid;
```

## Identification flow

1. Extract the likely equipment type and any visible brand/model text from the user's photo.
2. Search this catalog for compatible candidates. The gym filter supplies research context; it is not proof that an item is installed.
3. Compare visual features and model-label text. If the model remains unclear, return the generic equipment type with alternatives rather than force a model match.
4. Keep actual photo-identification confidence separate from text-search relevance. A catalog/name match must not imply 100% visual confidence.
5. Add licensed, owned or permission-cleared reference photos. A shared reference becomes usable for identification only after approval and rights checks.

This change does not train or fine-tune a vision model. It provides a searchable knowledge base that an identification service can retrieve from. No image embeddings or verified reference photographs were manufactured or backfilled.

## App compatibility

The existing `public.equipment` table contains 78 entries and was preserved, including a before/after content fingerprint check. It still holds the app's tutorials, videos, saves and history; `equipment_id` everywhere keeps referencing it.

The scan route (`POST /api/identify`) now retrieves from this catalog, read-only:

1. `observeEquipment` (`server/services/equipmentAiService.ts`) describes the photo: generic type, alternative types, type confidence, resistance, and only brand/model text that is legibly printed.
2. `server/services/equipmentMatching.ts` maps that to catalog types (English, Spanish, accents, aliases, plus a small app-side synonym list) and manufacturers, and `server/services/equipmentCatalogService.ts` retrieves candidates through `search_equipment_catalog` by type slug, manufacturer slug and individual printed codes (the RPC's text query requires every word, so photo descriptions are never passed through as free text).
3. `assessCatalogMatch` decides the level: `model`/`series` only from a printed label that agrees with the photographed type (and with a printed brand, if any); otherwise `manufacturer`, `type`, or `none` ("none of these"). Gym listings only reorder candidates of the photographed type.
4. The response keeps its existing shape (`id` = `public.equipment`, `confidence`, `alternates`, save/retry fields) and adds `catalog_match`. `confidence` is the photo's type confidence — a name match in `public.equipment` no longer reports 1.0 — and candidate `retrieval_rank` is text relevance, never a probability. Catalog ids appear only inside `catalog_match`.
5. A catalog outage returns `catalog_match.status = "unavailable"`; the scan still completes.

Nothing in the scan flow writes to the catalog tables. New `public.equipment` rows are still created for types the app has no tutorials for; an existing row with the same name is reused, never overwritten.

Tests: `npm run test:server` (mocked AI/catalog/database). Read-only live catalog check: `CATALOG_LIVE=1 TS_NODE_PROJECT=server/tsconfig.json node --env-file=.env --require ts-node/register --test server/__tests__/equipmentCatalog.live.test.ts`.

## Security and verification

All eight new tables have RLS enabled. Anonymous and authenticated clients can read the shared catalog but cannot insert, update or delete. Server-side privileged access is required for curation. The view and RPC run with caller privileges; no security-definer function was added.

Checks passed for schema/import in a rollback-only transaction, committed row counts, preserved source data, null/zero quantities, repeated-seed idempotency, model and Spanish text searches, manufacturer/category/muscle/resistance/gym filters, guest reads, reads for two simulated authenticated subjects, and actual denied insert/update/delete attempts. The exported literal SQL seed was also rerun inside a transaction and rolled back. Live anonymous REST and RPC requests passed after commit.

Supabase security/performance advisors reported no warnings or errors on the new catalog objects at WARN threshold. Fourteen findings on unrelated existing objects remain: RLS initialization-plan performance warnings, mutable function search paths and multiple permissive policies. Those objects were not changed.

## Reproduction and change record

Repository: `/Users/villedajr/SpotLift`, branch `release/next`, starting HEAD `406cdcc679eaf20b8a51617ac1a3973ab731f643`. The checkout was clean at the start. Task-created migration, seed and this documentation are uncommitted.

Schema migration: `supabase/migrations/20261021015528_equipment_knowledge_catalog.sql`.

Data seed: `supabase/seeds/equipment_catalog_research_v1.sql`.

Migration version `20261021015528` is recorded in the remote Supabase migration history. The version was generated by the Supabase CLI in UTC; the user-facing work date is October 20 in America/Chicago.

Apply the schema migration to a new environment, then execute the separate seed. The seed uses deterministic IDs and conflict handling to preserve existing curated records on reruns. It does not overwrite later human edits. Backfill/enrichment updates should be reviewed and applied explicitly rather than deleting and recreating the catalog.
