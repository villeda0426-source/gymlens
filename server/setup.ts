/**
 * Creates the SpotLift database schema in Supabase.
 * Requires SUPABASE_DB_PASSWORD in .env (find it at:
 *   Supabase Dashboard → Project Settings → Database → Database password)
 *
 * Run once: npx ts-node --project server/tsconfig.json server/setup.ts
 */
import "dotenv/config";
import { Client } from "pg";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password) {
    console.error(
      "\n❌  SUPABASE_DB_PASSWORD is not set.\n" +
      "    1. Go to: https://supabase.com/dashboard/project/oododetbegvhnhmwfgoq/settings/database\n" +
      "    2. Copy your database password\n" +
      "    3. Add to .env:  SUPABASE_DB_PASSWORD=<your-password>\n" +
      "    4. Re-run: npm run setup\n"
    );
    process.exit(1);
  }

  const ref = "oododetbegvhnhmwfgoq";
  const client = new Client({
    host: `db.${ref}.supabase.co`,
    port: 5432,
    database: "postgres",
    user: "postgres",
    password,
    ssl: { rejectUnauthorized: false },
  });

  console.log("Connecting to Supabase Postgres...");
  await client.connect();
  console.log("Connected ✓");

  const schemaPath = path.join(__dirname, "../supabase/schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");

  // Split on statement boundaries and run each separately so partial errors are
  // visible. Naively splitting on ";\n" breaks plpgsql function bodies (they
  // contain their own semicolons inside $$...$$ dollar-quoting), so track
  // dollar-quote state and only treat ";\n" as a boundary outside of it.
  const statements: string[] = [];
  let current = "";
  let inDollarQuote = false;
  for (const line of sql.split("\n")) {
    current += (current ? "\n" : "") + line;
    const dollarMatches = line.match(/\$\$/g);
    if (dollarMatches) {
      for (let i = 0; i < dollarMatches.length; i++) inDollarQuote = !inDollarQuote;
    }
    if (!inDollarQuote && /;\s*$/.test(line)) {
      statements.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) statements.push(current.trim());
  const filteredStatements = statements.filter((s) => s.length > 0);

  let ok = 0;
  for (const stmt of filteredStatements) {
    try {
      await client.query(stmt);
      ok++;
    } catch (e: any) {
      // "already exists" errors are fine when re-running
      if (e.code === "42P07" || e.code === "42710" || e.message.includes("already exists")) {
        // ignore
      } else {
        console.warn(`  ⚠  ${e.message.slice(0, 120)}`);
      }
    }
  }

  console.log(`✓ Schema applied (${ok}/${filteredStatements.length} statements executed)`);
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
