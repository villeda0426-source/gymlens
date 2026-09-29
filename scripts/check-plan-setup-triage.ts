// Offline unit test for the plan-setup safety-triage mapping (Phase 0 asked
// for this specifically). No network, no AI calls, no Supabase.
import assert from "node:assert/strict";
import {
  LIMITATION_CHIPS,
  triageAfterClearance,
  triagePlanSetup,
  type LimitationChip,
} from "../shared/planSetupTriage";
import { computeAgeBand, isBelowMinimumAccountAge, MINIMUM_ACCOUNT_AGE } from "../shared/ageBand";

let failures = 0;
const check = (name: string, fn: () => void) => {
  try {
    fn();
    console.log("PASS", name);
  } catch (e: any) {
    failures++;
    console.log("FAIL", name, "-", e.message);
  }
};

check("nothing selected -> normal", () => {
  assert.deepEqual(triagePlanSetup([]), { kind: "normal" });
});

check("chest pain or dizziness always wins, alone", () => {
  const d = triagePlanSetup(["chest_pain_or_dizziness"]);
  assert.equal(d.kind, "blocked");
});

check("chest pain or dizziness wins even combined with other chips", () => {
  const combos: LimitationChip[][] = [
    ["chest_pain_or_dizziness", "joint_or_muscle_pain"],
    ["heart_condition_or_high_bp", "chest_pain_or_dizziness"],
    ["chest_pain_or_dizziness", "pregnant_or_postpartum", "other_health_condition"],
  ];
  for (const combo of combos) assert.equal(triagePlanSetup(combo).kind, "blocked", combo.join(","));
});

check("joint/muscle pain needs an area follow-up", () => {
  const d = triagePlanSetup(["joint_or_muscle_pain"]);
  assert.equal(d.kind, "needs_area_followup");
});

check("recent injury or surgery needs an area follow-up", () => {
  const d = triagePlanSetup(["recent_injury_or_surgery"]);
  assert.equal(d.kind, "needs_area_followup");
});

check("area follow-up wins over the light/moderate case when combined", () => {
  const d = triagePlanSetup(["joint_or_muscle_pain", "heart_condition_or_high_bp"]);
  assert.equal(d.kind, "needs_area_followup");
});

check("heart condition / high BP alone -> light/moderate", () => {
  assert.equal(triagePlanSetup(["heart_condition_or_high_bp"]).kind, "light_moderate");
});

check("pregnant or postpartum alone -> light/moderate", () => {
  assert.equal(triagePlanSetup(["pregnant_or_postpartum"]).kind, "light_moderate");
});

check("other health condition alone -> light/moderate", () => {
  assert.equal(triagePlanSetup(["other_health_condition"]).kind, "light_moderate");
});

check("light/moderate chips combined stay light/moderate (no area chip present)", () => {
  const d = triagePlanSetup(["heart_condition_or_high_bp", "pregnant_or_postpartum", "other_health_condition"]);
  assert.equal(d.kind, "light_moderate");
});

check("every chip in the exhaustive list is handled (no crash, valid kind)", () => {
  for (const chip of LIMITATION_CHIPS) {
    const d = triagePlanSetup([chip]);
    assert.ok(["normal", "needs_area_followup", "light_moderate", "blocked"].includes(d.kind), chip);
  }
});

check("clearing the hard stop re-triages the rest", () => {
  assert.deepEqual(triageAfterClearance(["chest_pain_or_dizziness"]), { kind: "normal" });
  assert.equal(triageAfterClearance(["chest_pain_or_dizziness", "joint_or_muscle_pain"]).kind, "needs_area_followup");
  assert.equal(triageAfterClearance(["chest_pain_or_dizziness", "heart_condition_or_high_bp"]).kind, "light_moderate");
});

// ---- Age band ------------------------------------------------------------

check("age band buckets", () => {
  const thisYear = new Date().getFullYear();
  assert.equal(computeAgeBand(thisYear - 10, thisYear), "under_18");
  assert.equal(computeAgeBand(thisYear - 17, thisYear), "under_18");
  assert.equal(computeAgeBand(thisYear - 18, thisYear), "adult_18_59");
  assert.equal(computeAgeBand(thisYear - 59, thisYear), "adult_18_59");
  assert.equal(computeAgeBand(thisYear - 60, thisYear), "over_59");
  assert.equal(computeAgeBand(null, thisYear), "unknown");
  assert.equal(computeAgeBand(undefined, thisYear), "unknown");
  assert.equal(computeAgeBand(thisYear + 1, thisYear), "unknown", "a future birth year is invalid, not a valid under_18");
});

check("minimum account age blocks below the floor, not at or above it", () => {
  const thisYear = new Date().getFullYear();
  assert.equal(isBelowMinimumAccountAge(thisYear - (MINIMUM_ACCOUNT_AGE - 1), thisYear), true);
  assert.equal(isBelowMinimumAccountAge(thisYear - MINIMUM_ACCOUNT_AGE, thisYear), false);
  assert.equal(isBelowMinimumAccountAge(thisYear - (MINIMUM_ACCOUNT_AGE + 5), thisYear), false);
});

if (failures) {
  console.log(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nall passed");
