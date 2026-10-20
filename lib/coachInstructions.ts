// Custom instructions ("bodyweight only today", "make it 30 minutes", "I
// don't have a gym anymore"). They always win over onboarding answers for
// the workout being built; this module only reads the few things the app can
// act on directly — equipment, session length, and whether the change sounds
// permanent — everything else is passed to Coach as written.
import type { PlanSetupLocation, SessionMinutes } from "@/store/planSetupStore";

export type InstructionOverrides = {
  location?: PlanSetupLocation;
  sessionMinutes?: SessionMinutes;
};

const BODYWEIGHT = /\b(body\s*weight|bodyweight|no equipment|without equipment|calisthenics|peso corporal|sin equipo|sin pesas|sin material)\b/i;
const DUMBBELLS = /\b(dumb\s*bells?|db only|mancuernas?)\b/i;
const FULL_GYM = /\b(full gym|at the gym|back at the gym|gimnasio completo|en el gimnasio)\b/i;
const NO_GYM = /\b(no (?:longer have|have) (?:a |the )?gym|don'?t have (?:a |the )?gym|no gym|without (?:a |the )?gym|sin gimnasio|ya no tengo gimnasio|no tengo gimnasio)\b/i;

const PERMANENT = /\b(any\s*more|no longer|from now on|permanently|for good|going forward|always|every week|moved|cancel(?:l)?ed my (?:gym|membership)|ya no|de ahora en adelante|desde ahora|para siempre|siempre|cancel[eé] (?:el|mi) gimnasio|me mud[eé])\b/i;
const TEMPORARY = /\b(today|tonight|this week|this time|for now|just once|right now|hoy|esta semana|esta vez|por ahora|por hoy)\b/i;

export function parseInstructionOverrides(text: string): InstructionOverrides {
  const overrides: InstructionOverrides = {};
  if (BODYWEIGHT.test(text)) overrides.location = "bodyweight";
  else if (DUMBBELLS.test(text)) overrides.location = "dumbbells_home";
  else if (NO_GYM.test(text)) overrides.location = "bodyweight";
  else if (FULL_GYM.test(text)) overrides.location = "full_gym";

  const minutes = text.match(/(\d{2,3})\s*(?:-?\s*)?(?:min|mins|minutes|minutos)\b/i);
  if (minutes) {
    const value = Number(minutes[1]);
    overrides.sessionMinutes = value <= 37 ? 30 : value <= 52 ? 45 : 60;
  } else if (/\b(half (?:an )?hour|media hora)\b/i.test(text)) {
    overrides.sessionMinutes = 30;
  } else if (/\b(an hour|one hour|una hora)\b/i.test(text)) {
    overrides.sessionMinutes = 60;
  }
  return overrides;
}

// Only a change that sounds lasting — and touches something the profile
// stores — is worth offering to save.
export function isPermanentChange(text: string): boolean {
  if (TEMPORARY.test(text)) return false;
  return PERMANENT.test(text) || NO_GYM.test(text);
}

// With a plan already running, does this message change how the next
// workout should look (as opposed to a question for Coach)?
export function looksLikeWorkoutInstruction(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || /[?？]\s*$/.test(trimmed)) return false;
  const overrides = parseInstructionOverrides(trimmed);
  if (overrides.location || overrides.sessionMinutes) return true;
  return /\b(no running|no jumping|no cardio|no legs|skip (?:legs|cardio|running)|only (?:upper|lower|legs|arms|core)|focus (?:on )?(?:upper|lower|legs|arms|core|chest|back|glutes)|upper body|lower body|make it (?:shorter|longer|easier|harder|lighter)|sin correr|sin saltos|sin cardio|solo (?:tren superior|tren inferior|piernas|brazos|core)|enf[oó]ca(?:te|lo)? en|tren superior|tren inferior|m[aá]s (?:corto|ligero|f[aá]cil|dif[ií]cil))\b/i.test(trimmed);
}
