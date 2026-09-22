# SpotLift architecture

How the app, backend, database and third-party services connect. Derived from the code (`app/`, `store/`, `hooks/`, `lib/`, `server/`, `supabase/schema.sql`). Paste the Mermaid block into any Mermaid renderer, GitHub, Notion, or an artifact.

> **2026-09-21 update:** written before the main/origin-main reconciliation. Coach and equipment identification now run on **Claude** (`ANTHROPIC_API_KEY`, `claudeService.ts`, `lib/anthropic.ts`), not OpenAI — the diagram and table below still say OpenAI for those two paths. `POST /api/coach-trainer/evaluate` and `/reviews/latest` no longer exist; `lib/coachingEngine.ts` is unreferenced dead code. `POST /api/coach-trainer/jobs` now requires sign-in and an idempotency key. Workout search still uses OpenAI, and now has a Supabase cache (see `docs/coach-rules-router.md` and `workoutGuideCache.ts`). Treat the diagram as the client-side / data-model picture; verify anything AI-provider-specific against the code before relying on it.

```mermaid
flowchart LR
  subgraph PHONE["Expo app (app/, components/, store/, hooks/, lib/)"]
    direction TB
    subgraph SCREENS["Screens (Expo Router)"]
      AUTHUI["login / register"]
      HOME["Home"]
      COACH["Coach (trainer)"]
      PLAN["Plan"]
      SCAN["Scan"]
      PROFILE["Profile"]
      EQ["equipment/[id]"]
      WR["workout-result"]
      HIDDEN["search / saved / avatar<br/>(hidden tabs)"]
      FB["feedback modal"]
    end
    subgraph STATE["Zustand stores + hooks"]
      AUTHS["authStore"]
      COACHS["coachTrainerStore"]
      EQS["equipmentStore"]
      MUSCLE["muscleProgressStore"]
      GUIDE["workoutGuideStore"]
      LOGS["workoutLogStore"]
      HOOKS["useEquipmentIdentify / useEquipmentSearch<br/>useApiHealth"]
    end
    subgraph LIBS["Client libs"]
      APIFETCH["lib/api.ts apiFetch<br/>timeouts, GET retry, version headers"]
      CE["lib/coachingEngine.ts<br/>rules-first coaching (shared with server)"]
      CTLIB["lib/coachTrainer.ts"]
      SBCLIENT["lib/supabase.ts<br/>anon key + user JWT"]
      LOCAL["AsyncStorage<br/>language, guest saves, coach chat, log, guide"]
    end
  end

  subgraph SERVER["Express API on Railway (server/index.ts)"]
    direction TB
    MW["Middleware<br/>CORS, JSON 10mb, rate limit 120/window,<br/>min-build gate returns 426"]
    subgraph ROUTES["Routes"]
      R_IDENT["POST /api/identify"]
      R_SEARCH["GET /api/search"]
      R_EQ["GET /api/equipment/:id<br/>+ /weight-factor"]
      R_VID["GET /api/videos"]
      R_WS["POST /api/workout-search<br/>(+ legacy /workout-search)"]
      R_COACH["/api/coach-trainer<br/>POST /, /jobs, GET /jobs/:id,<br/>/jobs/:id/client-timing, /evaluate,<br/>GET /reviews/latest"]
      R_FB["POST /api/feedback, /feedback/email"]
      R_ACC["DELETE /api/account"]
      R_META["GET /health, /api/dependency-health,<br/>/api/app-version"]
    end
    subgraph SERVICES["Services"]
      S_OAI["openaiService<br/>structured JSON, usage log"]
      S_EQAI["equipmentAiService + lib/ai.ts"]
      S_YT["youtubeService + lib/youtube.ts"]
      S_COACH["coachTrainerService"]
    end
  end

  subgraph EXT["External services"]
    SBAUTH[("Supabase Auth")]
    SBDB[("Supabase Postgres<br/>tables below")]
    OPENAI["OpenAI API"]
    YT["YouTube Data API"]
    GMAIL["Gmail SMTP"]
    SENTRY["Sentry"]
    VEXO["Vexo analytics"]
  end

  subgraph TABLES["Postgres tables (supabase/schema.sql)"]
    T1["profiles"]
    T2["equipment, equipment_videos"]
    T3["equipment_identifications, saved_equipment"]
    T4["coach_trainer_jobs, workout_feedback"]
    T5["completed_exercises, muscle_progress,<br/>muscle_progress_history"]
    T6["feedback"]
    T7["ai_usage_events (metadata only)"]
  end

  %% screens -> state/hooks/libs
  AUTHUI --> AUTHS
  HOME --> GUIDE
  HOME --> COACHS
  COACH --> COACHS
  COACH --> CTLIB
  PLAN --> GUIDE
  PLAN --> MUSCLE
  PLAN --> CE
  SCAN --> HOOKS
  EQ --> EQS
  WR --> GUIDE
  WR --> LOGS
  HIDDEN --> HOOKS
  HIDDEN --> EQS
  PROFILE --> AUTHS
  FB --> APIFETCH
  CTLIB --> CE
  CTLIB --> APIFETCH
  HOOKS --> APIFETCH
  HOME --> APIFETCH
  EQ --> APIFETCH
  AUTHS --> APIFETCH
  STATE -.persist.-> LOCAL

  %% client -> supabase directly (RLS, anon key)
  AUTHS --> SBCLIENT
  EQS --> SBCLIENT
  MUSCLE --> SBCLIENT
  HIDDEN --> SBCLIENT
  SBCLIENT --> SBAUTH
  SBCLIENT -->|"RLS"| SBDB

  %% client -> API
  APIFETCH ==>|"HTTPS + Bearer JWT<br/>x-spotlift-platform/version/build"| MW
  MW --> ROUTES

  %% routes -> services
  R_IDENT --> S_EQAI
  R_IDENT --> S_YT
  R_EQ --> S_OAI
  R_WS --> S_OAI
  R_COACH --> S_COACH
  R_COACH --> CE
  R_VID --> S_YT
  S_EQAI --> S_OAI
  S_COACH --> S_OAI

  %% services -> external
  S_OAI --> OPENAI
  S_YT --> YT
  R_FB --> GMAIL
  R_IDENT -.verify JWT.-> SBAUTH
  R_COACH -.verify JWT.-> SBAUTH
  R_ACC -.verify + admin delete.-> SBAUTH

  %% server -> db (service role bypasses RLS)
  ROUTES -->|"service-role key<br/>(ownership checked in code)"| SBDB
  S_OAI -.usage log.-> T7
  SBDB --- TABLES

  %% telemetry
  PHONE -.-> SENTRY
  PHONE -.-> VEXO
```

## Who calls which API

| Endpoint | Called by (client) | Server verifies user? | Touches |
|---|---|---|---|
| `POST /api/identify` | `useEquipmentIdentify` (Scan tab) | Yes (`auth.getUser`) | OpenAI vision, YouTube, `equipment`, `equipment_identifications`, `equipment_videos` |
| `GET /api/search` | `useEquipmentSearch` (search screen) | No | `equipment` |
| `GET /api/equipment/:id` (+`/weight-factor`) | `equipment/[id]` | No | `equipment`, `equipment_videos`, OpenAI |
| `GET /api/videos` | (no client caller found) | No | `equipment_videos`, YouTube |
| `POST /api/workout-search` | Home tab | No | OpenAI |
| `POST /api/coach-trainer` and `/jobs` | Coach tab via `lib/coachTrainer.ts` | Yes | OpenAI, rules engine, `coach_trainer_jobs` |
| `GET /api/coach-trainer/jobs/:id` | Coach tab (polling) | Yes | `coach_trainer_jobs` |
| `POST /api/coach-trainer/jobs/:id/client-timing` | `lib/coachTrainer.ts` | Yes | `coach_trainer_jobs` |
| `POST /api/coach-trainer/evaluate` | workout feedback modal | Yes | OpenAI, `workout_feedback` |
| `GET /api/coach-trainer/reviews/latest` | Plan/Coach | Yes | `workout_feedback` |
| `POST /api/feedback`, `/feedback/email` | feedback modal, `FeedbackContext` | No | `feedback`, Gmail |
| `DELETE /api/account` | `authStore` (delete account) | Yes | Supabase admin delete, `profiles` |
| `GET /api/app-version` | `ForceUpdateGate` | No | env-based version policy |
| `GET /health`, `/api/dependency-health` | monitoring / `ServiceHealthMonitor` | No | Supabase `equipment` probe |

## Data the client reads/writes directly in Supabase (RLS)

`profiles` (authStore, LanguageToggle), `saved_equipment` (equipmentStore, saved screen), `equipment_identifications` (search screen), `muscle_progress` + `completed_exercises` + RPC (muscleProgressStore), `feedback` (FeedbackContext), plus all `supabase.auth.*` sign-in / sign-up / session calls.

## Local-only data (AsyncStorage)

Language, guest use count and guest saves, Coach chat state, workout log, workout guide, avatar style.

## Environment variables by owner

- **Server only (Railway):** `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `YOUTUBE_API_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, OpenAI model and coach-timeout settings, version-policy vars.
- **Public in the app (`EXPO_PUBLIC_*`):** `API_BASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SENTRY_DSN`, `VEXO_API_KEY`.

## What creates the API vs what uses it

- **Creates:** `server/index.ts` mounts routers from `server/routes/*`, which call `server/services/*` and shared `lib/ai.ts`, `lib/youtube.ts`, `lib/coachingEngine.ts`. Built with `tsc -p server/tsconfig.json` to `dist-server/`, run by Railway.
- **Uses:** every client call goes through `lib/api.ts` `apiFetch`, except direct Supabase calls in the stores and screens.

## Things worth checking

- `workout-search`, `equipment/:id`, `search`, `videos` and `feedback` routes show no server-side user verification, only the per-IP rate limit. `workout-search` and `equipment/:id/weight-factor` spend OpenAI budget. Hypothesis: confirm intent.
- `GET /api/videos` has no client caller.
