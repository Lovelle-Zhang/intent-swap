import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { PersistenceUnavailableError } from "@/features/payrun/adapters/storage";

const auth = vi.hoisted(() => ({
  user: { id: "00000000-0000-4000-8000-00000000000a" } as { id: string } | null,
  getUserError: null as Error | null,
  createClient: vi.fn(),
}));
const hostedWorkspace = vi.hoisted(() => ({
  error: null as Error | null,
  open: vi.fn(),
  close: vi.fn(),
}));
const loop = vi.hoisted(() => ({
  create: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/features/payrun/adapters/supabase/server", () => ({ createSupabaseServerClient: auth.createClient }));
vi.mock("@/features/payrun/hosted/runtime", () => ({ getHostedSqlPool: () => ({}) }));
vi.mock("@/features/payrun/hosted/workspace", () => ({
  openWorkspacePersistence: (...args: unknown[]) => hostedWorkspace.open(...args),
}));
vi.mock("@/features/payrun/adapters/sandbox", () => ({
  createHostedSandboxControlLoop: (...args: unknown[]) => loop.create(...args),
}));

function body(scenarioId?: string): FormData {
  const form = new FormData();
  if (scenarioId !== undefined) form.set("scenarioId", scenarioId);
  return form;
}

describe("hosted PayRun create (write path)", () => {
  beforeEach(() => {
    auth.user = { id: "00000000-0000-4000-8000-00000000000a" };
    auth.getUserError = null;
    auth.createClient.mockReset().mockImplementation(() => ({
      auth: { getUser: async () => ({ data: { user: auth.user }, error: auth.getUserError }) },
    }));
    hostedWorkspace.error = null;
    hostedWorkspace.close.mockReset().mockResolvedValue(undefined);
    hostedWorkspace.open.mockReset().mockImplementation(async () => {
      if (hostedWorkspace.error) throw hostedWorkspace.error;
      return {
        workspace: { projectId: "10000000-0000-4000-8000-00000000000a", name: "Personal Workspace", mode: "sandbox" },
        persistence: { close: hostedWorkspace.close },
      };
    });
    loop.execute.mockReset().mockResolvedValue({ payRun: { id: "payrun_x", status: "completed" } });
    loop.create.mockReset().mockImplementation(() => ({ execute: loop.execute }));
    process.env.ZENFIX_APP_ORIGIN = "https://zenfix.test";
  });

  afterEach(() => { delete process.env.ZENFIX_APP_ORIGIN; });

  test("runs the hosted control loop in the user's workspace and redirects", async () => {
    const { POST } = await import("@/app/zenfix/payruns/create/route");
    const response = await POST(new Request("https://evil.test/zenfix/payruns/create", { method: "POST", body: body("allowed") }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://zenfix.test/zenfix/workspace?status=payrun_created");
    expect(hostedWorkspace.open).toHaveBeenCalledWith(expect.anything(), { userId: auth.user!.id });
    expect(loop.create).toHaveBeenCalledWith(
      expect.objectContaining({ close: hostedWorkspace.close }),
      { projectId: "10000000-0000-4000-8000-00000000000a" },
    );
    expect(loop.execute).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "10000000-0000-4000-8000-00000000000a",
      scenarioId: "allowed",
      requester: { actorId: auth.user!.id, actorType: "user" },
    }));
    expect(hostedWorkspace.close).toHaveBeenCalledOnce();
  });

  test("anonymous create redirects to sign-in and never runs the loop", async () => {
    auth.user = null;
    const { POST } = await import("@/app/zenfix/payruns/create/route");
    const response = await POST(new Request("https://evil.test/zenfix/payruns/create", { method: "POST", body: body("allowed") }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://zenfix.test/zenfix/sign-in");
    expect(hostedWorkspace.open).not.toHaveBeenCalled();
    expect(loop.execute).not.toHaveBeenCalled();
  });

  test("invalid scenario is rejected before auth or persistence", async () => {
    const { POST } = await import("@/app/zenfix/payruns/create/route");
    const response = await POST(new Request("https://evil.test/zenfix/payruns/create", { method: "POST", body: body("nonsense") }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://zenfix.test/zenfix/workspace?error=invalid_scenario");
    expect(hostedWorkspace.open).not.toHaveBeenCalled();
    expect(loop.execute).not.toHaveBeenCalled();
  });

  test("persistence outage returns 503 without creating a PayRun", async () => {
    hostedWorkspace.error = new PersistenceUnavailableError();
    const { POST } = await import("@/app/zenfix/payruns/create/route");
    const response = await POST(new Request("https://evil.test/zenfix/payruns/create", { method: "POST", body: body("allowed") }));

    expect(response.status).toBe(503);
    expect(loop.execute).not.toHaveBeenCalled();
  });
});
