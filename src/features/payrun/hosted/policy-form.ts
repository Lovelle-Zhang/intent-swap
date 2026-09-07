import type { PolicyRuleSnapshot } from "../domain/types";
import { usdcMoney } from "./workspace-policy";
import { escapeHtml } from "./ui";

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
  readonly requireReviewForNewMerchant: boolean;
  readonly allowedMerchantIds: string;
  readonly blockedMerchantIds: string;
  readonly blockedCategories: string;
}

export function valuesFromRules(rules: PolicyRuleSnapshot): PolicyFormValues {
  return {
    transactionLimit: atomicToUsdc(rules.transactionLimit.amountAtomic),
    reviewThreshold: atomicToUsdc(rules.reviewThreshold.amountAtomic),
    absoluteHardLimit: atomicToUsdc(rules.absoluteHardLimit.amountAtomic),
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
    requireReviewForNewMerchant: form.get("requireReviewForNewMerchant") === "on",
    allowedMerchantIds: text("allowedMerchantIds"),
    blockedMerchantIds: text("blockedMerchantIds"),
    blockedCategories: text("blockedCategories"),
  };
}

export type PolicyFormResult =
  | { readonly ok: true; readonly rules: PolicyRuleSnapshot }
  | { readonly ok: false; readonly error: string };

export function parsePolicyForm(form: FormData, base: PolicyRuleSnapshot): PolicyFormResult {
  const transactionLimit = usdcToAtomic(String(form.get("transactionLimit") ?? ""));
  const reviewThreshold = usdcToAtomic(String(form.get("reviewThreshold") ?? ""));
  const absoluteHardLimit = usdcToAtomic(String(form.get("absoluteHardLimit") ?? ""));
  if (transactionLimit === null || reviewThreshold === null || absoluteHardLimit === null) {
    return { ok: false, error: "Each limit must be a USDC amount with up to 6 decimals (e.g. 100 or 12.50)." };
  }
  if (BigInt(transactionLimit) > BigInt(absoluteHardLimit)) {
    return { ok: false, error: "The per-transaction limit cannot exceed the absolute hard limit." };
  }
  return {
    ok: true,
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

function amountField(name: string, label: string, hint: string, value: string): string {
  return `<div class="field"><label for="${name}">${label}</label><div class="suffix"><input type="number" id="${name}" name="${name}" min="0" step="0.000001" value="${escapeHtml(value)}"><span class="u">USDC</span></div><span class="hint">${hint}</span></div>`;
}

function listField(name: string, label: string, hint: string, value: string): string {
  return `<div class="field"><label for="${name}">${label}</label><textarea id="${name}" name="${name}" placeholder="one per line or comma-separated">${escapeHtml(value)}</textarea><span class="hint">${hint}</span></div>`;
}

export function renderPolicyForm(values: PolicyFormValues): string {
  const checked = values.requireReviewForNewMerchant ? " checked" : "";
  return `<form method="post" action="/zenfix/policy">
    <div class="card"><h2>Spending limits</h2><div class="grid2">
      ${amountField("transactionLimit", "Per-transaction limit", "A single payment above this is blocked.", values.transactionLimit)}
      ${amountField("reviewThreshold", "Review threshold", "At or above this, a payment needs review first.", values.reviewThreshold)}
      ${amountField("absoluteHardLimit", "Absolute hard limit", "The ceiling no payment may ever cross.", values.absoluteHardLimit)}
    </div></div>
    <div class="card"><h2>Merchants</h2>
      ${listField("allowedMerchantIds", "Allowed merchants", "Merchant IDs that are pre-approved.", values.allowedMerchantIds)}
      ${listField("blockedMerchantIds", "Blocked merchants", "Merchant IDs that are always denied.", values.blockedMerchantIds)}
      ${listField("blockedCategories", "Blocked categories", "Merchant categories that are always denied.", values.blockedCategories)}
      <label class="check"><input type="checkbox" name="requireReviewForNewMerchant"${checked}><span class="ct">Require review for new merchants<small>A merchant not seen before must be reviewed before its first payment.</small></span></label>
    </div>
    <div class="actions"><button type="submit" class="btn">Save policy</button><a class="link" href="/zenfix/payruns">← Back to Pay Runs</a></div>
  </form>`;
}
