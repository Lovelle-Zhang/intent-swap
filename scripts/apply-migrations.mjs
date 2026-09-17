// Apply any pending Supabase migrations to a database, idempotently.
//
// Why this exists: migrations in supabase/migrations/*.sql used to be applied to
// prod BY HAND before merging. That was missed for #92 (the anti-replay table),
// so the verified-execution path 500'd in prod until it was applied manually.
// This runner + .github/workflows/migrate.yml close that gap: every push to main
// applies the migrations the target DB hasn't seen yet.
//
// Tracking: public._schema_migrations(filename) records what has been applied.
// FIRST run against an existing, already-up-to-date prod (empty tracking table)
// BASELINES every current file as applied WITHOUT executing it — the repo and
// prod are in sync at that moment. Every later run applies only the new files.
//
// The connection string (MIGRATION_DATABASE_URL) must be a PRIVILEGED role that
// can CREATE TABLE / ROLE / POLICY etc. (Supabase's `postgres`), NOT the runtime
// `zenfix_login` role. Prefer the DIRECT connection (5432), not the 6543 pooler,
// so multi-statement DDL transactions behave. If the secret is absent the runner
// SKIPS (exit 0) so main doesn't go red before the secret is configured.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const MIGRATIONS_DIR = "supabase/migrations";

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) {
  console.log("MIGRATION_DATABASE_URL is not set — skipping. Add the secret to enable auto-migration.");
  process.exit(0);
}

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort(); // YYYYMMDDNNNN_ prefixes sort lexically = chronologically

const client = new pg.Client({
  connectionString: url,
  ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query(`CREATE TABLE IF NOT EXISTS public._schema_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now(),
    baseline boolean NOT NULL DEFAULT false
  )`);

  const applied = new Set(
    (await client.query("SELECT filename FROM public._schema_migrations")).rows.map((r) => r.filename),
  );

  // Fresh tracking table. On an existing prod the repo == prod already, so the
  // right move is to record every current file as applied WITHOUT running it —
  // but only when explicitly asked (MIGRATION_BASELINE=1, one-time setup). Doing
  // it automatically would be dangerous: if the first secret-present run also
  // carried a brand-new migration, that migration would be marked applied but
  // never executed — the exact silent-500 this whole thing exists to prevent. So
  // an empty tracking table without an explicit baseline FAILS LOUDLY instead.
  if (applied.size === 0) {
    if (process.env.MIGRATION_BASELINE !== "1") {
      console.error(
        "Tracking table public._schema_migrations is empty and this is not a baseline run.\n" +
        "Run this workflow once manually with baseline=true to record the already-applied\n" +
        "migrations, THEN let normal pushes apply new ones. Refusing to guess.",
      );
      process.exit(1);
    }
    for (const f of files) {
      await client.query(
        "INSERT INTO public._schema_migrations (filename, baseline) VALUES ($1, true) ON CONFLICT DO NOTHING",
        [f],
      );
    }
    console.log(`Baselined ${files.length} existing migration(s) as already-applied. No SQL executed.`);
    process.exit(0);
  }

  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    console.log("No pending migrations.");
    process.exit(0);
  }

  for (const f of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    console.log(`Applying ${f} ...`);
    try {
      // Each migration file carries its own BEGIN; ... COMMIT;. Run it as one
      // batch, then record it. (A crash between COMMIT and the record would make
      // the next run re-run the file and fail loudly on "already exists" — rare,
      // and easy to fix by inserting the tracking row by hand.)
      await client.query(sql);
      await client.query(
        "INSERT INTO public._schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
        [f],
      );
      console.log(`  ✓ ${f}`);
    } catch (error) {
      console.error(`  ✗ ${f}: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }
  console.log(`Applied ${pending.length} migration(s).`);
} finally {
  await client.end();
}
