import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const surfaceFiles = [
  "src/app/command-center/page.tsx",
  "src/app/payruns/page.tsx",
  "src/app/payruns/[id]/page.tsx",
  "src/features/payrun/presentation/pilot-loader.server.ts",
];

describe("ZenFix product surface read-only boundary", () => {
  it("has no mutation route, Server Action, writer lease, or Control Loop import", async () => {
    const source = (await Promise.all(surfaceFiles.map((file) => readFile(join(root, file), "utf8")))).join("\n");

    expect(source).not.toMatch(/use server|POST|PUT|PATCH|DELETE/);
    expect(source).not.toMatch(/writer-lease|local-json-storage|SharedStoreCoordinator|UnitOfWork/);
    expect(source).not.toMatch(/control-loop|preparePilotSession|createDeterministicSandboxControlLoop/);
    expect(source).not.toMatch(/Approve|Deny|Retry|Execute|Run Again/);
    expect(source).toContain("createServerPilotSessionReader");
    expect(source).toContain("notFound");
  });

  it("keeps all product routes as Server Components", async () => {
    const files = [
      ...surfaceFiles.slice(0, 3),
      "src/app/command-center/command-center-view.tsx",
      "src/app/payruns/payruns-view.tsx",
      "src/app/payruns/[id]/payrun-detail-view.tsx",
    ];
    const source = (await Promise.all(files.map((file) => readFile(join(root, file), "utf8")))).join("\n");
    expect(source).not.toMatch(/use client|useState|useEffect|navigator\./);
  });
});

