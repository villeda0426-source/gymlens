/** Stable, globally unique exercise identifiers for Coach plans.
 *
 * The base is intentionally language-independent where callers use the
 * canonical English movement name. `allocateUniqueExerciseId` never mutates
 * existing IDs: callers pass every ID that will remain in the plan and use the
 * returned ID only for a genuinely new movement.
 */

export function slugExerciseId(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "exercise";
}

export function allocateUniqueExerciseId(base: string, existing: Iterable<string>): string {
  const normalized = slugExerciseId(base);
  const taken = existing instanceof Set ? existing : new Set(existing);
  if (!taken.has(normalized)) return normalized;
  let suffix = 2;
  while (taken.has(`${normalized}-${suffix}`)) suffix += 1;
  return `${normalized}-${suffix}`;
}

/** Normalizes a plan-like list while preserving the first occurrence of each
 * existing ID. Later duplicates receive a fresh deterministic suffix. */
export function ensureUniqueExerciseIds<T extends { exercise_id?: string; name: string }>(
  exercises: T[]
): T[] {
  const taken = new Set<string>();
  return exercises.map((exercise) => {
    const proposed = exercise.exercise_id?.trim() || slugExerciseId(exercise.name);
    const id = allocateUniqueExerciseId(proposed, taken);
    taken.add(id);
    return id === exercise.exercise_id ? exercise : { ...exercise, exercise_id: id };
  });
}
