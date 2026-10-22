// What the weight field means for an exercise, so a Goblet Squat asks for
// the dumbbell's weight while a Push-up treats it as optional added load.
// Read from the exercise name/id (plans don't carry an equipment field per
// exercise) plus the plan's own category for cardio. Plans can be written
// in Spanish, so both languages are recognized.
export type ExerciseLoad =
  | "external" // dumbbell, barbell, kettlebell, machine, cable — the weight lifted
  | "bodyweight" // own body weight; the field is optional added load
  | "assisted" // assistance machine/band: the counterweight, where less is better
  | "band" // resistance band: optional rated resistance
  | "none"; // cardio/mobility: no load to log

// \b doesn't work next to accented letters in JS, so word edges are spelled
// out (start/end or a non-letter).
const LETTER = "a-zA-ZÀ-ÖØ-öø-ÿ";
const word = (pattern: string) => new RegExp(`(?:^|[^${LETTER}])(?:${pattern})(?=$|[^${LETTER}])`, "i");

const EQUIPMENT = word(
  [
    "dumb\\s*bells?", "db", "barbell", "bb", "kettle\\s*bells?", "kb", "machine", "cable", "smith", "ez[- ]?bar", "trap bar", "hex bar",
    "plate", "goblet", "leg press", "pulldown", "press machine", "landmine", "sled", "medicine ball", "med ball",
    // es
    "mancuernas?", "barras?", "pesas? rusas?", "kettlebells?", "máquina", "maquina", "polea", "cables?", "multipower", "prensa",
    "jal[oó]n", "disco", "bal[oó]n medicinal", "trineo",
  ].join("|")
);

const BODYWEIGHT = word(
  [
    "body\\s*weight", "bw", "push[- ]?ups?", "pull[- ]?ups?", "chin[- ]?ups?", "dips?", "planks?", "side plank", "dead\\s*bug", "bird\\s*dog",
    "glute bridge", "bridge", "sit[- ]to[- ]stand", "air squat", "lunges?", "split squat", "step[- ]?ups?", "crunch(?:es)?", "sit[- ]?ups?",
    "burpees?", "mountain climbers?", "hollow", "superman", "y-t-w", "ytw", "table row", "inverted row", "pike", "good morning",
    "calf raise", "wall sit", "leg raises?",
    // es
    "peso corporal", "flexiones?", "lagartijas?", "dominadas?", "fondos?", "planchas?", "plancha lateral", "puente(?: de glúteos?)?",
    "zancadas?", "estocadas?", "desplantes?", "sentadilla búlgara", "subidas? al (?:cajón|banco|escalón)", "abdominales?",
    "escaladores?", "remo invertido", "elevaci[oó]n(?:es)? de (?:piernas|talones|pantorrillas)", "sentadillas? (?:libres?|al aire|sin peso)",
  ].join("|")
);

// Added load on a bodyweight movement ("Weighted Pull-up", "Dominadas
// lastradas"): the field is the extra load, not the body.
const ADDED_LOAD = word("weighted|with (?:a )?(?:vest|belt|plate)|lastrad[oa]s?|con lastre|con chaleco");
const ASSISTED = word("assist(?:ed|ance)?|asistid[oa]s?|asistencia");
// "X or assisted X" / "X o X asistidas": the assisted version is a fallback.
const ASSISTED_FALLBACK = word(`(?:or|o|u)\\s+(?:[${LETTER}-]+\\s+){0,2}(?:assisted|asistid[oa]s?)`);
const BAND = word("bands?|banda(?:s)?|liga(?:s)?|el[aá]stic[oa]s?");
const HARD_EQUIPMENT = word("dumb\\s*bells?|barbell|kettle\\s*bells?|machine|cable|smith|plate|mancuernas?|barras?|máquina|maquina|polea");

export function exerciseLoad(args: { id?: string; name: string; category?: string }): ExerciseLoad {
  const text = `${args.name} ${(args.id ?? "").replace(/[_-]+/g, " ")}`;
  if (args.category === "cardio" || args.category === "mobility" || args.category === "warmup") {
    return EQUIPMENT.test(text) ? "external" : "none";
  }
  // "Pull-Up or Assisted Pull-Up" is a pull-up with a fallback, not a
  // machine exercise.
  if (ASSISTED.test(text) && !ASSISTED_FALLBACK.test(text)) return "assisted";
  if (BAND.test(text) && !HARD_EQUIPMENT.test(text)) return "band";
  if (BODYWEIGHT.test(text) && (ADDED_LOAD.test(text) || !EQUIPMENT.test(text))) return "bodyweight";
  return "external";
}

export function parseExerciseLoad(value: string | undefined): ExerciseLoad | null {
  return value === "external" || value === "bodyweight" || value === "assisted" || value === "band" || value === "none"
    ? value
    : null;
}
