import { describe, expect, test } from "vitest";

import type { HostedPayRunSummary } from "@/features/payrun/hosted/workspace-payruns";
import {
  applyDateRange,
  applyPayRunFilter,
  paginate,
  parsePayRunFilter,
  parsePayRunPage,
  renderFilterBar,
  renderPager,
} from "@/features/payrun/hosted/payruns-filter";

function run(overrides: Partial<HostedPayRunSummary>): HostedPayRunSummary {
  return {
    payRunId: "payrun_x",
    status: "policy_allowed",
    agentId: "agent_ops_01",
    purpose: "Buy data",
    createdAt: "2026-09-07T00:00:00.000Z",
    amount: { amountAtomic: "1", asset: "USDC", decimals: 6 },
    policy: null,
    ...overrides,
  };
}

const RUNS: HostedPayRunSummary[] = [
  run({ payRunId: "payrun_a", status: "policy_allowed", agentId: "agent_ops_01", purpose: "Buy dataset" }),
  run({ payRunId: "payrun_b", status: "pending_review", agentId: "agent_ops_02", purpose: "Monthly feed" }),
  run({ payRunId: "payrun_c", status: "blocked", agentId: "agent_ops_01", purpose: "Unknown payee" }),
  run({ payRunId: "payrun_d", status: "denied", agentId: "agent_ops_03", purpose: "Denied by owner" }),
  run({ payRunId: "payrun_e", status: "execution_reported", agentId: "agent_ops_02", purpose: "Executed run" }),
];

const RUNS_DATED: HostedPayRunSummary[] = [
  run({ payRunId: "d_06", createdAt: "2026-09-06T10:00:00.000Z" }),
  run({ payRunId: "d_07", createdAt: "2026-09-07T10:00:00.000Z" }),
  run({ payRunId: "d_08", createdAt: "2026-09-08T10:00:00.000Z" }),
  run({ payRunId: "d_09", createdAt: "2026-09-09T10:00:00.000Z" }),
];

describe("parsePayRunFilter", () => {
  test("defaults to all + empty query, and trims q", () => {
    expect(parsePayRunFilter(new URLSearchParams())).toEqual({ state: "all", q: "" });
    expect(parsePayRunFilter(new URLSearchParams("q=%20hi%20"))).toEqual({ state: "all", q: "hi" });
  });
  test("accepts known states, ignores garbage", () => {
    expect(parsePayRunFilter(new URLSearchParams("state=blocked")).state).toBe("blocked");
    expect(parsePayRunFilter(new URLSearchParams("state=bogus")).state).toBe("all");
  });
});

describe("applyPayRunFilter", () => {
  test("all + no query returns everything", () => {
    expect(applyPayRunFilter(RUNS, { state: "all", q: "" })).toHaveLength(5);
  });
  test("blocked folds in denied", () => {
    const ids = applyPayRunFilter(RUNS, { state: "blocked", q: "" }).map((r) => r.payRunId);
    expect(ids).toEqual(["payrun_c", "payrun_d"]);
  });
  test("executed matches execution_reported; needs_review matches pending_review", () => {
    expect(applyPayRunFilter(RUNS, { state: "executed", q: "" }).map((r) => r.payRunId)).toEqual(["payrun_e"]);
    expect(applyPayRunFilter(RUNS, { state: "needs_review", q: "" }).map((r) => r.payRunId)).toEqual(["payrun_b"]);
  });
  test("q is a case-insensitive contains over agent, purpose, and id", () => {
    expect(applyPayRunFilter(RUNS, { state: "all", q: "OPS_02" }).map((r) => r.payRunId)).toEqual(["payrun_b", "payrun_e"]);
    expect(applyPayRunFilter(RUNS, { state: "all", q: "dataset" }).map((r) => r.payRunId)).toEqual(["payrun_a"]);
    expect(applyPayRunFilter(RUNS, { state: "all", q: "payrun_c" }).map((r) => r.payRunId)).toEqual(["payrun_c"]);
  });
  test("state and query combine (AND)", () => {
    expect(applyPayRunFilter(RUNS, { state: "blocked", q: "agent_ops_01" }).map((r) => r.payRunId)).toEqual(["payrun_c"]);
  });
});

describe("renderFilterBar", () => {
  test("marks the active state selected and shows a filtered count + Clear", () => {
    const html = renderFilterBar({ state: "blocked", q: "acme" }, 10, 2);
    expect(html).toContain('<option value="blocked" selected>');
    expect(html).toContain('value="acme"');
    expect(html).toContain("2 of 10");
    expect(html).toContain('href="/zenfix/payruns"');
  });
  test("no active filter shows only the total", () => {
    const html = renderFilterBar({ state: "all", q: "" }, 7, 7);
    expect(html).toContain("7 total");
    expect(html).not.toContain(" of ");
  });
  test("with a page arg it renders date inputs; a date range counts as active", () => {
    const html = renderFilterBar({ state: "all", q: "" }, 7, 3, { from: "2026-09-01", to: "", page: 1 });
    expect(html).toContain('name="from"');
    expect(html).toContain('value="2026-09-01"');
    expect(html).toContain("3 of 7");
    // Locale-independent text fields, not the native (browser-localized) date picker.
    expect(html).toContain('placeholder="YYYY-MM-DD"');
    expect(html).not.toContain('type="date"');
  });
});

describe("parsePayRunPage", () => {
  test("defaults to no range and page 1", () => {
    expect(parsePayRunPage(new URLSearchParams())).toEqual({ from: "", to: "", page: 1 });
  });
  test("accepts YYYY-MM-DD dates and a positive page, rejects the rest", () => {
    expect(parsePayRunPage(new URLSearchParams("from=2026-09-01&to=2026-09-30&page=3")))
      .toEqual({ from: "2026-09-01", to: "2026-09-30", page: 3 });
    expect(parsePayRunPage(new URLSearchParams("from=nope&to=9/9/26&page=0")))
      .toEqual({ from: "", to: "", page: 1 });
    expect(parsePayRunPage(new URLSearchParams("page=-2")).page).toBe(1);
  });
});

describe("applyDateRange", () => {
  const range = (from: string, to: string) =>
    applyDateRange(RUNS_DATED, { from, to, page: 1 }).map((r) => r.payRunId);
  test("inclusive on both ends, UTC calendar days", () => {
    expect(range("2026-09-07", "2026-09-07")).toEqual(["d_07"]);
    expect(range("2026-09-06", "2026-09-08")).toEqual(["d_06", "d_07", "d_08"]);
  });
  test("open-ended from / to", () => {
    expect(range("2026-09-08", "")).toEqual(["d_08", "d_09"]);
    expect(range("", "2026-09-06")).toEqual(["d_06"]);
    expect(range("", "")).toHaveLength(4);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 7 }, (_, i) => i + 1);
  test("slices into pages and reports the count", () => {
    const p1 = paginate(items, 1, 3);
    expect(p1).toMatchObject({ rows: [1, 2, 3], page: 1, pageCount: 3, total: 7 });
    expect(paginate(items, 3, 3).rows).toEqual([7]);
  });
  test("clamps out-of-range pages into [1, pageCount]", () => {
    expect(paginate(items, 99, 3).page).toBe(3);
    expect(paginate(items, 0, 3).page).toBe(1);
    expect(paginate([], 1, 3)).toMatchObject({ rows: [], page: 1, pageCount: 1, total: 0 });
  });
});

describe("renderPager", () => {
  const filter = { state: "all" as const, q: "" };
  const page = { from: "", to: "", page: 1 };
  test("is empty for a single page", () => {
    expect(renderPager({ rows: [], page: 1, pageCount: 1, total: 2 }, filter, page)).toBe("");
  });
  test("links Next (and disables Prev) on page 1, preserving filter params", () => {
    const html = renderPager({ rows: [], page: 1, pageCount: 3, total: 7 }, { state: "blocked", q: "acme" }, { from: "2026-09-01", to: "", page: 1 });
    expect(html).toContain("Page 1 of 3");
    expect(html).toContain('href="/zenfix/payruns?state=blocked&amp;q=acme&amp;from=2026-09-01&amp;page=2"');
    expect(html).toContain('<span class="hint">← Prev</span>');
  });
});
