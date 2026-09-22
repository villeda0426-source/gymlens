export type WeightUnit = "kg" | "lbs";

export interface LoggedSet {
  id: string;
  userId: string;
  exerciseId: string;
  exerciseName: string;
  week: number;
  day: number;
  setNumber: number;
  reps: number | null;
  weight: number | null;
  unit: WeightUnit;
  completed: boolean;
  loggedAt: string;
}

export interface WorkoutLogContext {
  exerciseId: string;
  exerciseName: string;
  week: number;
  day: number;
  prescribedSets: number;
  units: WeightUnit;
}

const KG_PER_LB = 0.45359237;

export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return value;
  return from === "lbs" ? value * KG_PER_LB : value / KG_PER_LB;
}

export function roundWeight(value: number): number {
  return Math.round(value * 10) / 10;
}

// PR is derived, never stored: the heaviest logged weight for the exercise, compared in one unit.
export function computePersonalRecord(sets: LoggedSet[], unit: WeightUnit): number | null {
  let best: number | null = null;
  for (const set of sets) {
    if (set.weight == null || set.weight <= 0) continue;
    const weight = convertWeight(set.weight, set.unit, unit);
    if (best === null || weight > best) best = weight;
  }
  return best === null ? null : roundWeight(best);
}

const NON_STRENGTH = /swim|nataci|nado\b|natar|cycl|cicl|bike|bicicleta|\brun|jog|correr|trote|treadmill|cinta|cardio|drill|stroke|kick|stretch|estiramiento|yoga|mobility|movilidad/i;

// Sets/reps/weight only make sense for strength work (handoff open question 3).
export function isStrengthExercise(id: string, name: string): boolean {
  if (id.startsWith("stretch-")) return false;
  return !NON_STRENGTH.test(name);
}

export function parseNumber(text: string): number | null {
  const n = parseFloat(text.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
