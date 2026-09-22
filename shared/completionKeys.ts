/* Completion tracking keys.

   The same movement can appear on several days of a plan, so completion must be
   scoped to the session. The exercise ID itself stays stable, because history
   and Coach revisions key off it. */

export const COMPLETION_KEY_SEPARATOR = "::";

type CompletionExercise = { exercise_id: string };
type CompletionSession = { day_label: string; exercises: CompletionExercise[] };

export function completionKey(dayLabel: string, exerciseId: string): string {
  return `${dayLabel}${COMPLETION_KEY_SEPARATOR}${exerciseId}`;
}

export function isExerciseComplete(completedIds: string[], dayLabel: string, exerciseId: string): boolean {
  return completedIds.includes(completionKey(dayLabel, exerciseId));
}

export function countSessionCompleted(completedIds: string[], session: CompletionSession): number {
  return session.exercises.filter((exercise) => isExerciseComplete(completedIds, session.day_label, exercise.exercise_id))
    .length;
}

export function isSessionComplete(completedIds: string[], session: CompletionSession): boolean {
  return session.exercises.length > 0 && countSessionCompleted(completedIds, session) === session.exercises.length;
}

/** Upgrade persisted bare exercise IDs. A legacy completion is credited to the
 *  first session that contains it, so one old tap cannot fan out to every day. */
export function migrateCompletionIds(
  sessions: CompletionSession[] | undefined | null,
  storedIds: string[] | undefined | null
): string[] {
  const stored = Array.isArray(storedIds) ? storedIds : [];
  if (!sessions || sessions.length === 0) {
    return stored.filter((id) => id.includes(COMPLETION_KEY_SEPARATOR));
  }

  const migrated: string[] = [];

  for (const id of stored) {
    if (id.includes(COMPLETION_KEY_SEPARATOR)) {
      if (!migrated.includes(id)) migrated.push(id);
      continue;
    }

    const session = sessions.find((candidate) =>
      candidate.exercises.some((exercise) => exercise.exercise_id === id)
    );
    if (!session) continue;

    const key = completionKey(session.day_label, id);
    if (!migrated.includes(key)) migrated.push(key);
  }

  return migrated;
}
