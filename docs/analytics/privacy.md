# Privacy disclosures for analytics (build 50) — draft for review

Prepared 2026-10-26 from the actual implementation. This is not legal advice;
review it before publishing. Nothing here has been published or submitted.

## 1. The live privacy policy is already inaccurate

These statements in `coachlift-web/privacy.html` (last updated May 30, 2026)
don't match the shipping app (build 44+), even before analytics:

| Policy says | Reality |
|---|---|
| "SpotLift can be used without creating an account" | Every screen requires sign-in (`app/_layout.tsx` AuthGate) |
| "We store only your email address and the equipment you choose to save" | Profile (name, goal, schedule, experience, birth year), workouts and sets, plan feedback, Coach requests (`coach_trainer_jobs.payload`), scans, and health limitations with explicit consent |
| "We do not collect … device identifiers" | Build 50 adds a random installation id |
| "Analytics … cannot be linked back to you individually" | Build 50 analytics is linked to the account |
| No mention of crash reporting | Sentry receives crashes, performance traces, and the user's id **and email** (`app/_layout.tsx` `Sentry.setUser`) |
| "No personal data is retained after your session ends" without an account | Not applicable (no guest mode). Pre-signup analytics is kept, keyed by the random installation id |

Optional: drop `email` from `Sentry.setUser` (keep `id`) so Sentry no longer
receives contact info. It's a one-line change; tell me if you want it.

## 2. Proposed policy text (replaces sections 2, 4, 5, 6, 7)

**What we collect**
- *Account:* email address, the name you enter, and sign-in method (email or
  Apple).
- *Training profile:* goal, training days, session length, equipment,
  experience level and birth year. Injury or health limitations are stored
  only if you allow it.
- *Training activity:* plans, workouts, sets, reps, weights, completions and
  post-workout feedback.
- *Coach and scans:* the messages you send to Coach and the equipment you
  scan, so we can answer you. Scan photos are sent to our AI provider to
  identify the equipment and aren't stored on our servers.
- *App usage (analytics):* which screens you open and key steps you complete
  (for example opening the app for the first time, starting signup, finishing
  the plan survey, getting a plan, starting and finishing a workout), plus
  app version, build, device platform and OS version. This is linked to your
  account so we can see where people get stuck. Before you sign up, it is
  linked to a random identifier created by the app. That identifier is reset
  if you delete and reinstall the app. We don't use advertising identifiers,
  device serial numbers or fingerprinting.
- *Diagnostics:* crash reports and performance data, linked to your account.
- *AI usage:* for each AI request, which feature was used, its size, cost and
  timing, linked to your account. We don't store your prompts or the AI's
  answers in these records.

**How we use it.** To run the app and your plan, to fix crashes, and to
understand and improve the product (analytics). We don't sell your data, use
it for advertising, or share it with data brokers. We don't track you across
other companies' apps or websites.

**Service providers.**
- Supabase: database and authentication.
- OpenAI: equipment identification, workout guidance, Coach.
- Sentry: crash and performance reporting.
- YouTube Data API: tutorial videos.
- Railway: hosts our API server.

**Retention.**
- **Account data:** kept until you delete your account. Deletion removes your
  profile, activity and linked analytics.
- **Raw analytics events:** deleted after 13 months.
- **Pre-signup analytics never linked to an account:** keyed only by the
  random app identifier and deleted after 13 months.
- **Events waiting to be sent on your phone:** discarded after 7 days.

**Your choices.** You can delete your account in the app (Profile → Delete
account) or by email.

## 3. App Store Connect → App Privacy (you must update this)

Answers for build 50. "Linked" means linked to the user's identity. Tracking
is **No** for every type: nothing is shared with third parties for
advertising, and no data broker receives it. So **no App Tracking
Transparency prompt** is required.

| Apple data type | Collected | Linked | Purposes |
|---|---|---|---|
| Contact Info → Email Address | Yes | Yes | App Functionality (+ Analytics if Sentry keeps email) |
| Contact Info → Name | Yes | Yes | App Functionality |
| Health & Fitness → Fitness | Yes | Yes | App Functionality, Product Personalization |
| Health & Fitness → Health (limitations, with consent) | Yes | Yes | App Functionality |
| User Content → Other User Content (Coach messages) | Yes | Yes | App Functionality |
| User Content → Photos | Review: sent to OpenAI for processing, not stored by us | — | App Functionality |
| Identifiers → User ID | Yes | Yes | App Functionality, Analytics |
| Identifiers → Device ID (random installation id) | Yes | Yes | Analytics |
| Usage Data → Product Interaction | Yes | Yes | Analytics |
| Diagnostics → Crash Data | Yes | Yes | App Functionality |
| Diagnostics → Performance Data | Yes | Yes | App Functionality |
| Other Data → (birth year) | Yes | Yes | App Functionality |

Check what's currently declared before changing it. I couldn't read App Store
Connect's privacy answers from here.

## 4. Steps only you can do

1. Approve or edit the policy text, then publish it wherever
   `coachlift-web/privacy.html` is hosted (tell me the host and I'll update
   the file).
2. Update the App Privacy answers in App Store Connect **before submitting
   build 50**.
3. Optionally add a short "Analytics" line to the in-app account settings or
   onboarding. Not required, since no tracking prompt is needed.
