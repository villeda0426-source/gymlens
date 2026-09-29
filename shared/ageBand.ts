// Age-band helpers shared by the client (registration, the one-time birth-year
// gate) and the server (nothing here touches Supabase; it's pure arithmetic so
// both sides compute the same answer from the same birth year).
//
// MINIMUM_ACCOUNT_AGE is a placeholder pending legal/product sign-off — see
// docs/roadmap/coach-account-history-build-2026-09-22.md's "under-13/COPPA
// handling" flag. 13 is the common COPPA floor; change this in one place.
export const MINIMUM_ACCOUNT_AGE = 13;

export type AgeBand = "unknown" | "under_18" | "adult_18_59" | "over_59";

export function isValidBirthYear(birthYear: number, asOfYear = new Date().getFullYear()): boolean {
  return Number.isInteger(birthYear) && birthYear >= asOfYear - 120 && birthYear <= asOfYear;
}

export function ageForBirthYear(birthYear: number, asOfYear = new Date().getFullYear()): number {
  return asOfYear - birthYear;
}

export function isBelowMinimumAccountAge(birthYear: number, asOfYear = new Date().getFullYear()): boolean {
  return ageForBirthYear(birthYear, asOfYear) < MINIMUM_ACCOUNT_AGE;
}

export function computeAgeBand(birthYear: number | null | undefined, asOfYear = new Date().getFullYear()): AgeBand {
  if (birthYear === null || birthYear === undefined || !isValidBirthYear(birthYear, asOfYear)) return "unknown";
  const age = ageForBirthYear(birthYear, asOfYear);
  if (age < 18) return "under_18";
  if (age > 59) return "over_59";
  return "adult_18_59";
}
