# Build 50 privacy policy and App Store privacy answers

Prepared October 25, 2026 (America/Chicago). Status: policy source updated locally;
not deployed, and App Store Connect answers not changed. Release target: build 50;
`app.json` currently still says build 49. This task does not change the build number.

## Policy and hosting

The complete replacement policy is `coachlift-web/privacy.html`. It supersedes
the old claims that accounts are optional, only email/equipment are stored, and
analytics cannot identify a user. It discloses account-linked usage, installation
and build metadata, AI cost attribution, Sentry user ID **and email**, training
and health information, camera/photo processing, voice input, and support feedback.

The website is the Netlify project `coachliftai`
(site ID `dbe416e1-edce-4792-b7aa-fdf2141ff7dc`), served at **https://spotlift.app**.
Checked 2026-10-26: `https://spotlift.app/privacy` and `/privacy.html` both
return 200 with the old policy ("Last updated: May 30, 2026"); last production
deploy 2026-08-28. The old `magenta-gnome-d08e12.netlify.app` address returns
404, so `store.config.json` now points at `https://spotlift.app/privacy.html`.
Verify App Store Connect's Privacy Policy URL is a spotlift.app address.

## App Store Connect → App Privacy

Use the following as the prepared entry sheet. These reflect current source and
build 50 analytics; production provider settings and the remaining checks below
must be reconciled before publishing the answers.

- **Do you or your third-party partners collect data from this app? Yes.**
- **Data used to track users: No**, provided the release checks confirm no
  advertising, cross-company tracking, or data-broker use by any integrated SDK.
- Mark the types below **linked to the user's identity**. Random installation
  identifiers and pre-signup activity are not automatically anonymous; they can
  later be linked to an account.
- Select all purposes actually applicable to each type. No advertising or
  developer marketing purpose is established by this implementation.

| App Store data type | Collect | Linked | Tracking | Purposes | Evidence / explanation |
|---|---|---|---|---|---|
| Contact Info → Email Address | Yes | Yes | No | App Functionality; Analytics | Authentication; `app/_layout.tsx` sends email to Sentry, which also samples performance traces. |
| Contact Info → Name | Yes | Yes | No | App Functionality; Product Personalization | Name supplied for the profile and training experience. |
| Health & Fitness → Fitness | Yes | Yes | No | App Functionality; Product Personalization; Analytics | Plans, workout activity and training profile; analytics includes goal, days per week and experience. |
| Health & Fitness → Health | Yes | Yes | No | App Functionality; Product Personalization | Consented limitations, pain and health information submitted for training guidance. |
| User Content → Other User Content | Yes | Yes | No | App Functionality; Product Personalization | Coach requests, routine content, training notes and feedback used to produce guidance. |
| User Content → Customer Support | Yes | Yes | No | App Functionality | In-app feedback and support correspondence. |
| User Content → Photos or Videos | Yes, conservative default | Yes | No | App Functionality | Equipment images sent to OpenAI. No application-database image storage does not establish real-time-only third-party handling; verify provider settings before considering an exemption. |
| Identifiers → User ID | Yes | Yes | No | App Functionality; Analytics; Product Personalization | Account, training context, Sentry, usage events and AI attribution. |
| Identifiers → Device ID | Yes | Yes | No | App Functionality; Analytics | Random installation identifier, installation records, session/identity linkage and request context. This does not mean IDFA or a hardware serial number is collected. |
| Usage Data → Product Interaction | Yes | Yes | No | Analytics | First open, signup, survey, plans, workouts and screen views. |
| Diagnostics → Crash Data | Yes | Yes | No | App Functionality | Sentry crash reporting with account context. |
| Diagnostics → Performance Data | Yes | Yes | No | App Functionality; Analytics | Sentry performance traces and AI request latency. |
| Diagnostics → Other Diagnostic Data | Yes | Yes | No | App Functionality; Analytics | AI usage metadata, outcome, model, token counts, estimated cost, app/build/OS and request context. |
| Other Data → Other Data Types | Yes | Yes | No | App Functionality; Product Personalization | Birth year used for age-appropriate training context. |

### Additional categories to resolve before submission

- **Audio Data:** optional speech input uses `expo-speech-recognition`. The app
  sends the resulting text, not recorded audio, to its own API. The call does
  not force on-device recognition. Verify Apple/Android speech-service retention
  and any saved recordings before answering No; disclose Audio Data if a partner
  retains it beyond real-time processing. Device permission alone does not settle
  Apple's collection question.
- **Photos or Videos:** the prepared answer above is Yes. Confirm the deployed
  OpenAI organization's controls, retention, and linkage. The code uses Responses
  without explicitly setting `store: false`; do not claim zero retention.
- **Search History:** check persistence of equipment/workout queries in actual
  production request logs or provider records. Add this category if retained;
  this pass did not establish a retained search-history collection.
- Do not select financial information simply because we log our AI service cost.
  These are our operating costs, not the user's payment information.
- No location, contacts, advertising identifier, or purchase-data collection was
  established in this source review. Reconcile all shipped SDKs before finalizing.

Apple requires disclosure of applicable third-party collection and uses a
retention-based definition of collection. Use the current categories in the
console if its labels differ from this sheet:
[Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/).
For the AI provider, see
[OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data).

## Source verification and material limits

| Area | Source | Verified behavior / limit |
|---|---|---|
| Required authentication and diagnostics | `app/_layout.tsx`, `lib/sentry.ts` | AuthGate; Sentry receives ID/email; production performance sample rate 0.1. |
| Product events | `shared/analyticsEvents.ts`, `lib/analytics/`, analytics migration | First-party ingestion; allowlisted properties; account linkage; 500-event / 7-day local queue. |
| Training attributes in analytics | `supabase/migrations/20261026120000_product_analytics.sql` | Survey completion includes goal, schedule, equipment type and experience. These are fitness-related usage attributes. |
| Installations and AI attribution | `server/routes/analytics.ts`, `server/lib/requestContext.ts`, `server/services/openaiService.ts` | Version/build/platform/installation metadata and authenticated AI user attribution; usage logs exclude prompt/response text. |
| Separate AI content storage | `server/routes/coach-trainer.ts` | Background job payloads/results are persisted. Do not broaden “no prompt text in usage logs” into “no AI content is stored.” |
| Deletion | `server/routes/account.ts`, analytics migration | Deletes AI usage and account data; cascades directly linked event rows. Events with null user IDs can survive when identity links are deleted. |
| Retention | analytics migration, `server/index.ts` | 13-month raw-event purge called by API server. Deployment and successful execution have not been verified here. No fixed Sentry/support/provider retention period established. |
| Media and voice | `server/routes/identify.ts`, `app/(tabs)/trainer.tsx` | Scan results/history stored; photos sent for AI processing; voice becomes message text via device speech service. |
| Feedback | `server/routes/feedback.ts` | Feedback stored in database; email feedback sent through Gmail. Account deletion does not delete support mailbox contents. |

The public policy intentionally does not promise immediate deletion from every
provider, complete removal of pre-signup events, no health collection, or no AI
provider retention.

## Release blockers and remaining external actions

1. **Vexo — verified off for store builds (2026-10-26):** `lib/vexo.ts` only
   initializes when `EXPO_PUBLIC_VEXO_API_KEY` is set; EAS `production` has no
   such variable and `.easignore` excludes `.env`. Keep it that way (it also
   breaks navigation), or remove the integration in a later engineering change.
2. Resolve speech-service retention, OpenAI data controls, Sentry retention and
   production log settings. Record final decisions in this document.
3. **Done (2026-10-26):** analytics migration applied to production and recorded
   in `supabase_migrations.schema_migrations`; retention function callable by the
   server role only (verified), server calls it daily (deployed in `3b847b8`).
4. Publish `coachlift-web/privacy.html` to the existing Netlify site; check both
   `/privacy.html` and the homepage's `/privacy` link on mobile and desktop.
5. In App Store Connect, compare the existing answers, enter the finalized
   collection types/purposes/linkage/tracking answers, verify the policy URL,
   and save/publish the privacy update. Record evidence without personal data.
6. Review the app privacy manifest and shipped SDK manifests against the final
   declarations. `app.json` currently has an empty `NSPrivacyCollectedDataTypes`
   array; that is not evidence of “no data collected” and does not update App
   Store Connect. This policy-only change does not modify the manifest.

**Build 50 privacy readiness: pending.** Local policy and prepared answers are
complete; publication, console changes and provider/release verification remain.
