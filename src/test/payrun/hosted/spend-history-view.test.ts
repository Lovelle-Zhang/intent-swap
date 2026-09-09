import { describe, expect, test } from "vitest";

import { renderSpendHistory } from "@/features/payrun/hosted/spend-history";

describe("renderSpendHistory", () => {
  test("shows an empty state when there is no authorized spend", () => {
    const html = renderSpendHistory([], 7);
    expect(html).toContain("Spend · last 7 days");
    expect(html).toContain("No authorized spend");
  });

  test("renders a per-day row (USDC) and a summed total", () => {
    const html = renderSpendHistory([
      { day: "2026-09-09", authorizedAtomic: "20000000", count: 2 },
      { day: "2026-09-08", authorizedAtomic: "5000000", count: 1 },
    ], 7);
    expect(html).toContain("2026-09-09");
    expect(html).toContain("20"); // 20 USDC
    expect(html).toContain("2026-09-08");
    expect(html).toContain("25"); // total 25 USDC
  });
});
