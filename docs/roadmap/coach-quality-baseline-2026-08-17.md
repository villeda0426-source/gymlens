# Coach Quality Controlled Baseline

Test date: August 17, 2026  
Model: `gpt-5-mini`  
Data: synthetic athlete profiles only  
Harness: `scripts/coach-quality-baseline.ts`

## Executive result

- Plan scenarios passed: **20/20 (100%)**
- Full-plan adaptations passed: **4/4 (100%)**
- Languages: English and Spanish
- Median plan latency: **48.4 seconds**
- Average plan latency: **49.4 seconds**
- p95 plan latency: **54.5 seconds**
- Fastest plan: **26.3 seconds**
- Slowest plan: **98.9 seconds**
- Mobile and server TypeScript checks: passed after the test

This baseline proves that the current Coach contract can repeatedly produce schema-valid, mobile-sized plans and progress completed plans in controlled conditions. It does not yet prove that every prescription is expert-optimal or that real users understand the interface.

## User story verified

The tested story is:

```text
Synthetic user goal, schedule, equipment, experience, limitations, units, and language
  → Coach intake service
  → OpenAI response
  → JSON repair/schema validation
  → plan guardrails
  → deterministic workout feedback decisions
  → full-plan completion signal
  → OpenAI next-block adaptation
  → validated updated plan
```

The corresponding application flow was also traced in code:

```text
Trainer intake UI
  → authenticated background Coach job
  → saved plan and plan-linked thread
  → Plan tab exercise completion
  → weekly checkpoint after the final exercise of the week
  → structured feedback save
  → new progression job only when planComplete=true
  → updated plan and follow-up message saved to the active Coach thread
```

## Scenario matrix

Every scenario was run once in English and once in Spanish.

| Scenario | English | Spanish | Primary constraint |
|---|---:|---:|---|
| Complete beginner / general fitness | Pass | Pass | 3 days, full gym, confidence |
| Returning strength user | Pass | Pass | 4 days, conservative return |
| Short fat-loss/conditioning plan | Pass | Pass | 30-minute limit, no extremes |
| Home limited equipment | Pass | Pass | Dumbbells, bench, bands |
| Machines-only hypertrophy | Pass | Pass | No barbells |
| Knee limitation | Pass | Pass | Pain during deep knee bending |
| Missed-week schedule | Pass | Pass | Minimum-effective 2-day plan |
| Older returning user | Pass | Pass | Age 62, conservative start |
| Endurance plus strength | Pass | Pass | Improve 5K without losing strength |
| Bodyweight travel plan | Pass | Pass | Hotel room, no equipment |

## Automated checks applied to every plan

### Contract and mobile constraints

- Response reached `plan_ready` rather than remaining in intake.
- Plan passed the production `isPlan` schema validator.
- Units matched the request.
- Timeline was three weeks.
- `days_per_week` and first-week session count matched the user's schedule.
- Plan contained no more than four sessions and five exercises per session.
- Exercise IDs were present and unique inside the plan.
- Sets, rep ranges, rest, progression rules, and coaching notes were structurally valid.
- Estimated session duration respected the requested limit with a five-minute tolerance.

### Language and safety constraints

- Spanish plans contained Spanish training language rather than an English-only response.
- The knee-limitation cases contained a safety flag or clear professional-evaluation language.
- The gradual fat-loss cases did not request extreme programming and remained inside the standard plan contract.

### Feedback-engine decisions

Every generated plan passed these deterministic decisions:

- First manageable completion: record success and hold the plan steady.
- Second comparable manageable completion: unlock a conservative rep-or-load progression.
- High-effort completion: hold load and volume rather than progress.
- Pain report: escalate for individualized AI/safety judgment.
- Full-plan completion: escalate to creation of the next progression block.

## Full-plan adaptation checks

Four scenarios continued beyond plan completion:

| Scenario | Language | Result |
|---|---|---:|
| Complete beginner / general fitness | English | Pass |
| Complete beginner / general fitness | Spanish | Pass |
| Returning strength user | English | Pass |
| Returning strength user | Spanish | Pass |

Pass required:

- a `plan_updated` response;
- a plan that still passed the production schema;
- at least one explicit change explaining the next block.

## Flow status

| Boundary | Status | Evidence |
|---|---|---|
| Intake → model | Pass | 20 complete responses |
| Model → JSON/schema | Pass | 20 plans accepted by `isPlan` and guardrails |
| Schema → feedback engine | Pass | Five decision classes passed for every plan |
| Plan completion → adaptation | Pass | 4/4 next-block adaptations |
| English/Spanish contract | Pass | 10/10 scenarios passed in both languages |
| Client UI → production API | Previously verified | Production release smoke suite passed; not re-mutated with synthetic accounts in this run |
| Database feedback persistence | Not exercised in this run | Requires authenticated sacrificial test account |
| Physical-device rendering/interaction | Not exercised in this run | Requires TestFlight/device pass |
| Human expert prescription review | Not yet complete | Automated structure checks cannot judge every biomechanical/programming choice |

## Findings

### Working well

- The prompt is sufficiently decisive when the initial message contains all essentials; no scenario stalled in unnecessary follow-up questions.
- Plan structure remained inside the mobile response limit.
- English and Spanish produced equivalent contract results.
- Rules-first feedback handled ordinary progression without additional model calls.
- Pain and full-plan completion were correctly reserved for higher-judgment paths.
- The complete-plan adaptation contract returned explicit changes in all tested cases.

### Main risk — latency

Median generation time was 48.4 seconds. One Spanish returning-strength request took 98.9 seconds. This is within the current long-running job design but is long enough to create abandonment or the perception that the app froze.

Required follow-up:

1. Measure job creation time, queue time, model time, validation/retry time, and client polling time separately.
2. Show trustworthy progress states during generation.
3. Track p50/p95 by language, model, success, retry, and build.
4. Investigate whether output size can be reduced without harming coaching quality.
5. Keep the background-job recovery path; do not return to a single fragile foreground request.

## Important limitations

- Automated checks confirm contracts and explicit constraints, not elite-coach correctness.
- The run did not save synthetic feedback into a real user's database.
- It did not tap through every screen on a physical device.
- It did not verify whether exercise tutorial search returns a strong result for every generated exercise.
- It did not test contradictory, malicious, medically complex, pregnancy, chest-pain, eating-disorder, or post-surgery prompts.
- It did not measure recruited-user trust, comprehension, or willingness to return.
- A 100% result here must not be presented as 100% real-world coaching quality.

## Next test layer

1. Manually review the 20-plan matrix using the 1–5 expert-quality rubric.
2. Add high-risk safety/refusal scenarios before broad recruitment.
3. Run one authenticated sacrificial account through feedback persistence and account deletion.
4. Run the complete journey on TestFlight in English and Spanish.
5. Begin ten observed-user sessions after critical controlled defects are cleared.

