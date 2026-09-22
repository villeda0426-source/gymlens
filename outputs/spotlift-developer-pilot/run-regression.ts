/**
 * Overlapping-request regression suite for useEquipmentSearch.
 *
 * Runs the same scenarios against the verbatim copy of the current hook
 * (`before`) and the candidate fix (`after`). Race scenarios are expected to
 * fail before and pass after; control scenarios must pass in both.
 *
 * Run:  node_modules/.bin/ts-node --project outputs/spotlift-developer-pilot/tsconfig.json \
 *         outputs/spotlift-developer-pilot/run-regression.ts
 */
import { mount } from "./harness/hooks-runtime";
import { createFakeApi } from "./harness/fake-api";
import { createUseEquipmentSearch as before } from "./src/useEquipmentSearch.before";
import { createUseEquipmentSearch as after } from "./src/useEquipmentSearch.after";

type HookValue = {
  search: (query: string, category?: string) => Promise<void>;
  results: any[];
  isLoading: boolean;
  error: string | null;
};

type Factory = (apiFetch: ReturnType<typeof createFakeApi>["apiFetch"]) => () => HookValue;

type Scenario = {
  name: string;
  kind: "race" | "control";
  run: (factory: Factory) => Promise<string[]>; // returns failure messages
};

function check(failures: string[], label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${label}: expected ${e}, got ${a}`);
}

const BENCH = [{ id: "bench-press", name: "Bench Press" }];
const BENT = [{ id: "bent-row", name: "Bent-Over Row" }];

const scenarios: Scenario[] = [
  {
    name: "stale success must not overwrite newer results",
    kind: "race",
    run: async (factory) => {
      const api = createFakeApi();
      const instance = mount(factory(api.apiFetch));
      const failures: string[] = [];

      // Debounced keystrokes: "ben" fires, then "bench" fires before "ben" lands.
      void instance.current.search("ben", "all");
      void instance.current.search("bench", "all");
      await api.flush();
      check(failures, "two requests in flight", api.calls.length, 2);

      await api.calls[1].resolve(BENCH); // newer search returns first
      await api.calls[0].resolve(BENT); // older search lands late

      check(failures, "results", instance.current.results, BENCH);
      check(failures, "error", instance.current.error, null);
      check(failures, "isLoading", instance.current.isLoading, false);
      return failures;
    },
  },
  {
    name: "stale error must not overwrite newer results",
    kind: "race",
    run: async (factory) => {
      const api = createFakeApi();
      const instance = mount(factory(api.apiFetch));
      const failures: string[] = [];

      void instance.current.search("ben", "all");
      void instance.current.search("bench", "all");
      await api.flush();

      await api.calls[1].resolve(BENCH); // newer search succeeds
      await api.calls[0].reject("Network request failed"); // older search fails late

      check(failures, "results", instance.current.results, BENCH);
      check(failures, "error", instance.current.error, null);
      check(failures, "isLoading", instance.current.isLoading, false);
      return failures;
    },
  },
  {
    name: "stale completion must not clear the spinner while newer search runs",
    kind: "race",
    run: async (factory) => {
      const api = createFakeApi();
      const instance = mount(factory(api.apiFetch));
      const failures: string[] = [];

      void instance.current.search("ben", "all");
      void instance.current.search("bench", "all");
      await api.flush();

      await api.calls[0].resolve(BENT); // older search finishes; newer still pending

      check(failures, "isLoading while newer request pending", instance.current.isLoading, true);
      check(failures, "results before newer request lands", instance.current.results, []);

      await api.calls[1].resolve(BENCH);
      check(failures, "results after newer request lands", instance.current.results, BENCH);
      check(failures, "isLoading after newer request lands", instance.current.isLoading, false);
      return failures;
    },
  },
  {
    name: "control: single search publishes results and clears loading",
    kind: "control",
    run: async (factory) => {
      const api = createFakeApi();
      const instance = mount(factory(api.apiFetch));
      const failures: string[] = [];

      void instance.current.search("bench", "machine");
      await api.flush();
      check(failures, "request path", api.calls[0].path, "/api/search?q=bench&category=machine");
      check(failures, "isLoading during request", instance.current.isLoading, true);

      await api.calls[0].resolve(BENCH);
      check(failures, "results", instance.current.results, BENCH);
      check(failures, "error", instance.current.error, null);
      check(failures, "isLoading", instance.current.isLoading, false);
      return failures;
    },
  },
  {
    name: "control: single failed search surfaces the error",
    kind: "control",
    run: async (factory) => {
      const api = createFakeApi();
      const instance = mount(factory(api.apiFetch));
      const failures: string[] = [];

      void instance.current.search("bench", "all");
      await api.flush();
      await api.calls[0].reject("Cannot reach SpotLift services.");

      check(failures, "error", instance.current.error, "Cannot reach SpotLift services.");
      check(failures, "results", instance.current.results, []);
      check(failures, "isLoading", instance.current.isLoading, false);
      return failures;
    },
  },
  {
    name: "control: sequential searches keep the newest result",
    kind: "control",
    run: async (factory) => {
      const api = createFakeApi();
      const instance = mount(factory(api.apiFetch));
      const failures: string[] = [];

      void instance.current.search("bent", "all");
      await api.flush();
      await api.calls[0].resolve(BENT);
      check(failures, "first result", instance.current.results, BENT);

      void instance.current.search("bench", "all");
      await api.flush();
      check(failures, "error cleared on new search", instance.current.error, null);
      await api.calls[1].resolve(BENCH);
      check(failures, "second result", instance.current.results, BENCH);
      return failures;
    },
  },
  {
    name: "control: retrying after a failure recovers",
    kind: "control",
    run: async (factory) => {
      const api = createFakeApi();
      const instance = mount(factory(api.apiFetch));
      const failures: string[] = [];

      void instance.current.search("bench", "all");
      await api.flush();
      await api.calls[0].reject("Network request failed");
      check(failures, "error after failure", instance.current.error, "Network request failed");

      void instance.current.search("bench", "all");
      await api.flush();
      await api.calls[1].resolve(BENCH);
      check(failures, "error after retry", instance.current.error, null);
      check(failures, "results after retry", instance.current.results, BENCH);
      check(failures, "isLoading after retry", instance.current.isLoading, false);
      return failures;
    },
  },
];

async function main(): Promise<void> {
  const variants: Array<{ label: string; factory: Factory }> = [
    { label: "BEFORE (current hooks/useEquipmentSearch.ts)", factory: before as Factory },
    { label: "AFTER  (request-id guarded copy)", factory: after as Factory },
  ];

  const summary: Record<string, { pass: number; fail: number }> = {};
  let afterFailures = 0;
  let raceFailuresBefore = 0;
  let controlFailuresBefore = 0;

  for (const variant of variants) {
    console.log(`\n=== ${variant.label} ===`);
    summary[variant.label] = { pass: 0, fail: 0 };

    for (const scenario of scenarios) {
      const failures = await scenario.run(variant.factory);
      const ok = failures.length === 0;
      if (ok) summary[variant.label].pass++;
      else summary[variant.label].fail++;
      if (!ok && variant.label.startsWith("AFTER")) afterFailures++;
      if (!ok && variant.label.startsWith("BEFORE") && scenario.kind === "race") raceFailuresBefore++;
      if (!ok && variant.label.startsWith("BEFORE") && scenario.kind === "control") controlFailuresBefore++;

      console.log(`  ${ok ? "PASS" : "FAIL"}  [${scenario.kind}] ${scenario.name}`);
      for (const failure of failures) console.log(`          - ${failure}`);
    }
  }

  console.log("\n=== SUMMARY ===");
  for (const [label, counts] of Object.entries(summary)) {
    console.log(`  ${label}: ${counts.pass} passed, ${counts.fail} failed`);
  }

  const raceCount = scenarios.filter((s) => s.kind === "race").length;
  const expectationsMet = afterFailures === 0 && raceFailuresBefore === raceCount && controlFailuresBefore === 0;
  console.log(
    `\n  Race scenarios failing BEFORE: ${raceFailuresBefore}/${raceCount} (expected ${raceCount}/${raceCount})`
  );
  console.log(`  Scenarios failing AFTER: ${afterFailures}/${scenarios.length} (expected 0)`);
  console.log(`  Control scenarios failing BEFORE: ${controlFailuresBefore} (expected 0)`);
  console.log(`\n  RESULT: ${expectationsMet ? "regression demonstrated and fixed" : "EXPECTATIONS NOT MET"}`);
  process.exit(expectationsMet ? 0 : 1);
}

void main();
