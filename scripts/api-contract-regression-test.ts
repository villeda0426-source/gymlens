import assert from "node:assert/strict";
import {
  makeApiErrorBody,
  normalizeRequestId,
} from "../server/lib/apiContract";

assert.equal(normalizeRequestId("spotlift-request-123"), "spotlift-request-123");
assert.notEqual(normalizeRequestId("bad id with spaces"), "bad id with spaces");
assert.notEqual(normalizeRequestId("short"), "short");

assert.deepEqual(
  makeApiErrorBody(
    "spotlift-request-123",
    "PROVIDER_TIMEOUT",
    "The AI provider took too long to respond.",
    true
  ),
  {
    error: "The AI provider took too long to respond.",
    code: "PROVIDER_TIMEOUT",
    retryable: true,
    requestId: "spotlift-request-123",
  }
);

console.log("API contract regression checks passed.");
