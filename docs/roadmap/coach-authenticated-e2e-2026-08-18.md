# Authenticated Coach Persistence Verification

Test date: August 18, 2026  
Environment: production API and production Supabase  
Account: temporary synthetic account, deleted at completion  
Harness: `scripts/coach-authenticated-e2e.ts`

## Result

- Authenticated Coach job creation and ownership: pass
- Server stage-timing persistence: pass
- Client timing merge: pass
- Workout feedback persistence: pass
- Latest Coach review readback: pass
- In-app account-deletion API: pass
- Temporary authentication user cleanup: pass

No recruited-user or founder account data was changed. The temporary account and associated records were removed through the production account-deletion flow.

## Observed timing

| Stage | Result |
|---|---:|
| Queue | 66 ms |
| OpenAI | 24,679 ms |
| Validation | <1 ms at millisecond clock resolution |
| Retry | 0 ms |
| Attempts | 1 |
| Fallback used | No |
| Server processing | 24,990 ms |
| Database save | 329 ms |
| Client job-start request | 533 ms |
| Client polling | 26,844 ms |
| Poll requests | 10 |
| Response to simulated rendered frame | 1 ms |
| Total client-perceived time | 27,377 ms |

## Interpretation

For this single job, OpenAI accounted for nearly all server processing time. Queueing and database persistence were small. Client polling added approximately 1.85 seconds beyond server processing because the client checks every 2.5 seconds.

This is only one sample. It is enough to verify instrumentation and suggest where latency lives, but not enough to change the model, output size, or polling strategy.

## Boundaries verified

```text
Temporary authenticated user
  → create owned Coach background job
  → poll only the owned job
  → OpenAI plan generation
  → validated plan persisted
  → server timing persisted
  → client timing merged
  → workout feedback saved
  → latest review read back
  → account and associated data deleted
```

## Next evidence requirement

- Accumulate at least 30 successful jobs before treating p50/p95 as representative.
- Segment by language, attempts, fallback use, and plan outcome.
- Compare `openAiMs` against output token counts.
- Consider a shorter polling interval or push completion only if client wait consistently exceeds server completion materially.

