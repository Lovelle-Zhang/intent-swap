import type { PolicyRuleSnapshot } from "../domain/types";
import { usdcMoney } from "./workspace-policy";

// Form <-> policy translation for the /zenfix/policy surface. Amounts are edited
// as decimal USDC and stored as atomic (6-decimal) strings; merchant/category
// lists are edited as free text (one per line or comma-separated).

export function atomicToUsdc(atomic: string): string {
  const negative = atomic.startsWith("-");
  const digits = (negative ? atomic.slice(1) : atomic).padStart(7, "0");
  const whole = digits.slice(0, -6).replace(/^0+(?=\d)/, "");
  const fraction = digits.slice(-6).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function usdcToAtomic(input: string): string | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  return (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0") || "0")).toString();
}

function parseList(raw: string): string[] {
  const seen = new Set<string>();
  return raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !seen.has(item) && seen.add(item));
}

// Display-shaped values so both the GET (from saved rules) and the POST error
// path (from raw submitted input) feed the same dumb renderer — a validation
// error never discards what the owner typed.
export interface PolicyFormValues {
  readonly transactionLimit: string;
  readonly reviewThreshold: string;
  readonly absoluteHardLimit: string;
  readonly dailyBudget: string; // USDC; "" = unlimited
  readonly agentBudgets: string; // textarea: one "agentId = usdc" per line
  readonly requireReviewForNewMerchant: boolean;
  readonly allowedMerchantIds: string;
  readonly blockedMerchantIds: string;
  readonly blockedCategories: string;
}

function agentBudgetsToText(agentBudgets: Record<string, string>): string {
  return Object.entries(agentBudgets)
    .map(([agentId, atomic]) => `${agentId} = ${atomicToUsdc(atomic)}`)
    .join("\n");
}

export function valuesFromRules(
  rules: PolicyRuleSnapshot,
  dailyBudgetAtomic: string,
  agentBudgets: Record<string, string>,
): PolicyFormValues {
  return {
    transactionLimit: atomicToUsdc(rules.transactionLimit.amountAtomic),
    reviewThreshold: atomicToUsdc(rules.reviewThreshold.amountAtomic),
    absoluteHardLimit: atomicToUsdc(rules.absoluteHardLimit.amountAtomic),
    dailyBudget: dailyBudgetAtomic === "0" ? "" : atomicToUsdc(dailyBudgetAtomic),
    agentBudgets: agentBudgetsToText(agentBudgets),
    requireReviewForNewMerchant: rules.requireReviewForNewMerchant,
    allowedMerchantIds: rules.allowedMerchantIds.join("\n"),
    blockedMerchantIds: rules.blockedMerchantIds.join("\n"),
    blockedCategories: rules.blockedCategories.join("\n"),
  };
}

export function valuesFromForm(form: FormData): PolicyFormValues {
  const text = (name: string) => String(form.get(name) ?? "");
  return {
    transactionLimit: text("transactionLimit"),
    reviewThreshold: text("reviewThreshold"),
    absoluteHardLimit: text("absoluteHardLimit"),
    dailyBudget: text("dailyBudget"),
    agentBudgets: text("agentBudgets"),
    requireReviewForNewMerchant: form.get("requireReviewForNewMerchant") === "on",
    allowedMerchantIds: text("allowedMerchantIds"),
    blockedMerchantIds: text("blockedMerchantIds"),
    blockedCategories: text("blockedCategories"),
  };
}

export type PolicyFormResult =
  | {
      readonly ok: true;
      readonly rules: PolicyRuleSnapshot;
      readonly dailyBudgetAtomic: string;
      readonly agentBudgets: Record<string, string>;
    }
  | { readonly ok: false; readonly error: string };

// Parse the "agentId = usdc" textarea into an atomic-USDC map. Blank lines are
// skipped; a malformed amount is rejected so the owner sees a clear error rather
// than a silently-dropped cap.
function parseAgentBudgets(raw: string): Record<string, string> | { readonly error: string } {
  const map: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const eq = trimmed.indexOf("=");
    const agentId = (eq === -1 ? trimmed : trimmed.slice(0, eq)).trim();
    const value = eq === -1 ? "" : trimmed.slice(eq + 1).trim();
    if (agentId.length === 0) continue;
    const atomic = usdcToAtomic(value);
    if (atomic === null) {
      return { error: `Agent budget for ${agentId} must be a USDC amount with up to 6 decimals (e.g. agent_ops_01 = 50).` };
    }
    map[agentId] = atomic;
  }
  return map;
}

export function parsePolicyForm(form: FormData, base: PolicyRuleSnapshot): PolicyFormResult {
  const transactionLimit = usdcToAtomic(String(form.get("transactionLimit") ?? ""));
  const reviewThreshold = usdcToAtomic(String(form.get("reviewThreshold") ?? ""));
  const absoluteHardLimit = usdcToAtomic(String(form.get("absoluteHardLimit") ?? ""));
  if (transactionLimit === null || reviewThreshold === null || absoluteHardLimit === null) {
    return { ok: false, error: "Each limit must be a USDC amount with up to 6 decimals (e.g. 100 or 12.50)." };
  }
  const dailyBudgetRaw = String(form.get("dailyBudget") ?? "");
  const dailyBudgetAtomic = dailyBudgetRaw.trim() === "" ? "0" : usdcToAtomic(dailyBudgetRaw);
  if (dailyBudgetAtomic === null) {
    return { ok: false, error: "The daily budget must be a USDC amount with up to 6 decimals (e.g. 100 or 12.50)." };
  }
  if (BigInt(transactionLimit) > BigInt(absoluteHardLimit)) {
    return { ok: false, error: "The per-transaction limit cannot exceed the absolute hard limit." };
  }
  const agentBudgets = parseAgentBudgets(String(form.get("agentBudgets") ?? ""));
  if ("error" in agentBudgets) {
    return { ok: false, error: agentBudgets.error };
  }
  return {
    ok: true,
    dailyBudgetAtomic,
    agentBudgets,
    rules: {
      ...base,
      transactionLimit: usdcMoney(transactionLimit),
      reviewThreshold: usdcMoney(reviewThreshold),
      absoluteHardLimit: usdcMoney(absoluteHardLimit),
      requireReviewForNewMerchant: form.get("requireReviewForNewMerchant") === "on",
      allowedMerchantIds: parseList(String(form.get("allowedMerchantIds") ?? "")),
      blockedMerchantIds: parseList(String(form.get("blockedMerchantIds") ?? "")),
      blockedCategories: parseList(String(form.get("blockedCategories") ?? "")),
    },
  };
}
