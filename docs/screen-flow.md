# SpotLift screen flow

Derived from `app/` (Expo Router) plus every `router.push/replace/back` call. Solid arrows = real navigation calls. Dashed = implicit (system/deep link/tab bar). Red nodes = routes that exist but nothing navigates to.

```mermaid
flowchart TD
  START([App launch]) --> ROOT["_layout.tsx<br/>ForceUpdateGate + AuthGate"]
  ROOT -->|"no user & not in (auth)<br/>replace"| LOGIN
  ROOT -->|"user & in (auth)<br/>replace"| HOME

  subgraph AUTH["(auth)"]
    LOGIN["login"]
    REGISTER["register"]
  end
  LOGIN -->|"sign-in ok: replace"| HOME
  LOGIN <-->|"link"| REGISTER
  REGISTER -->|"signup ok: replace"| LOGIN

  DEEP(["Deep link<br/>spotlift:// or coachlift://auth/callback"]) -.-> CB["auth/callback<br/>spinner only; session handled in _layout"]
  CB -.->|"session set → AuthGate"| HOME

  subgraph TABS["(tabs) — visible tab bar"]
    HOME["index (Home)"]
    TRAINER["trainer (Coach)"]
    PLAN["plan"]
    SCAN["scan"]
    PROFILE["profile"]
  end
  HOME -.-|"tab bar"| TRAINER
  TRAINER -.-|"tab bar"| PLAN
  PLAN -.-|"tab bar"| SCAN
  SCAN -.-|"tab bar"| PROFILE

  %% cross-tab jumps
  HOME -->|"hero stat / secondary action"| PLAN
  HOME -->|"hero stat / primary action"| TRAINER
  HOME -->|"scan CTA"| SCAN
  HOME -->|"profile CTA"| PROFILE
  TRAINER -->|"header / resend button"| PLAN
  PLAN -->|"empty-state CTA / line 1062"| TRAINER
  TRAINER -->|"guest: sign in"| LOGIN
  PLAN -->|"guest: sign up"| REGISTER
  PROFILE -->|"guest"| REGISTER
  PROFILE -->|"guest"| LOGIN
  SCAN -->|"guest prompt: sign up"| REGISTER

  %% leaf screens (stack, above tabs)
  EQ["equipment/[id]<br/>card"]
  WR["equipment/workout-result"]
  SCAN -->|"scan result: /equipment/id"| EQ
  EQ -->|"back"| SCAN
  HOME -->|"workout search result"| WR
  PLAN -->|"open workout (x2)"| WR
  WR -->|"back"| HOME

  %% hidden tabs
  SEARCH["search (href:null)"]
  SAVED["saved (href:null)"]
  AVATAR["avatar (href:null)"]
  FEEDBACK["feedback<br/>modal"]
  SEARCH -->|"cards"| EQ
  SAVED -->|"cards"| EQ
  SEARCH --> SCAN
  SEARCH --> HOME
  SAVED --> HOME
  SAVED --> LOGIN
  FEEDBACK -->|"back"| X([dismiss])
  FBB["FeedbackBanner component<br/>(never rendered)"] -.->|"would push /feedback"| FEEDBACK

  classDef orphan fill:#fee,stroke:#c33,stroke-width:2px;
  class SEARCH,SAVED,AVATAR,FEEDBACK,FBB orphan;
```

## Oddities

1. **`search`, `saved`, `avatar` are orphaned.** They are hidden tabs (`href: null`) and no `router.push`, `<Link>` or `href` anywhere points to `/search`, `/saved` or `/avatar`. Users cannot reach them. They only navigate outward (to scan, home, login, `equipment/[id]`).
2. **`feedback` modal is unreachable.** Its only caller is `components/UI/FeedbackBanner.tsx`, and nothing renders `FeedbackBanner`. So `equipment/[id]` is only reachable via scan or the orphaned search/saved screens (`EquipmentCard`).
3. **`auth/callback` is a spinner.** The deep link is processed by `handleAuthRedirectUrl` in `_layout.tsx`; the screen never navigates itself. `AuthGate` only redirects if the user is currently in `(auth)`. If the app is opened via the link while on `auth/callback`, a signed-in user is not moved off that screen.
4. **`equipment/workout-result` is not declared in the root `Stack`** (only `equipment/[id]` and `feedback` are). It still works through file routing, with default options.
5. **`router.push("/(tabs)")` in `saved`/`search`** pushes instead of switching tabs, which can stack duplicates of the tabs group.
6. **Guests are forced to login.** `AuthGate` redirects every unauthenticated user to login, so the "guest" sign-up/login prompts in `scan`, `profile`, `plan`, `trainer` are effectively only reachable if a session can be null inside tabs (e.g. after sign-out before the redirect fires).
