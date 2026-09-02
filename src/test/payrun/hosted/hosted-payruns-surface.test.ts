import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { PersistenceUnavailableError } from "@/features/payrun/adapters/storage";
import type { HostedPayRunSummary } from "@/features/payrun/hosted/workspace-payruns";

const auth = vi.hoisted(() => ({
  user: { id: "00000000-0000-4000-8000-00000000000a" } as { id: string } | null,
  getUserError: null as Error | null,
  createClient: vi.fn(),
}));
const read = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("@/features/payrun/adapters/supabase/server", () => ({ createSupabaseServerClient: auth.createClient }));
vi.mock("@/features/payrun/hosted/runtime", () => ({ getHostedSqlPool: () => ({}) }));
vi.mock("@/features/payrun/hosted/workspace-payruns", () => ({
  listWorkspacePayRuns: (...args: unknown[]) => read.list(...args),
}));

const WORKSPACE = { projectId: "10000000-0000-4000-8000-00000000000a", name: "Personal Workspace", mode: "sandbox" as const };

function summary(overrides: Partial<HostedPayRunSummary> = {}): HostedPayRunSummary {
  return {
    payRunId: "payrun_abc",
    status: "completed",
    agentId: "agent_001",
    purpose: "Purchase a verified API result",
    createdAt: "2026-08-01T00:00:00.000Z",
    amount: { amountAtomic: "420000", asset: "USDC", decimals: 6 },
    policy: { outcome: "allowed", reasonCodes: [] },
    ...overrides,
  };
}

async function get(url = "https://zenfix.test/zenfix/payruns") {
  const { GET } = await import("@/app/zenfix/payruns/route");
  return GET(new Request(url));
}

describe("hosted Pay Runs read surface", () => {
  beforeEach(() => {
    auth.user = { id: "00000000-0000-4000-8000-00000000000a" };
    auth.getUserError = null;
    auth.createClient.mockReset().mockImplementation(() => ({
      auth: { getUser: async () => ({ data: { user: auth.user }, error: auth.getUserError }) },
    }));
    read.list.mockReset().mockResolvedValue({ workspace: WORKSPACE, payRuns: [summary()] });
    process.env.ZENFIX_APP_ORIGIN = "https://zenfix.test";
  });

  afterEach(() => { delete process.env.ZENFIX_APP_ORIGIN; });

  test("anonymous request redirects to sign-in", async () => {
    auth.user = null;
    const response = await get();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://zenfix.test/zenfix/sign-in");
    expect(read.list).not.toHaveBeenCalled();
  });

  test("renders the workspace's Pay Runs and a scenario-selected create form", async () => {
    const response = await get();
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(read.list).toHaveBeenCalledWith(expect.anything(), { userId: auth.user!.id });
    // create form posts to the write path with all four scenarios
    expect(html).toContain('action="/zenfix/payruns/create"');
    for (const scenario of ["allowed", "needs_review", "blocked", "funding_mismatch"]) {
      expect(html).toContain(`<option value="${scenario}">`);
    }
    // a real projected PayRun is listed
    expect(html).toContain("payrun_abc");
    expect(html).toContain("Purchase a verified API result");
    expect(html).toContain("0.42 USDC");
  });

  test("shows an empty state when there are no Pay Runs", async () => {
    read.list.mockResolvedValue({ workspace: WORKSPACE, payRuns: [] });
    const html = await (await get()).text();
    expect(html).toContain("No Pay Runs yet");
  });

  test("surfaces the created notice after a redirect back", async () => {
    const html = await (await get("https://zenfix.test/zenfix/payruns?status=payrun_created")).text();
    expect(html).toContain("Sandbox Pay Run created.");
  });

  test("persistence outage returns 503 without rendering", async () => {
    read.list.mockRejectedValue(new PersistenceUnavailableError());
    const response = await get();
    expect(response.status).toBe(503);
  });

  test("is a read-only surface: no control loop, mutation delegated to the write route", async () => {
    const src = await readFile(join(process.cwd(), "src/app/zenfix/payruns/route.ts"), "utf8");
    expect(src).not.toMatch(/createHostedSandboxControlLoop|createDeterministicSandboxControlLoop|preparePilotSession/);
    expect(src).not.toMatch(/\.execute\(/);
    expect(src).toContain("listWorkspacePayRuns");
    expect(src).toContain('action="/zenfix/payruns/create"');
  });
});
