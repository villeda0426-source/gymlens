// QA #19 — import an existing routine, deterministically (no AI call).
//
// Scope decision: a real OCR/vision pass over a photo of a handwritten log
// or another app's screenshot genuinely needs a vision model — there's no
// way around that for image input. What this session builds instead, per
// the explicit instruction to do this "without needing to call AI", is the
// text side: paste or type your routine (your own notes, or what you typed
// out from a photo yourself) and it's parsed and matched against
// shared/coachProgramming.ts's exercise library using the same
// Levenshtein-based similarity approach server/routes/identify.ts already
// uses for equipment names. Photo upload is a real, separate next step —
// flagged, not quietly skipped.
import { EXERCISES, type Exercise } from "./coachProgramming";
import type { CoachExercise, CoachPlan, CoachSession, Units } from "@/lib/coachTrainer";

export interface ParsedLine {
  raw: string;
  exercise: Exercise | null;
  matchConfidence: number; // 0-1; >= 0.5 is treated as a usable match
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
}

export interface ParsedDay {
  label: string;
  lines: ParsedLine[];
}

const DAY_HEADER =
  /^(day\s*\d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i;
const SETS_REPS_X = /(\d+)\s*[x×]\s*(\d+)(?:\s*[-–]\s*(\d+))?/i; // "3x8" or "3x8-10"
const SETS_WORD = /(\d+)\s*sets?\b/i;
const REPS_WORD = /(\d+)(?:\s*[-–]\s*(\d+))?\s*reps?\b/i;

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Equipment-type words that show up as a prefix in the library's own names
// ("Dumbbell biceps curl", "Machine chest press") but which a real user
// typing their own routine rarely includes ("bicep curls"). Stripped before
// keyword comparison so they don't count against an otherwise exact match.
const FILLER_WORDS = new Set([
  "dumbbell", "dumbbells", "db", "barbell", "bb", "machine", "cable", "band", "bodyweight", "bw", "seated", "standing",
]);

function keywordSet(s: string): Set<string> {
  return new Set(
    normalize(s)
      .split(" ")
      .map((w) => w.replace(/s$/, "")) // crude singularize: curls -> curl
      .filter((w) => w.length > 2 && !FILLER_WORDS.has(w))
  );
}

// Same overall shape as server/routes/identify.ts's nameSimilarity (full-
// string Levenshtein ratio), kept separate since it's client-side — but
// that approach alone badly under-scored short, plain user input against
// this library's more verbose names (e.g. "bicep curls" vs "Dumbbell
// biceps curl" scored under 0.5 on Levenshtein ratio alone, since the
// "dumbbell" prefix and plural/singular mismatch eat into the whole-string
// distance). Keyword overlap, with filler words and crude pluralization
// stripped, catches that case; Levenshtein ratio remains the fallback for
// everything else.
function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.9;

  const ka = keywordSet(a);
  const kb = keywordSet(b);
  let jaccard = 0;
  if (ka.size > 0 && kb.size > 0) {
    const overlap = [...ka].filter((w) => kb.has(w)).length;
    const union = new Set([...ka, ...kb]).size;
    jaccard = overlap / union;
  }

  const maxLen = Math.max(na.length, nb.length);
  const levRatio = 1 - levenshtein(na, nb) / maxLen;
  return Math.max(jaccard, levRatio);
}

function extractSetsReps(text: string): { sets: number | null; repsMin: number | null; repsMax: number | null; remainder: string } {
  let sets: number | null = null;
  let repsMin: number | null = null;
  let repsMax: number | null = null;
  let remainder = text;

  const xMatch = text.match(SETS_REPS_X);
  if (xMatch) {
    sets = Number.parseInt(xMatch[1], 10);
    repsMin = Number.parseInt(xMatch[2], 10);
    repsMax = xMatch[3] ? Number.parseInt(xMatch[3], 10) : repsMin;
    remainder = text.replace(xMatch[0], "");
  } else {
    const setsMatch = text.match(SETS_WORD);
    if (setsMatch) {
      sets = Number.parseInt(setsMatch[1], 10);
      remainder = remainder.replace(setsMatch[0], "");
    }
    const repsMatch = text.match(REPS_WORD);
    if (repsMatch) {
      repsMin = Number.parseInt(repsMatch[1], 10);
      repsMax = repsMatch[2] ? Number.parseInt(repsMatch[2], 10) : repsMin;
      remainder = remainder.replace(repsMatch[0], "");
    }
  }

  remainder = remainder.replace(/[:,\-–]/g, " ").replace(/\s+/g, " ").trim();
  return { sets, repsMin, repsMax, remainder };
}

function matchExercise(name: string): { exercise: Exercise | null; confidence: number } {
  let best: Exercise | null = null;
  let bestScore = 0;
  for (const ex of EXERCISES) {
    const score = Math.max(similarity(name, ex.en), similarity(name, ex.es));
    if (score > bestScore) {
      bestScore = score;
      best = ex;
    }
  }
  // 0.5 let through false positives on a single generic shared word (e.g.
  // "overhead press" matching "Leg press" on "press" alone, scoring exactly
  // 0.5 via keyword overlap) — confirmed by testing a handful of realistic
  // routine phrasings. 0.6 clears that case while every legitimate match
  // tested (bench press, squat, lat pulldown, bicep curls, rows, push-ups,
  // plank) still scores 0.9+.
  return { exercise: bestScore >= 0.6 ? best : null, confidence: bestScore };
}

// One exercise per line. A line matching DAY_HEADER starts a new day; every
// other non-empty line is parsed as "<name> <sets>x<reps>" in any order.
export function parseRoutineText(text: string): ParsedDay[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const days: ParsedDay[] = [];
  let current: ParsedDay = { label: "Day 1", lines: [] };
  let dayCount = 1;

  for (const line of lines) {
    if (DAY_HEADER.test(line)) {
      if (current.lines.length > 0) days.push(current);
      dayCount += 1;
      current = { label: line.replace(/[:：]/g, "").trim() || `Day ${dayCount}`, lines: [] };
      continue;
    }

    const { sets, repsMin, repsMax, remainder } = extractSetsReps(line);
    if (!remainder) continue; // a line that's only numbers/sets-reps isn't an exercise
    const { exercise, confidence } = matchExercise(remainder);
    current.lines.push({ raw: line, exercise, matchConfidence: confidence, sets, repsMin, repsMax });
  }
  if (current.lines.length > 0) days.push(current);
  return days;
}

function buildExerciseFromParsedLine(line: ParsedLine): CoachExercise {
  const exercise = line.exercise!;
  const sets = line.sets ?? 3;
  const repsMin = line.repsMin ?? 8;
  const repsMax = line.repsMax ?? Math.max(repsMin, 12);
  return {
    exercise_id: exercise.id,
    name: exercise.en,
    category: "compound",
    primary_muscles: [...exercise.primary, ...exercise.secondary],
    sets,
    rep_range: { min: repsMin, max: repsMax },
    target_rpe: null,
    target_load: "Imported from your routine — log the weight you actually used so Coach can track progress from here.",
    rest_seconds: 90,
    tempo: null,
    progression_rule: "Once this feels easy for every set with good form, add a little weight or a rep next time.",
    substitutions: [],
    coach_notes: exercise.cue,
  };
}

// Only days with at least one CONFIRMED match (line.exercise set) produce a
// session; unmatched lines are dropped here — the review screen is where
// the user sees and can act on what didn't match, not silently here.
export function buildPlanFromParsedDays(days: ParsedDay[], units: Units): CoachPlan | null {
  const sessions: CoachSession[] = days
    .slice(0, 4)
    .map((day) => {
      const exercises = day.lines.filter((l) => l.exercise).map(buildExerciseFromParsedLine);
      const session: CoachSession = {
        day_label: day.label,
        focus: day.label,
        estimated_minutes: exercises.length * 8,
        exercises,
      };
      return session;
    })
    .filter((session) => session.exercises.length > 0);

  if (sessions.length === 0) return null;

  return {
    goal: "Imported routine",
    goal_type: "general_fitness",
    experience_level: "intermediate",
    units,
    timeline_weeks: 3,
    days_per_week: sessions.length,
    split: sessions.length > 1 ? "Imported split" : "Full Body",
    equipment: [],
    constraints: [],
    progression_strategy: "Once every set in your imported routine feels easy with good form, add a little weight or a rep.",
    sessions,
    weekly_notes:
      "This plan was imported from your own routine. Anything Coach didn't recognize was left out of the import — you can still log it manually or ask Coach to add it.",
    safety_flags: [],
  };
}
