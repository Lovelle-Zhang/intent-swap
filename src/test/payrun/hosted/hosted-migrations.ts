import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// The hosted Postgres schema is defined by the numbered SQL files under
// supabase/migrations/. Tests apply them to PGlite in filename order (which is
// deployment order, thanks to the YYYYMMDDNNNN prefix) so a new migration is
// exercised automatically without touching every schema test.
const MIGRATIONS_DIR = new URL("../../../../supabase/migrations/", import.meta.url);

export function hostedMigrationFilenames(): string[] {
  return readdirSync(fileURLToPath(MIGRATIONS_DIR))
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

export async function loadHostedMigrationsSql(): Promise<string> {
  const files = hostedMigrationFilenames();
  const parts = await Promise.all(
    files.map((name) => readFile(fileURLToPath(new URL(name, MIGRATIONS_DIR)), "utf8")),
  );
  return parts.join("\n\n");
}
