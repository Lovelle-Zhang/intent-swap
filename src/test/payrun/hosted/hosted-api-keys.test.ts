import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { PersistenceUnavailableError } from "@/features/payrun/adapters/storage";
import type { ApiKeyView } from "@/features/payrun/hosted/api-keys";

const auth = vi.hoisted(() => ({
  user: { id: "00000000-0000-4000-8000-00000000000a" } as { id: string } | null,
  createClient: vi.fn(),
}));
const keys = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), revoke: vi.fn() }));

vi.mock("@/features/payrun/adapters/supabase/server", () => ({ createSupabaseServerClient: auth.createClient }));
vi.mock("@/features/payrun/hosted/runtime", () => ({ getHostedSqlPool: () => ({}) }));
vi.mock("@/features/payrun/hosted/api-keys", () => ({
  listWorkspaceApiKeys: keys.list,
  createWorkspaceApiKey: keys.create,
  revokeWorkspaceApiKey: keys.revoke,
}));

function view(overrides: Partial<ApiKeyView> = {}): ApiKeyView {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    prefix: "zfk_live_Ab12Cd",
    label: "prod agent",
    createdAt: "2026-09-07T10:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

async function loadRoute() {
  return import("@/app/zenfix/keys/route");
}

function post(fields: Record<string, string>): Request {
  return new Request("https://zenfix.test/zenfix/keys", { method: "POST", body: new URLSearchParams(fields) });
}

describe("hosted API keys route", () => {
  beforeEach(() => {
    auth.user = { id: "00000000-0000-4000-8000-00000000000a" };
    auth.createClient.mockReset().mockImplementation(() => ({
      auth: { getUser: async () => ({ data: { user: auth.user }, error: null }) },
    }));
    keys.list.mockReset().mockResolvedValue([view()]);
    keys.create.mockReset();
    keys.revoke.mockReset().mockResolvedValue(true);
    process.env.ZENFIX_APP_ORIGIN = "https://zenfix.test";
  });
  afterEach(() => { delete process.env.ZENFIX_APP_ORIGIN; });

  test("GET lists existing keys by prefix", async () => {
    const { GET } = await loadRoute();
    const res = await GET(new Request("https://zenfix.test/zenfix/keys"));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Create a key");
    expect(html).toContain("zfk_live_Ab12Cd");
    expect(html).toContain("Using a key");
    expect(html).toContain("curl -X POST https://zenfix.test/api/v1/payruns");
  });

  test("GET with no keys shows the empty state", async () => {
    keys.list.mockResolvedValue([]);
    const { GET } = await loadRoute();
    const res = await GET(new Request("https://zenfix.test/zenfix/keys"));
    expect(await res.text()).toContain("No API keys yet");
  });

  test("POST create shows the plaintext key exactly once and 201s", async () => {
    keys.create.mockResolvedValue({ key: "zfk_live_PLAINTEXTSECRETvalue123456", view: view() });
    keys.list.mockResolvedValue([view()]);
    const { POST } = await loadRoute();
    const res = await POST(post({ action: "create", label: "prod agent" }));
    expect(res.status).toBe(201);
    const html = await res.text();
    expect(html).toContain("New key");
    expect(html).toContain("zfk_live_PLAINTEXTSECRETvalue123456");
    expect(keys.create).toHaveBeenCalledWith(expect.anything(), { userId: auth.user!.id }, "prod agent");
  });

  test("POST revoke revokes the key and redirects", async () => {
    const { POST } = await loadRoute();
    const res = await POST(post({ action: "revoke", keyId: "11111111-1111-4111-8111-111111111111" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://zenfix.test/zenfix/keys?status=revoked");
    expect(keys.revoke).toHaveBeenCalledWith(expect.anything(), { userId: auth.user!.id }, "11111111-1111-4111-8111-111111111111");
  });

  test("anonymous GET redirects to sign-in", async () => {
    auth.user = null;
    const { GET } = await loadRoute();
    const res = await GET(new Request("https://zenfix.test/zenfix/keys"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://zenfix.test/zenfix/sign-in");
  });

  test("a persistence outage returns 503", async () => {
    keys.list.mockRejectedValue(new PersistenceUnavailableError());
    const { GET } = await loadRoute();
    const res = await GET(new Request("https://zenfix.test/zenfix/keys"));
    expect(res.status).toBe(503);
  });
});
