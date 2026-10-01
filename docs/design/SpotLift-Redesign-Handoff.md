# SpotLift Redesign — Handoff

Last updated: Sep 30, 2026. Everything decided in the original chat about the SpotLift UI redesign. Paste or attach this file at the start of a new chat (or give it to Claude Code) and continue from "Where we are now."

---

## How to use this file

**In a new Claude chat:** attach this file plus `spotlift-redesign-package.zip`, and say:
> "This is the handoff for my SpotLift redesign. Read it fully. We're picking up at 'Where we are now'."

**In Claude Code:** unzip the package into the repo at `docs/design/`, then paste the prompt in Section 9.1 first.

---

## 1. The app

- **SpotLift** — AI gym companion. Point the camera at equipment → learn what it is, which muscles it works, how to use it safely → get an adaptive plan. English + Spanish. iOS + Android.
- **Audience:** gym beginners and returners who feel intimidated. Tone: warm, clear, encouraging. Never bro-culture, never shaming.
- **Stack:** React Native + Expo (expo-router, development builds via EAS), `constants/theme.ts` for tokens, screens in `app/(tabs)/`, `app/equipment/`, `components/`. Supabase backend. Sentry. Ionicons. Reanimated.
- **EAS build profiles that exist:** `development`, `preview`, `production` (there is NO `development-device`).
- **Coach** (the AI coach) is the feature we're going heavy on.

---

## 2. Where we are now (read this first)

**The big problem:** changes keep disappearing ("back to square one"). Features removed in the live App Store version (e.g. the avatar) reappeared, and redesign changes made in Claude Code didn't show up on the phone.

**Decision:** the **live App Store version is the baseline**. All redesign work goes on top of it, one feature at a time.

**Likely causes of "back to square one":** check these before anything else (Section 8 has the commands).
1. **Two dev servers running.** We saw one already on port 8081 (process 61721) while a new one started on 8083. The phone was probably connecting to the old server, which serves old code.
2. **Claude Code worked in a different folder or branch.** Claude Code sometimes works in a git *worktree* or a separate branch; those changes don't appear in your main folder until merged.
3. **Changes never committed** (or committed on a branch you're not running).
4. **The dev app on the phone is outdated.** It was built from different code, so it's missing `expo-dev-client` (the server warned "Unable to determine the default URI scheme… ensure expo-dev-client is installed"), and QR scanning didn't open it.
5. **Cached bundle.** Fixed by starting the server with `--clear`.

**Order of work from here:**
1. Step 0: verify setup (Section 8) and reset baseline (prompt 9.1)
2. Fix the age pop-up freeze (prompt 9.2, part 1)
3. Rebuild the tab bar + fix content overlap (prompt 9.2, part 2)
4. Coach Forward redesign, phase by phase (prompt 9.3)
5. Build My Plan flow + Coach chat cleanup (prompt 9.4)

---

## 3. Chosen design: "D — Coach Forward"

We explored A (Refined), B (Modern Coach), C (Gym Floor Dark), then D (mix of B + C, coach-first), then D2/D3 variations. **D was chosen.**

**Idea:** "Light to plan, dark to lift." Home, Coach, Equipment = warm and light. Scan and Workout = dark with big, glanceable numbers. Coach appears everywhere.

### 3.1 Design tokens (add to `theme.ts`; keep old names as aliases)

| Token | Value | Use |
|---|---|---|
| bg | #f5f3ee | light screens |
| card | #ffffff | cards |
| border | #dcd8cf | outlines |
| text | #14171f | main text |
| textSecondary | #5b6270 | secondary text |
| coral | #e04e4e | accents, icons |
| coralPressed | #c53838 | fill behind white button text (passes contrast) |
| lime | #6aaa00 | progress / success fills |
| limeText | #4f8000 | green text on light |
| coachNavy | #0c2340 | Coach surfaces (rename from ndNavy) |
| coachGold | #e8b923 | Coach accents on navy |
| coachGoldText | #8a6700 | gold text on light (ndGold kept as alias) |
| darkBg | #0e1116 | Scan / Workout background |
| darkSurface | #1a1e25 | dark cards |
| darkRaised | #2a2f38 | dark buttons |
| darkTextSecondary | #a9b1bd | secondary text on dark |
| coralOnDark | #ff6b61 | coral text on dark |
| limeOnDark | #9ad63a | "Log set" button (dark text #0e1116 on it) |
| warning icon / text | #8a5a00 / #5c3d00 | safety notes (never coral) |

- **Fonts:** Outfit (600/700/800) for headings and big numbers; Figtree (400–800) for body/UI. Load via `@expo-google-fonts`. Changing numbers use tabular-nums. (This replaces Playfair/Nunito.)
- **Shape:** pill buttons (radius 999), cards radius 22–24, bottom sheets radius 32, 4-pt spacing grid, 20pt screen gutter. Main buttons 52–56pt tall; "Log set" 72pt. Touch targets ≥ 44pt.

### 3.2 Tab bar (exact spec)

- Floating white pill: **72pt tall, 16pt from each side, floating 6pt above the home-indicator area**, soft navy shadow.
- 5 **equal-width** slots: **Home, Plan, Scan, Coach, You**.
- Scan = **56pt coral circle centered inside the pill, no label**.
- Coach = star/sparkles icon; navy when inactive, gold filled when active; **gold dot** when Coach has news.
- Active tab: coral icon + label (Coach: gold icon, navy label). Inactive: grey.
- Every tab screen gets bottom padding = bar height + safe area + 6 + 16 so nothing hides behind the bar.
- Build as a **fully custom** `tabBar` component (reference code in prompt 9.2). Do NOT restyle the default React Navigation tab bar; that's what failed before.

### 3.3 Screens

- **Home:** date + "Ready, [name]?"; **Coach message card first** (navy; e.g. "Your shoulder felt tight, so I swapped chest press for cable fly today." with "Sounds good" / "Talk to coach"); white Today card (big "Push day", 6 exercises · 18 sets · 45 min, coral "Start workout"); dark "Scan a machine" tile with lime corner brackets ("Your gym, finally explained."). No plan yet → card says "Build a plan".
- **Coach tab: chat:** header with Coach avatar; daily check-in ("How does your body feel today?" Fresh / Okay / A bit sore); messages; **suggestion cards** with a gold border (e.g. "Chest press → Cable fly", Apply today / Keep plan); calm safety line ("If the pain is sharp or lasts, check with a physio."); suggestion chips; composer with text, camera (ask about a machine) and mic.
- **Coach tab: weekly check-in:** navy header "Week 3 · 3 of 4 workouts" + 7-day bar chart; "What I noticed" list; "Changes for next week" card with **Approve changes** / Edit. Nothing changes until approved.
- **Scan (dark):** close + Scan/Search/Recent segmented control; lime viewfinder corners; white result sheet: "Looks like Chest Press" + "Strong match" + Coach tip ("go light on this one today") + Not this one / Show me.
- **Equipment:** navy top with machine illustration + lime corners; light sheet: "Beginner friendly", name, muscle chips (main = coral), numbered steps 01–03; navy **"Ask Coach about this machine"** card with 2 ready questions ("What weight should I start with?", "Easier option for my shoulder?"); amber safety line; coral "Add to today's workout".
- **Workout (dark):** timer + "Push day · 2 of 6"; exercise name; 3-segment set bar; big KG and REPS numbers with − / + buttons (56pt); navy Coach tip card with mic button; lime **"Log set"** (72pt); "Next: … · Rest 1:30".

---

## 4. Build My Plan flow (replaces chat-based plan setup)

**Why:** setup in chat asked too many questions at once, repeated itself, and blocked beginners. Plan setup becomes 5 tap-only screens; chat is for after.

**Screens (full-screen, no tab bar):** back/close + 5-segment progress bar + "N of 5"; small Coach label; question in Outfit 30; one helper line; option cards (white, radius 20, 44pt icon tile, title + one line; selected = 2px navy border + navy check); coral "Continue" pinned bottom, disabled until answered.

1. **Goal:** Get stronger / Build muscle / Lose fat / Feel fitter overall
2. **Days & time:** 2 / 3 / 4 / 5 / 6 days + 30 / 45 / 60 min (Coach line: "4 days × 60 min is a great start.")
3. **Where you train:** Full gym / Home with some gear / No equipment (tip: scan your gym's machines later)
4. **Experience:** Brand new / Some experience / Consistent (plain descriptions)
5. **Anything to work around:** big "Nothing — I'm good to go" OR chips: Joint or muscle pain · Recent injury or surgery · Heart condition or high BP · Chest pain or dizziness when active · Pregnant or postpartum · Other health condition. Footer: "SpotLift gives general fitness guidance, not medical advice." Button: "Build my plan".
6. **Plan ready:** navy header ("Your plan is ready, [name]", plan name e.g. "Strength Foundations", chips: 21 days · 4× a week · 60 min · Full gym); Week 1 list; Coach line ("We start light… I'll add weight as you get comfortable."); "Start day 1" + "Tweak it with Coach".

Answers are saved as **structured profile fields** (goal, daysPerWeek, sessionMinutes, location, experience, limitations[]), not chat text.

**Coach chat cleanup:** compact header (36pt avatar + "Coach" + ••• menu, with "Start fresh" moved there); profile summary chips at top; message text 15pt; Coach bubbles white with a small avatar, user bubbles navy; **max 2 sentences per Coach reply**; anything actionable = card (Apply / Not now); one row of 3 chips above a 52pt composer; never re-ask what's in the profile.

---

## 5. Safety triage & decisions

**No blanket doctor clearance.** Asking every beginner for physician clearance was wrong. It follows outdated screening; ACSM's 2015 update only recommends a doctor's OK for people with symptoms or known heart, metabolic or kidney disease. Step 5 decides:

- **Nothing selected** → normal plan; beginners start light and progress gradually.
- **Joint/muscle pain or recent injury** → ask which area, avoid or modify exercises that load it.
- **Heart condition, other condition, or pregnancy (no symptoms)** → plan at light-to-moderate intensity + one dismissible note suggesting a doctor check before high intensity. Pregnancy → pregnancy-safe template.
- **Chest pain or dizziness when active** → no training plan yet; calm card: check with a doctor first; scanning and learning still work; "I've been cleared" button.
- **Emergency in chat** (chest pain/fainting/severe breathlessness right now) → stop and call emergency services.
- Never show "safety review" wording to users. Keep the in-workout rule: sharp pain → stop, offer an alternative.

**Decisions on Claude Code's open questions (Sep 27):**
1. **Setup entry points:** Home and the Coach tab. No plan → Coach tab shows a "Let's build your plan" card. With a plan → "Rebuild my plan" in the Coach ••• menu. One flow, several entry points.
2. **Age:** ask birth year once at account creation; existing users get a one-time, one-screen prompt. Once known, age stops triggering safety context. Under 18 → teen-safe programming. Below the terms' minimum age → blocked per terms.
3. **Old safety check (forceSafetyReview):** keep only as a backup for users with no safety answers; it routes them to step 5 instead of appending ACCOUNT SAFETY CONTEXT.
4. **Health data consent:** explicit, only when needed. A bottom sheet appears when someone picks a limitation ("Use this to tailor your plan? We only use it for your training." Allow / Not now). "Nothing" skips it. "Not now" → light-to-moderate plan, nothing stored.

---

## 6. Fix list (in order)

- [ ] **Step 0: baseline.** Live App Store version = baseline; rebuild redesign on top (prompt 9.1). Verify setup first (Section 8).
- [ ] **Blocker: app freezes after the age pop-up.** After confirming birth year, no button works. Likely an invisible overlay left mounted, or the prompt re-mounting. Prompt 9.2, part 1. (Re-check on the baseline branch first; it may not exist there.)
- [ ] **Tab bar overlaps page content**, plus the broken layout: items not equal width ("HomePlan", "CoachYou" touching), safe-area padding inside the pill, Scan sticking up with a label, no Coach dot. Prompt 9.2, part 2.
- [ ] **"Start fresh"** sits below the tab bar on Coach → move to the ••• menu.
- [ ] **Coach chat header clips the first message** → add top padding.

## 7. Later

- [ ] Lawyer review: "not medical advice" line, consent sheet, age rules.
- [ ] If using the official PAR-Q+ form, check its license (our step 5 list is paraphrased).
- [ ] Mockup images for Scan, Equipment, Workout, Coach week (Claude Code matches pictures better than text).
- [ ] Brand cleanup: remove the unused dark/neon palette in `tailwind.config.js`; rename ndNavy/ndGold; give errors their own red, separate from coral.
- [ ] Android store feature graphic says "Spolift". Fix the spelling.
- [ ] Security: `.env` holds `SUPABASE_SERVICE_ROLE_KEY` and a Gmail app password. Make sure they're only used server-side, never in app code.
- [ ] Add CLAUDE.md rules (Section 10).

---

## 8. Dev setup: running on your iPhone + "is this the right code?" checks

**Before testing anything, confirm you're running the right code** (Terminal, in the SpotLift folder):
```
git branch --show-current      # which branch you're on
git status                     # uncommitted changes?
git log --oneline -5           # latest commits: do you see the redesign work?
git worktree list              # did Claude Code work in another folder?
lsof -i :8081                  # is an old dev server still running?
```
If `git worktree list` shows more than one folder, the changes may be in the other one. Ask Claude Code to merge them into your branch.

**Run the app on your iPhone:**
1. Stop every old server: Ctrl+C in each Terminal window; `kill <pid>` for anything `lsof` shows.
2. `npm install`
3. `npx expo start --dev-client --clear`
4. Phone + Mac on the same Wi-Fi. Open the SpotLift dev app → Enter URL manually → `http://<Mac IP>:8081` (get the IP with `ipconfig getifaddr en0`). Or scan the QR with the Camera app.
5. iPhone: Settings → Privacy & Security → Local Network → SpotLift = on.
6. Reload: shake phone → Reload, or press `r` in Terminal.

**If the phone can't connect:** `npx expo start --dev-client --tunnel`.

**If the dev app is outdated / QR doesn't open it / native module missing:**
```
npx expo install expo-dev-client
npx eas-cli build --platform ios --profile development
```
Install from the link it gives. If it says the device isn't registered: `npx eas-cli device:create`. Make sure the `development` profile in eas.json has `"developmentClient": true`, `"distribution": "internal"`, and is NOT simulator-only, and app.json has a `"scheme"`.

---

## 9. Prompts for Claude Code (in order)

### 9.1 Baseline reset (run first)
```
IMPORTANT: The App Store version is our baseline. The current dev build has regressed: features we removed in the live App Store release (e.g. the avatar) are back, and redesign changes keep disappearing. Stop all redesign work until the baseline is fixed.

## Phase A — Investigate (read-only; don't change, reset, or delete anything)
1. Find the exact code of the live App Store release: app.json/app.config version + ios.buildNumber, git tags/release branches, `eas build:list --platform ios --limit 10` (commit hash of the store build), and EAS Update/OTA channels.
2. Run and report: current branch, `git status`, `git log --oneline -10`, `git worktree list`, and whether any dev server is already running on 8081. Tell me where your previous redesign edits actually live (which branch/worktree, committed or not).
3. Tell me the live release commit and how the current code relates to it (ahead, behind, diverged).
4. List every difference between the live release and the current code, grouped:
   (a) redesign work (Coach Forward, tab bar, Build My Plan, safety triage, age prompt)
   (b) things REMOVED in the live release that are back (e.g. the avatar)
   (c) anything else you can't explain
Wait for my OK.

## Phase B — Rebuild on the right base (after I approve)
1. Back up: push the current branch as-is to `backup/pre-baseline-<date>` (and any worktree branches). Never force-push, reset, or delete main or existing branches.
2. Create `redesign/coach-forward` from the live release commit.
3. Re-apply ONLY group (a), one feature per commit: theme tokens/fonts → custom tab bar → Coach tab → Build My Plan + safety triage → age prompt. Cherry-pick clean commits; re-implement tangled ones on top of the live code.
4. Group (b) stays removed. If a redesign change depends on something the live version removed, stop and ask me.
5. Make sure expo-dev-client is installed and app.json has a `scheme`. Tell me if I need a new dev build (`eas build --platform ios --profile development`).
6. After each feature: build, run, screenshot, and summarize what's in the branch vs the live app. Commit and push each step so nothing is lost.

## Going forward
Add to CLAUDE.md: "Baseline = live App Store release commit <hash>. All work happens on branch redesign/coach-forward in the main project folder (no worktrees). Never restore features the live version removed without asking. Commit and push after every feature."
```

### 9.2 Age pop-up freeze + tab bar (after 9.1)
Attach your latest screenshot + `coach-forward/mockup-main.png`.

````
Two fixes, in this order. Stop after each, show simulator screenshots, and wait for my OK.

## Fix 1 — BLOCKER: app freezes after the age pop-up
On app open, a pop-up asks me to confirm my age. After I enter my birth year and confirm, no button responds.
1. Investigate and tell me the cause. Suspects: the modal/backdrop stays mounted and captures touches; age_band never updates so the prompt re-mounts; a save call hangs and leaves a loading overlay.
2. Fix: after a successful save the prompt fully unmounts; it only shows when age is unknown and never again once saved; if saving fails, show an error with Retry and never leave the app blocked. Keep: under 18 → teen-safe programming; below terms' minimum age → blocked per terms.
3. Test on a fresh install AND my existing account. Record a simulator video (`xcrun simctl io booted recordVideo`): prompt → enter year → confirm → Home, Coach and Scan buttons all work. Add a regression test.

## Fix 2 — Tab bar overlaps content + broken layout
Problems: content hidden under the floating bar; 5 items not equal width (labels touch: "HomePlan", "CoachYou"); safe-area inset inside the pill (bar too tall, empty space under icons); Scan sticks up with a label (should be a 56pt circle centered INSIDE the pill, no label); Coach news dot missing; "Start fresh" sits below the tab bar on Coach.

Replace the default tab bar with a fully custom one via the `tabBar` prop on <Tabs>. Remove any old tabBarStyle / tabBarItemStyle / tabBarButton / raised-button code. Reference implementation (adapt route, icon, token and font names; keep layout values exactly):

```tsx
// components/CoachTabBar.tsx
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, fonts } from '@/constants/theme';

export const TAB_BAR_HEIGHT = 72;
const SIDE = 16;
const GAP_ABOVE_SAFE_AREA = 6;

export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + Math.max(insets.bottom, 12) + GAP_ABOVE_SAFE_AREA + 16;
}

const ICONS: Record<string, [string, string]> = {
  index: ['home', 'home-outline'],
  plan: ['calendar', 'calendar-outline'],
  coach: ['sparkles', 'sparkles-outline'],
  profile: ['person', 'person-outline'],
};

export function CoachTabBar({ state, descriptors, navigation, hasCoachNews = false }:
  BottomTabBarProps & { hasCoachNews?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + GAP_ABOVE_SAFE_AREA }]}>
      <View style={styles.bar}>
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const label = (descriptors[route.key].options.title ?? route.name) as string;
          const onPress = () => {
            const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !e.defaultPrevented) { Haptics.selectionAsync(); navigation.navigate(route.name); }
          };
          if (route.name === 'scan') {
            return (
              <View key={route.key} style={styles.slot}>
                <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Scan a machine"
                  style={({ pressed }) => [styles.scan, pressed && { transform: [{ scale: 0.96 }] }]}>
                  <Ionicons name="scan" size={26} color="#fff" />
                </Pressable>
              </View>
            );
          }
          const isCoach = route.name === 'coach';
          const [on, off] = ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
          const tint = focused ? (isCoach ? colors.coachNavy : colors.coralPressed)
                               : (isCoach ? colors.coachNavy : colors.textSecondary);
          return (
            <Pressable key={route.key} onPress={onPress} style={styles.slot}
              accessibilityRole="tab" accessibilityState={{ selected: focused }}
              accessibilityLabel={isCoach && hasCoachNews ? `${label}, new update` : label}>
              <View>
                <Ionicons name={(focused ? on : off) as any} size={22}
                  color={isCoach && focused ? colors.coachGold : tint} />
                {isCoach && hasCoachNews && <View style={styles.dot} />}
              </View>
              <Text numberOfLines={1}
                style={[styles.label, { color: tint, fontFamily: focused ? fonts.bodyExtraBold : fonts.bodySemiBold }]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: SIDE, right: SIDE },
  bar: { height: TAB_BAR_HEIGHT, borderRadius: 999, backgroundColor: '#fff', flexDirection: 'row',
    alignItems: 'center', paddingHorizontal: 6, shadowColor: colors.coachNavy, shadowOpacity: 0.16,
    shadowRadius: 15, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
  slot: { flex: 1, height: 56, alignItems: 'center', justifyContent: 'center', gap: 3 },
  scan: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.coralPressed,
    alignItems: 'center', justifyContent: 'center', shadowColor: colors.coral, shadowOpacity: 0.35,
    shadowRadius: 7, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  label: { fontSize: 12, lineHeight: 15 },
  dot: { position: 'absolute', top: -2, right: -5, width: 10, height: 10, borderRadius: 5,
    backgroundColor: colors.coachGold, borderWidth: 2, borderColor: '#fff' },
});
```

Then:
- Tabs: `<Tabs tabBar={(p) => <CoachTabBar {...p} hasCoachNews={/* from coach store */} />} screenOptions={{ headerShown: false }}>`, order Home, Plan, Scan, Coach, You.
- EVERY tab screen: ScrollView/FlatList `contentContainerStyle.paddingBottom = useTabBarSpace()`. On Coach, chips + composer sit above the bar and the message list clears both.
- Move "Start fresh" into a ••• menu in the Coach header. Add top padding so the first chat message isn't clipped.

Acceptance (verify visually): 5 equal slots, labels never touch; pill 72pt, 16pt from sides, 6pt above the home indicator, no empty space inside; Scan 56pt circle centered inside the pill, no label; last item on every tab scrolls above the bar; works on iPhone SE + iPhone 15 and at 130% text size.

Verify: screenshot Home (iPhone 15 and SE), Coach and Plan, compare each with mockup-main.png, list remaining differences. Done only when all checks pass. Commit and push.
````

### 9.3 Coach Forward redesign (7 phases, 0–6; after 9.2)
```
You're redesigning SpotLift (React Native / Expo) to "Coach Forward." Coach is the priority. Work in phases on branch redesign/coach-forward; stop for my approval after each phase; commit and push each phase.

Source of truth: docs/design/coach-forward/*.html and *.png (six 390×844 screens: Main=Home, Coach, CoachWeek, Scan, Equipment, Workout) and docs/design/SpotLift-Redesign-Handoff.md (tokens, specs, decisions). Match the PNGs. Idea: "light to plan, dark to lift."

Tokens, fonts and shape: use Section 3.1 of the handoff exactly. Keep existing token names as aliases.

Phase 0 — Orient (no changes): read CLAUDE.md, theme.ts, the tab layout and every affected screen. Report navigation setup, the coach backend/API and its data, i18n setup, reusable components, open product questions. Then a file-by-file plan for phases 1–6.
Phase 1 — Tokens + fonts only. Flag/remove the unused tailwind dark/neon palette.
Phase 2 — Custom tab bar (if not already done in 9.2) + Coach route.
Phase 3 — Coach chat: FeelingCheckIn, CoachMessage/user bubbles, CoachSuggestionCard (gold border, Apply / Keep plan), SafetyNote, SuggestedPrompts, CoachComposer (text, camera → Scan, mic). Plan changes never apply without tapping Apply. No backend → typed coachService with mock data + TODOs; don't invent endpoints.
Phase 4 — Weekly check-in (CoachWeek.png): navy header with 3 of 4 + 7-day bars, What I noticed, Changes for next week with Approve changes / Edit.
Phase 5 — Home (Main.png): Coach message card first, Today card, dark Scan tile.
Phase 6 — Scan, Equipment, Workout per their PNGs.

Rules: UI only unless I approve; reuse components; every screen has loading/empty/error/offline, long Spanish text and 130% text states; camera-permission-denied fallback; touch targets ≥ 44pt, AA contrast, accessibility labels; motion 150–300ms respecting Reduce Motion; haptics on select, Log set and Apply; all copy EN + ES; ask before new dependencies (fonts excepted).

After each phase: run on the simulator, screenshot every changed screen next to its PNG, fix differences, then report what changed + screenshots + anything you couldn't match + questions.
```

### 9.4 Build My Plan flow + chat cleanup (after 9.3 or alongside Phase 3)
```
Replace chat-based plan setup with a 5-step tap-only flow, then simplify the Coach chat. Mockups: docs/design/build-my-plan/ (match the PNGs). Spec + decisions: Sections 4 and 5 of docs/design/SpotLift-Redesign-Handoff.md, follow them exactly, including the four Sep 27 decisions (entry points, age, backup safety check, explicit consent sheet).

Phase 0 — Investigate (no changes): where setup starts today, how the coach chooses questions, where answers are stored, how the plan generator is called, what sets "account safety review requires caution". File-by-file plan; wait.
Phase 1 — Setup flow: Goal → Days & time → Where → Experience → Anything to work around. Save structured profile fields. Safety triage from step 5 (remove the physician-clearance question everywhere; no user-facing "safety review" wording). Consent sheet only when a limitation is picked.
Phase 2 — Plan ready screen.
Phase 3 — Coach chat cleanup per Chat.png: compact header + ••• menu (Start fresh inside), profile chips at top, 15pt text, max 2-sentence replies, action cards, one chip row, composer clears the tab bar. Update the coach system prompt: short replies, never re-ask profile data, cards for plan changes.

Rules: EN + ES, 44pt targets, VoiceOver labels ("Get stronger, selected"), light haptic on select, Reduce Motion. Keep the in-workout pain rule.
Verify: unit-test the triage mapping; run the flow as a brand-new beginner (Get stronger, 4 × 60, Full gym, Brand new, Nothing), screenshot every step + the chat next to its PNG, report remaining differences. Commit and push.
```

---

## 10. Working rules (put in CLAUDE.md)

- Baseline = live App Store release. Work only on `redesign/coach-forward` in the main project folder; no worktrees.
- Never restore features the live version removed without asking.
- One feature per commit; commit and push after every feature.
- Always attach the mockup PNG for the screen being built; match pictures, not descriptions.
- Every UI change ends with simulator screenshots compared side by side with the mockup, plus a list of remaining differences.
- Before testing on the phone: one dev server only, started with `--clear`, from the main folder on the right branch.

---

## 11. Links

- Tracker doc (living to-do list): https://claude.ai/code/artifact/86eff490-2e44-4dc5-933c-e79a8c2a41ae
- D — Coach Forward (chosen design): https://claude.ai/artifact/L9oyjPGKWEm5xLC5pLsbrc
- Build My Plan flow: https://claude.ai/artifact/7etq485C6KBQWAgBVVqxwM
- D2 / D3 variations (reference only): https://claude.ai/artifact/MHFPNKHtQR3h3U5CcukeuK
- Earlier concepts A / B / C: https://claude.ai/artifact/SpwZJvbwR8tzaxGPgiQ5pR · https://claude.ai/artifact/DcK5tPXZjd5PeK6TJtnLQe · https://claude.ai/artifact/5xtWSSrzMzWQccC5oRJRg8
- Package: `spotlift-redesign-package.zip`, which contains this file, `coach-forward/` (HTML + PNG for 6 screens) and `build-my-plan/` (HTML + PNG for 7 screens). Unzip into the repo at `docs/design/`.
