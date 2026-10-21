// What the weight field means for an exercise, so a Goblet Squat asks for
// the dumbbell's weight while a Push-up treats it as optional added load.
// Read from the exercise name/id (plans don't carry an equipment field per
// exercise) plus the plan's own category for cardio.
export type ExerciseLoad =
  | "external" // dumbbell, barbell, kettlebell, machine, cable — the weight lifted
  | "bodyweight" // own body weight; the field is optional added load
  | "assisted" // assistance machine/band: the counterweight, where less is better
  | "band" // resistance band: optional rated resistance
  | "none"; // cardio/mobility: no load to log

const EQUIPMENT = /\b(dumb\s*bells?|db|barbell|bb|kettle\s*bells?|kb|machine|cable|smith|ez[- ]?bar|trap bar|hex bar|plate|weighted|goblet|leg press|pulldown|press machine|landmine|sled|medicine ball|med ball)\b/i;
const BODYWEIGHT = /\b(body\s*weight|bw|push[- ]?ups?|pull[- ]?ups?|chin[- ]?ups?|dips?|planks?|side plank|dead\s*bug|bird\s*dog|glute bridge|bridge|sit[- ]to[- ]stand|air squat|lunges?|split squat|step[- ]?ups?|crunch(es)?|sit[- ]?ups?|burpees?|mountain climbers?|hollow|superman|y-t-w|ytw|table row|inverted row|pike|good morning|calf raise|wall sit|leg raises?)\b/i;

export function exerciseLoad(args: { id?: string; name: string; category?: string }): ExerciseLoad {
  const text = `${args.name} ${(args.id ?? "").replace(/[_-]+/g, " ")}`;
  if (args.category === "cardio" || args.category === "mobility" || args.category === "warmup") {
    return EQUIPMENT.test(text) ? "external" : "none";
  }
  // "Pull-Up or Assisted Pull-Up" is a pull-up with a fallback, not a
  // machine exercise.
  if (/\bassist(ed|ance)?\b/i.test(text) && !/\bor assisted\b/i.test(text)) return "assisted";
  if (/\bbands?\b/i.test(text) && !/\b(dumb\s*bells?|barbell|kettle\s*bells?|machine|cable|smith|plate)\b/i.test(text)) return "band";
  if (BODYWEIGHT.test(text) && !EQUIPMENT.test(text)) return "bodyweight";
  return "external";
}

export function parseExerciseLoad(value: string | undefined): ExerciseLoad | null {
  return value === "external" || value === "bodyweight" || value === "assisted" || value === "band" || value === "none"
    ? value
    : null;
}
