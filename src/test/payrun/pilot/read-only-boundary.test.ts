import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("PV-1 dependency and command boundary", () => {
  it("exposes pilot:prepare through the existing vite-node toolchain", async () => {
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    expect(packageJson.scripts["pilot:prepare"]).toBe("vite-node scripts/prepare-pilot-validation.ts");
    await expect(readFile(join(root, "scripts", "prepare-pilot-validation.ts"), "utf8"))
      .resolves.toContain("preparePilotSession");
  });

  it("keeps Reader and page code free of writer and mutation imports", async () => {
    const reader = await readFile(join(root, "src/features/payrun/pilot/session-reader.ts"), "utf8");
    for (const forbidden of [
      "local-json-storage", "coordinator", "writer-lease", "repositories",
      "PayRunUnitOfWork", "createDeterministicSandboxControlLoop", "control-loop",
    ]) {
      expect(reader).not.toContain(forbidden);
    }
  });

  it("keeps generated local Pilot Sessions outside Git", async () => {
    const ignore = await readFile(join(root, ".gitignore"), "utf8");
    expect(ignore.split(/\r?\n/)).toContain(".zenfix-data/");
  });

  it("keeps the Pilot smoke fixture isolated from the formal workspace store", async () => {
    const smoke = await readFile(join(root, "scripts/smoke-legacy.mjs"), "utf8");
    expect(smoke).toContain("/pilot-validation");
    expect(smoke).toContain("ZENFIX_PILOT_REPO_ROOT");
    expect(smoke).toContain("prepare-pilot-validation.ts");
  });

  it("uses the hosted-capable reader for the default Pilot Validation session", async () => {
    const page = await readFile(join(root, "src/app/pilot-validation/page.tsx"), "utf8");
    expect(page).toContain("loadCurrentPilotSession");
    expect(page).toMatch(/typeof selected === "string"[\s\S]*reader\.loadSession\(selected\)[\s\S]*loadCurrentPilotSession\(\)/);
  });
});
