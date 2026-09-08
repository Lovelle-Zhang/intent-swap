import { afterEach, describe, expect, test, vi } from "vitest";

import {
  isSafeWebhookUrl, isSlackWebhook, parseWebhookUrl, sendNeedsReviewWebhook, slackText, type NeedsReviewPayload,
} from "@/features/payrun/hosted/webhook";

const payload: NeedsReviewPayload = {
  event: "payrun.needs_review", payRunId: "payrun_1", workspaceId: "ws_1",
  agentId: "agent_ops_01", amount: { amountAtomic: "20000000", asset: "USDC" }, createdAt: "2026-09-08T00:00:00.000Z",
};

describe("isSafeWebhookUrl", () => {
  test("accepts a public https URL", () => {
    expect(isSafeWebhookUrl("https://hooks.example.com/zenfix")).toBe(true);
  });
  test("rejects non-https, credentials, and internal/private hosts (SSRF)", () => {
    expect(isSafeWebhookUrl("http://hooks.example.com")).toBe(false);        // not https
    expect(isSafeWebhookUrl("https://user:pw@hooks.example.com")).toBe(false); // credentials
    expect(isSafeWebhookUrl("https://localhost/x")).toBe(false);
    expect(isSafeWebhookUrl("https://127.0.0.1/x")).toBe(false);
    expect(isSafeWebhookUrl("https://10.0.0.5/x")).toBe(false);
    expect(isSafeWebhookUrl("https://192.168.1.1/x")).toBe(false);
    expect(isSafeWebhookUrl("https://172.16.0.1/x")).toBe(false);
    expect(isSafeWebhookUrl("https://169.254.169.254/latest")).toBe(false);  // cloud metadata
    expect(isSafeWebhookUrl("not a url")).toBe(false);
  });
});

describe("isSlackWebhook + slackText", () => {
  test("detects hooks.slack.com only", () => {
    expect(isSlackWebhook("https://hooks.slack.com/services/T/B/x")).toBe(true);
    expect(isSlackWebhook("https://hooks.example.com/x")).toBe(false);
    expect(isSlackWebhook("not a url")).toBe(false);
  });
  test("renders a mrkdwn nudge with agent, amount, and a review link", () => {
    const t = slackText({ ...payload, agentId: "aria", amount: { amountAtomic: "70000000", asset: "USDC" } });
    expect(t).toContain("aria");
    expect(t).toContain("70 USDC");
    expect(t).toContain("https://intent-swap.app/zenfix/payruns/payrun_1");
  });
});

describe("parseWebhookUrl", () => {
  test("empty = disabled (null); a safe URL passes; an unsafe one errors", () => {
    expect(parseWebhookUrl("   ")).toEqual({ ok: true, url: null });
    expect(parseWebhookUrl("https://hooks.example.com/x")).toEqual({ ok: true, url: "https://hooks.example.com/x" });
    const bad = parseWebhookUrl("http://localhost");
    expect(bad.ok).toBe(false);
  });
});

describe("sendNeedsReviewWebhook", () => {
  afterEach(() => vi.restoreAllMocks());

  test("POSTs JSON to a safe URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendNeedsReviewWebhook("https://hooks.example.com/x", payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hooks.example.com/x");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({ event: "payrun.needs_review", payRunId: "payrun_1" });
  });

  test("formats a Slack incoming webhook as a Slack {text} message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendNeedsReviewWebhook("https://hooks.slack.com/services/T00/B00/xyz", { ...payload, agentId: "aria", amount: { amountAtomic: "70000000", asset: "USDC" } });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(Object.keys(sent)).toEqual(["text"]); // Slack shape, not our generic JSON
    expect(sent.text).toContain("aria");
    expect(sent.text).toContain("70 USDC");
    expect(sent.text).toContain("/zenfix/payruns/payrun_1");
  });

  test("sends the generic JSON payload to a non-Slack URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendNeedsReviewWebhook("https://hooks.example.com/x", payload);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ event: "payrun.needs_review", payRunId: "payrun_1" });
  });

  test("does nothing for a null or unsafe URL", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await sendNeedsReviewWebhook(null, payload);
    await sendNeedsReviewWebhook("https://127.0.0.1/x", payload);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("never throws when delivery fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(sendNeedsReviewWebhook("https://hooks.example.com/x", payload)).resolves.toBeUndefined();
  });
});
