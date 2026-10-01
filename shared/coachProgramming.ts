/**
 * Coachlift beginner programming data (exercise library + templates + prescription).
 *
 * EVIDENCE KEY (use in comments/UI copy decisions):
 *  [ACSM09]  ACSM 2009 position stand, novice: 2-3 full-body days, 1-3 sets, 8-12 reps, 1-2 min rest, multi-joint first.
 *  [ACSM26]  ACSM 2026 position stand (Phillips et al., MSSE 58(4)): every major muscle >= 2x/week,
 *            ~10 sets/muscle/week for hypertrophy; failure, machines-vs-free-weights, complex periodization not required.
 *  [COACH]   Coaching judgment / convention. Reasonable and conservative, NOT directly stated by the above. Review before launch.
 *
 * The builder (code) owns every number in this file. The AI may only choose among options listed here.
 */

export type Tier = 'bodyweight' | 'home_gear' | 'gym';
export const TIER_RANK: Record<Tier, number> = { bodyweight: 0, home_gear: 1, gym: 2 };

export type Level = 'beginner' | 'intermediate';
export type Pattern =
  | 'squat' | 'hinge' | 'horizontal_push' | 'horizontal_pull'
  | 'vertical_push' | 'vertical_pull' | 'single_leg' | 'core'
  | 'calves' | 'biceps' | 'triceps' | 'lateral_delt';
export type Muscle =
  | 'quads' | 'hamstrings' | 'glutes' | 'chest' | 'back'
  | 'shoulders' | 'biceps' | 'triceps' | 'core' | 'calves';
export type Area = 'shoulder' | 'elbow' | 'wrist' | 'lower_back' | 'hip' | 'knee' | 'ankle' | 'neck';

export interface Exercise {
  id: string;
  en: string;
  es: string; // needs native-speaker review
  pattern: Pattern;
  primary: Muscle[];   // counts 1.0 set toward weekly volume
  secondary: Muscle[]; // counts 0.5 set (fractional counting, per the 2025 volume meta-regression)
  minTier: Tier;       // available to users whose tier rank >= this
  level: Level;
  avoidFor: Area[];    // if user flagged the area, skip this exercise (pick next in the pattern's list)
  timed?: boolean;     // prescribe seconds instead of reps
  cue: string;         // one plain-language form cue (AI may rephrase, not change meaning)
}

// ORDER MATTERS: within a pattern, earlier = preferred for beginners (stable, easy to learn, low skill).
export const EXERCISES: Exercise[] = [
  // ---- SQUAT ----
  { id: 'goblet_squat', en: 'Goblet squat', es: 'Sentadilla goblet', pattern: 'squat', primary: ['quads', 'glutes'], secondary: ['core'], minTier: 'home_gear', level: 'beginner', avoidFor: ['knee'], cue: 'Hold the weight at your chest, sit down between your knees, keep your chest tall.' },
  { id: 'leg_press', en: 'Leg press', es: 'Prensa de piernas', pattern: 'squat', primary: ['quads', 'glutes'], secondary: ['hamstrings'], minTier: 'gym', level: 'beginner', avoidFor: ['knee'], cue: 'Feet shoulder-width, lower until knees are at about 90 degrees, push through your whole foot. Never lock your knees hard.' },
  { id: 'box_squat_bw', en: 'Sit-to-stand squat (to a chair)', es: 'Sentadilla a la silla', pattern: 'squat', primary: ['quads', 'glutes'], secondary: [], minTier: 'bodyweight', level: 'beginner', avoidFor: ['knee'], cue: 'Sit back to a chair, tap it lightly, stand up without using your hands.' },
  { id: 'bodyweight_squat', en: 'Bodyweight squat', es: 'Sentadilla con peso corporal', pattern: 'squat', primary: ['quads', 'glutes'], secondary: [], minTier: 'bodyweight', level: 'beginner', avoidFor: ['knee'], cue: 'Feet shoulder-width, sit down and back, knees track over toes.' },

  // ---- HINGE ----
  { id: 'db_rdl', en: 'Dumbbell Romanian deadlift', es: 'Peso muerto rumano con mancuernas', pattern: 'hinge', primary: ['hamstrings', 'glutes'], secondary: ['back'], minTier: 'home_gear', level: 'beginner', avoidFor: ['lower_back'], cue: 'Soft knees, push your hips back like closing a car door, flat back, stop when you feel your hamstrings stretch.' },
  { id: 'hip_thrust_bench', en: 'Hip thrust (bench or couch)', es: 'Empuje de cadera', pattern: 'hinge', primary: ['glutes'], secondary: ['hamstrings'], minTier: 'home_gear', level: 'beginner', avoidFor: [], cue: 'Upper back on the bench, drive hips up, squeeze glutes at the top, chin slightly tucked.' },
  { id: 'glute_bridge', en: 'Glute bridge', es: 'Puente de glúteos', pattern: 'hinge', primary: ['glutes'], secondary: ['hamstrings'], minTier: 'bodyweight', level: 'beginner', avoidFor: [], cue: 'Lie on your back, feet flat, push hips up, pause and squeeze at the top.' },
  { id: 'seated_leg_curl', en: 'Seated leg curl', es: 'Curl femoral sentado', pattern: 'hinge', primary: ['hamstrings'], secondary: [], minTier: 'gym', level: 'beginner', avoidFor: [], cue: 'Curl heels down and back with control, do not let the weight slam.' },
  { id: 'bw_good_morning', en: 'Bodyweight hip hinge (good morning)', es: 'Buenos días con peso corporal', pattern: 'hinge', primary: ['hamstrings', 'glutes'], secondary: [], minTier: 'bodyweight', level: 'beginner', avoidFor: ['lower_back'], cue: 'Hands behind head, push hips back with a flat back, stand tall by squeezing glutes.' },

  // ---- HORIZONTAL PUSH ----
  { id: 'machine_chest_press', en: 'Machine chest press', es: 'Press de pecho en máquina', pattern: 'horizontal_push', primary: ['chest'], secondary: ['triceps', 'shoulders'], minTier: 'gym', level: 'beginner', avoidFor: ['shoulder'], cue: 'Adjust the seat so handles are at mid-chest, press out without shrugging, return slowly.' },
  { id: 'db_floor_press', en: 'Dumbbell floor press', es: 'Press con mancuernas en el suelo', pattern: 'horizontal_push', primary: ['chest'], secondary: ['triceps', 'shoulders'], minTier: 'home_gear', level: 'beginner', avoidFor: ['shoulder'], cue: 'Elbows about 45 degrees from your body, lower until upper arms touch the floor, press up.' },
  { id: 'incline_pushup', en: 'Incline push-up (hands on bench/counter)', es: 'Flexiones inclinadas', pattern: 'horizontal_push', primary: ['chest'], secondary: ['triceps', 'shoulders', 'core'], minTier: 'bodyweight', level: 'beginner', avoidFor: ['wrist', 'shoulder'], cue: 'Body in one straight line, lower your chest to the edge, push away. Lower the surface over time.' },
  { id: 'db_bench_press', en: 'Dumbbell bench press', es: 'Press de banca con mancuernas', pattern: 'horizontal_push', primary: ['chest'], secondary: ['triceps', 'shoulders'], minTier: 'gym', level: 'beginner', avoidFor: ['shoulder'], cue: 'Shoulder blades pinched back and down, lower to chest level, press up over your shoulders.' },
  { id: 'pushup', en: 'Push-up', es: 'Flexiones', pattern: 'horizontal_push', primary: ['chest'], secondary: ['triceps', 'shoulders', 'core'], minTier: 'bodyweight', level: 'intermediate', avoidFor: ['wrist', 'shoulder'], cue: 'Straight line head to heels, chest to the floor, elbows about 45 degrees.' },

  // ---- HORIZONTAL PULL ----
  { id: 'seated_cable_row', en: 'Seated cable row', es: 'Remo sentado en polea', pattern: 'horizontal_pull', primary: ['back'], secondary: ['biceps'], minTier: 'gym', level: 'beginner', avoidFor: ['lower_back'], cue: 'Chest tall, pull the handle to your belly, squeeze shoulder blades together, do not rock.' },
  { id: 'chest_supported_row', en: 'Chest-supported row machine', es: 'Remo con apoyo de pecho', pattern: 'horizontal_pull', primary: ['back'], secondary: ['biceps'], minTier: 'gym', level: 'beginner', avoidFor: [], cue: 'Chest on the pad, pull elbows back, pause, lower slowly.' },
  { id: 'one_arm_db_row', en: 'One-arm dumbbell row', es: 'Remo con mancuerna a una mano', pattern: 'horizontal_pull', primary: ['back'], secondary: ['biceps'], minTier: 'home_gear', level: 'beginner', avoidFor: ['lower_back'], cue: 'Hand and knee on a bench, flat back, pull the weight to your hip, no twisting.' },
  { id: 'band_row', en: 'Resistance band row', es: 'Remo con banda', pattern: 'horizontal_pull', primary: ['back'], secondary: ['biceps'], minTier: 'home_gear', level: 'beginner', avoidFor: [], cue: 'Anchor the band at chest height, pull elbows back, squeeze shoulder blades.' },
  { id: 'table_row', en: 'Under-table row (sturdy table only)', es: 'Remo bajo la mesa', pattern: 'horizontal_pull', primary: ['back'], secondary: ['biceps'], minTier: 'bodyweight', level: 'intermediate', avoidFor: ['shoulder'], cue: 'Only use a very sturdy table. Body straight, pull your chest to the edge.' },
  { id: 'prone_ytw', en: 'Prone Y-T-W raise', es: 'Elevaciones Y-T-W boca abajo', pattern: 'horizontal_pull', primary: ['back'], secondary: ['shoulders'], minTier: 'bodyweight', level: 'beginner', avoidFor: ['lower_back'], cue: 'Lie face down, lift arms in a Y, then T, then W shape, slow and light.' },

  // ---- VERTICAL PUSH ----
  { id: 'db_shoulder_press_seated', en: 'Seated dumbbell shoulder press', es: 'Press de hombros sentado con mancuernas', pattern: 'vertical_push', primary: ['shoulders'], secondary: ['triceps'], minTier: 'home_gear', level: 'beginner', avoidFor: ['shoulder', 'neck'], cue: 'Back supported, press up without arching, stop short of locking elbows.' },
  { id: 'machine_shoulder_press', en: 'Machine shoulder press', es: 'Press de hombros en máquina', pattern: 'vertical_push', primary: ['shoulders'], secondary: ['triceps'], minTier: 'gym', level: 'beginner', avoidFor: ['shoulder', 'neck'], cue: 'Handles at shoulder height, press straight up, ribs down.' },
  { id: 'pike_pushup_elevated', en: 'Hands-elevated pike push-up', es: 'Flexión en pica con manos elevadas', pattern: 'vertical_push', primary: ['shoulders'], secondary: ['triceps'], minTier: 'bodyweight', level: 'intermediate', avoidFor: ['shoulder', 'wrist', 'neck'], cue: 'Hips high, hands on a bench, lower the top of your head toward it, press back.' },

  // ---- VERTICAL PULL ----
  { id: 'lat_pulldown', en: 'Lat pulldown', es: 'Jalón al pecho', pattern: 'vertical_pull', primary: ['back'], secondary: ['biceps'], minTier: 'gym', level: 'beginner', avoidFor: ['shoulder'], cue: 'Lean back slightly, pull the bar to upper chest, elbows down, control the way up.' },
  { id: 'assisted_pullup', en: 'Assisted pull-up machine', es: 'Dominadas asistidas', pattern: 'vertical_pull', primary: ['back'], secondary: ['biceps'], minTier: 'gym', level: 'intermediate', avoidFor: ['shoulder', 'elbow'], cue: 'Start with a lot of assistance, pull chest toward the bar, lower slowly.' },
  { id: 'band_pulldown', en: 'Band pulldown', es: 'Jalón con banda', pattern: 'vertical_pull', primary: ['back'], secondary: ['biceps'], minTier: 'home_gear', level: 'beginner', avoidFor: ['shoulder'], cue: 'Anchor the band overhead (door anchor), pull elbows down to your ribs.' },
  { id: 'band_pull_apart', en: 'Band pull-apart', es: 'Apertura con banda', pattern: 'vertical_pull', primary: ['back'], secondary: ['shoulders'], minTier: 'home_gear', level: 'beginner', avoidFor: [], cue: 'Arms straight in front, pull the band apart to chest level, squeeze shoulder blades.' },

  // ---- SINGLE LEG ----
  { id: 'split_squat_supported', en: 'Split squat (hold a wall or rail)', es: 'Zancada dividida con apoyo', pattern: 'single_leg', primary: ['quads', 'glutes'], secondary: ['hamstrings'], minTier: 'bodyweight', level: 'beginner', avoidFor: ['knee', 'hip'], cue: 'Long stance, drop your back knee straight down, keep your front heel planted.' },
  { id: 'step_up', en: 'Step-up (low box or stair)', es: 'Subida al escalón', pattern: 'single_leg', primary: ['quads', 'glutes'], secondary: ['hamstrings'], minTier: 'bodyweight', level: 'beginner', avoidFor: ['knee', 'ankle'], cue: 'Whole foot on the step, drive through the front leg, lower slowly, do not push off the back foot.' },
  { id: 'reverse_lunge', en: 'Reverse lunge', es: 'Zancada hacia atrás', pattern: 'single_leg', primary: ['quads', 'glutes'], secondary: ['hamstrings'], minTier: 'bodyweight', level: 'intermediate', avoidFor: ['knee', 'hip'], cue: 'Step back, lower under control, push through the front heel to return.' },

  // ---- CORE ----
  { id: 'dead_bug', en: 'Dead bug', es: 'Bicho muerto', pattern: 'core', primary: ['core'], secondary: [], minTier: 'bodyweight', level: 'beginner', avoidFor: [], cue: 'Low back pressed into the floor, slowly extend opposite arm and leg, return.' },
  { id: 'plank_knees_or_full', en: 'Plank', es: 'Plancha', pattern: 'core', primary: ['core'], secondary: ['shoulders'], minTier: 'bodyweight', level: 'beginner', avoidFor: ['wrist', 'shoulder'], timed: true, cue: 'Forearms down, body in a straight line, squeeze glutes and abs. Drop to knees if needed.' },
  { id: 'bird_dog', en: 'Bird dog', es: 'Perro-pájaro', pattern: 'core', primary: ['core'], secondary: ['glutes', 'back'], minTier: 'bodyweight', level: 'beginner', avoidFor: ['wrist'], cue: 'Reach opposite arm and leg long, keep hips level, pause, switch.' },
  { id: 'side_plank', en: 'Side plank (knees bent ok)', es: 'Plancha lateral', pattern: 'core', primary: ['core'], secondary: [], minTier: 'bodyweight', level: 'beginner', avoidFor: ['shoulder'], timed: true, cue: 'Elbow under shoulder, lift hips, hold a straight line.' },

  // ---- ACCESSORIES (only added when time allows; 60-min sessions) ----
  { id: 'standing_calf_raise', en: 'Standing calf raise', es: 'Elevación de talones de pie', pattern: 'calves', primary: ['calves'], secondary: [], minTier: 'bodyweight', level: 'beginner', avoidFor: ['ankle'], cue: 'Rise slowly onto your toes, pause, lower fully.' },
  { id: 'db_biceps_curl', en: 'Dumbbell biceps curl', es: 'Curl de bíceps con mancuernas', pattern: 'biceps', primary: ['biceps'], secondary: [], minTier: 'home_gear', level: 'beginner', avoidFor: ['elbow', 'wrist'], cue: 'Elbows pinned to your sides, curl up, lower for 2 seconds.' },
  { id: 'cable_triceps_pushdown', en: 'Cable triceps pushdown', es: 'Extensión de tríceps en polea', pattern: 'triceps', primary: ['triceps'], secondary: [], minTier: 'gym', level: 'beginner', avoidFor: ['elbow'], cue: 'Elbows at your sides, push down until arms are straight, control the return.' },
  { id: 'band_triceps_extension', en: 'Band triceps extension', es: 'Extensión de tríceps con banda', pattern: 'triceps', primary: ['triceps'], secondary: [], minTier: 'home_gear', level: 'beginner', avoidFor: ['elbow'], cue: 'Elbows at your sides, straighten arms against the band.' },
  { id: 'lateral_raise', en: 'Dumbbell lateral raise (light)', es: 'Elevaciones laterales (ligero)', pattern: 'lateral_delt', primary: ['shoulders'], secondary: [], minTier: 'home_gear', level: 'beginner', avoidFor: ['shoulder', 'neck'], cue: 'Light weight, raise arms out to shoulder height with a slight elbow bend, no swinging.' },
];

// ---------------- TEMPLATES ----------------
// Slots are listed in PRIORITY order. The builder adds slots in order until the time budget is used
// (minimum 4 slots). `variant` picks the 1st (0) or 2nd (1) eligible exercise so day A and day B differ.
export interface Slot { pattern: Pattern; role: 'main' | 'accessory' | 'core'; variant?: 0 | 1 }
export interface DayTemplate { id: string; name: string; slots: Slot[] }

export const DAYS: Record<string, DayTemplate> = {
  FULL_A: { id: 'FULL_A', name: 'Full body A', slots: [
    { pattern: 'squat', role: 'main' },
    { pattern: 'horizontal_push', role: 'main' },
    { pattern: 'horizontal_pull', role: 'main' },
    { pattern: 'hinge', role: 'main' },
    { pattern: 'vertical_push', role: 'main' },
    { pattern: 'core', role: 'core' },
    { pattern: 'calves', role: 'accessory' },
    { pattern: 'biceps', role: 'accessory' },
  ]},
  FULL_B: { id: 'FULL_B', name: 'Full body B', slots: [
    { pattern: 'hinge', role: 'main', variant: 1 },
    { pattern: 'vertical_pull', role: 'main' },
    { pattern: 'horizontal_push', role: 'main', variant: 1 },
    { pattern: 'single_leg', role: 'main' },
    { pattern: 'horizontal_pull', role: 'main', variant: 1 },
    { pattern: 'core', role: 'core', variant: 1 },
    { pattern: 'triceps', role: 'accessory' },
    { pattern: 'lateral_delt', role: 'accessory' },
  ]},
  UPPER_A: { id: 'UPPER_A', name: 'Upper A', slots: [
    { pattern: 'horizontal_push', role: 'main' },
    { pattern: 'horizontal_pull', role: 'main' },
    { pattern: 'vertical_push', role: 'main' },
    { pattern: 'vertical_pull', role: 'main' },
    { pattern: 'biceps', role: 'accessory' },
    { pattern: 'triceps', role: 'accessory' },
    { pattern: 'lateral_delt', role: 'accessory' },
  ]},
  LOWER_A: { id: 'LOWER_A', name: 'Lower A', slots: [
    { pattern: 'squat', role: 'main' },
    { pattern: 'hinge', role: 'main' },
    { pattern: 'single_leg', role: 'main' },
    { pattern: 'core', role: 'core' },
    { pattern: 'calves', role: 'accessory' },
  ]},
  UPPER_B: { id: 'UPPER_B', name: 'Upper B', slots: [
    { pattern: 'vertical_pull', role: 'main' },
    { pattern: 'horizontal_push', role: 'main', variant: 1 },
    { pattern: 'horizontal_pull', role: 'main', variant: 1 },
    { pattern: 'vertical_push', role: 'main', variant: 1 },
    { pattern: 'triceps', role: 'accessory' },
    { pattern: 'biceps', role: 'accessory' },
    { pattern: 'lateral_delt', role: 'accessory' },
  ]},
  LOWER_B: { id: 'LOWER_B', name: 'Lower B', slots: [
    { pattern: 'hinge', role: 'main' },
    { pattern: 'squat', role: 'main', variant: 1 },
    { pattern: 'single_leg', role: 'main', variant: 1 },
    { pattern: 'core', role: 'core', variant: 1 },
    { pattern: 'calves', role: 'accessory' },
  ]},
};

// daysPerWeek -> which day templates, by experience. [COACH] caps: Brand new maxes at 3 lifting days.
// Non-lifting days are optional easy movement (walk/mobility) and carry NO sets.
export type Experience = 'brand_new' | 'some' | 'consistent';
export const WEEK_LAYOUT: Record<Experience, Record<number, string[]>> = {
  brand_new: { 2: ['FULL_A', 'FULL_B'], 3: ['FULL_A', 'FULL_B', 'FULL_A'], 4: ['FULL_A', 'FULL_B', 'FULL_A'], 5: ['FULL_A', 'FULL_B', 'FULL_A'], 6: ['FULL_A', 'FULL_B', 'FULL_A'] },
  some:      { 2: ['FULL_A', 'FULL_B'], 3: ['FULL_A', 'FULL_B', 'FULL_A'], 4: ['UPPER_A', 'LOWER_A', 'UPPER_B', 'LOWER_B'], 5: ['UPPER_A', 'LOWER_A', 'UPPER_B', 'LOWER_B'], 6: ['UPPER_A', 'LOWER_A', 'UPPER_B', 'LOWER_B'] },
  consistent:{ 2: ['FULL_A', 'FULL_B'], 3: ['FULL_A', 'FULL_B', 'FULL_A'], 4: ['UPPER_A', 'LOWER_A', 'UPPER_B', 'LOWER_B'], 5: ['UPPER_A', 'LOWER_A', 'UPPER_B', 'LOWER_B', 'FULL_A'], 6: ['UPPER_A', 'LOWER_A', 'UPPER_B', 'LOWER_B', 'FULL_B', 'FULL_A'] },
};
// Any requested days beyond the lifting days listed above become "easy days" (20-30 min walk or mobility).

// ---------------- PRESCRIPTION ----------------
export interface WeekRx { sets: number; effort: string; note: string }
export const PRESCRIPTION = {
  // [ACSM09] 8-12 reps, 1-2 min rest. [ACSM26] failure not required -> effort is "reps left in the tank".
  repRange: { main: [8, 12], accessory: [10, 15] } as const,
  timedSeconds: [20, 40] as const, // plank-type holds; progress by +5 s
  restSeconds: { main: 90, accessory: 60, core: 45 } as const,
  // [COACH] ramp-in so brand-new people learn the movements before volume rises.
  weeks: {
    brand_new:  [ { sets: 2, effort: '3-4 reps left', note: 'Learn the movements. Find a weight you can lift 10 times with 3-4 reps left.' },
                  { sets: 2, effort: '3 reps left',   note: 'Add a little weight or a rep or two where it felt easy.' },
                  { sets: 3, effort: '2-3 reps left', note: 'Third set added to the main lifts.' } ],
    some:       [ { sets: 2, effort: '3 reps left',   note: 'Re-learn the movements.' },
                  { sets: 3, effort: '2-3 reps left', note: 'Full volume.' } ],
    consistent: [ { sets: 3, effort: '2-3 reps left', note: 'Full volume from week 1.' } ],
  } as Record<Experience, WeekRx[]>, // weeks beyond the array repeat the last entry
  // Weekly hard-set targets per muscle (primary=1.0, secondary=0.5). [ACSM26] ~10/wk for hypertrophy; lower while new. [COACH] bands.
  weeklySetTargets: { brand_new: [6, 10], some: [8, 12], consistent: [10, 14] } as Record<Experience, [number, number]>,
  // Goal tweaks. Only emphasis changes; the skeleton is the same. [COACH]
  goalAdjust: {
    strength:   { mainReps: [6, 10] as [number, number], mainRestSeconds: 120, minExperienceForHeavier: 'some' as Experience },
    muscle:     { mainReps: [8, 12] as [number, number], accessoryReps: [10, 15] as [number, number] },
    lose_fat:   { mainReps: [8, 12] as [number, number], optionalFinisher: '5 to 10 minutes of brisk walking or easy bike' },
    feel_fitter:{ mainReps: [8, 12] as [number, number], optionalFinisher: '5 to 10 minutes of brisk walking or easy bike' },
  },
  // Double progression. [COACH] convention.
  progression: {
    rule: 'When you hit the top of the rep range on every set with clean form and 1+ reps left, add the smallest weight next session.',
    increments: { dumbbell: '1-2.5 kg (2.5-5 lb) per hand', machine: 'next pin/plate', bodyweight: 'move to a harder variation', band: 'next band or a slower tempo' },
    onMiss: 'Missed the bottom of the range two sessions in a row: keep or drop the weight about 10%, then build back up.',
    firstSession: 'No guessing loads. In session 1 pick a weight you can lift 10 times with 3-4 reps left, then log it.',
  },
  // Daily check-in autoregulation [COACH]: Fresh/Okay = as planned. A bit sore = 1 fewer set per exercise, same weights, no extra reps.
  checkIn: { fresh: 0, okay: 0, a_bit_sore: -1 },
  // Session time estimate. [COACH] Add slots in priority order until estimate would exceed the budget.
  timing: { warmupMinutes: 5, secondsPerSet: 45, transitionSeconds: 30 },
  warmup: 'Easy 3-5 min walk/bike, then 1-2 light practice sets of the first exercise.',
};

export function estimateMinutes(slotsWithSets: { sets: number; role: 'main' | 'accessory' | 'core' }[]): number {
  const t = PRESCRIPTION.timing;
  let sec = 0;
  for (const s of slotsWithSets) {
    sec += s.sets * (t.secondsPerSet + PRESCRIPTION.restSeconds[s.role]) + t.transitionSeconds;
  }
  return Math.round(t.warmupMinutes + sec / 60);
}

// If no eligible exercise exists for a slot (e.g. bodyweight-only has no vertical pull, or a limitation removes every option),
// use this fallback pattern; if none, skip the slot. Never invent an exercise. [COACH]
export const SLOT_FALLBACK: Partial<Record<Pattern, { pattern: Pattern; variant?: 0 | 1 } | null>> = {
  vertical_pull: { pattern: 'horizontal_pull', variant: 1 },
  vertical_push: { pattern: 'horizontal_push', variant: 1 },
  single_leg: { pattern: 'hinge', variant: 1 },
  hinge: { pattern: 'squat', variant: 1 },
  squat: { pattern: 'single_leg' },
  horizontal_push: { pattern: 'vertical_push' },
  horizontal_pull: { pattern: 'vertical_pull' },
  biceps: null, triceps: null, lateral_delt: null, calves: null, core: null,
};
// Known gap: with 3 lifting days, "consistent" users land at ~9 weekly sets for quads/hamstrings/chest.
// Builder should add accessory sets for under-target muscles if time allows, else suggest a 4th day.
