// Prints every saved analytics query (docs/analytics/queries.sql) from the
// production database, inside a READ ONLY transaction.
// Needs SUPABASE_URL and SUPABASE_DB_PASSWORD in .env. Usage:
//   npm run analytics:report            all reports
//   npm run analytics:report -- funnel  only reports whose name contains "funnel"
import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

async function main() {
  const filter = process.argv[2]?.toLowerCase();
  const url = process.env.SUPABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!url || !password) throw new Error("SUPABASE_URL and SUPABASE_DB_PASSWORD are required.");

  const queries = readFileSync(join(__dirname, "..", "docs", "analytics", "queries.sql"), "utf8")
    .split(/^-- name: /m)
    .slice(1)
    .map((block) => ({ name: block.split("\n")[0].trim(), sql: block.slice(block.indexOf("\n") + 1) }))
    .filter((query) => !filter || query.name.includes(filter));

  const ref = new URL(url).hostname.split(".")[0];
  const client = new Client({ host: `db.${ref}.supabase.co`, port: 5432, user: "postgres", password, database: "postgres", ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin read only");
    for (const query of queries) {
      const { rows } = await client.query(query.sql);
      console.log(`\n== ${query.name} (${rows.length} rows) ==`);
      if (rows.length) console.table(rows);
    }
    await client.query("rollback");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
