export function slugExerciseId(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "exercise";
}

export function allocateUniqueExerciseId(base: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  const normalized = slugExerciseId(base);
  if (!taken.has(normalized)) return normalized;
  let index = 2;
  while (taken.has(`${normalized}-${index}`)) index += 1;
  return `${normalized}-${index}`;
}
