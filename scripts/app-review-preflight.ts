import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const root = process.cwd();
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
  const english = JSON.parse(fs.readFileSync(path.join(root, "locales/en.json"), "utf8"));
  const spanish = JSON.parse(fs.readFileSync(path.join(root, "locales/es.json"), "utf8"));

  assert(appConfig.expo.ios.usesAppleSignIn === true, "ios.usesAppleSignIn must be true");
  assert(
    appConfig.expo.ios.entitlements?.["com.apple.developer.applesignin"]?.includes("Default"),
    "Sign in with Apple entitlement is missing"
  );
  assert(english.camera.permission_button !== "Grant Access", "Prohibited camera permission wording found");
  assert(spanish.camera.permission_button !== "Conceder Acceso", "Prohibited Spanish permission wording found");
  assert(english.common.continue === "Continue", "Camera pre-prompt must use neutral Continue wording");

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  assert(supabaseUrl && anonKey, "Supabase URL and anonymous key are required for provider verification");

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=id_token`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    // Structurally valid unsigned JWT whose issuer lets GoTrue reach the provider-enabled check.
    // Signature verification must still fail; provider_disabled must not.
    body: JSON.stringify({
      provider: "apple",
      id_token: "eyJhbGciOiJub25lIn0.eyJpc3MiOiJodHRwczovL2FwcGxlaWQuYXBwbGUuY29tIn0.",
    }),
  });
  const payload = await response.json().catch(() => ({})) as { error_code?: string; code?: string; msg?: string };
  const errorCode = payload.error_code || payload.code;
  assert(
    errorCode !== "provider_disabled" && !/not enabled/i.test(payload.msg || ""),
    "Production Supabase Apple provider is disabled"
  );

  console.log("App Review preflight passed: camera wording, Apple entitlement, and live provider configuration.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
