import type { PolicyRuleSnapshot } from "../domain/types";
import { atomicToUsdc, usdcToAtomic } from "./policy-form";
import { usdcMoney } from "./workspace-policy";
import { escapeHtml } from "./ui";

// Per-agent fine-grained overrides for the /zenfix/policy surface: an optional
// per-transaction cap and an optional merchant allowlist, keyed by agentId.
// These only ever TIGHTEN the workspace policy for that agent — never loosen it.
// Kept out of policy-form.ts so that file stays within its size budget.

export interface AgentLimit {
  readonly perTxAtomic?: string; // atomic USDC; absent/"0" = no per-agent cap
  readonly merchants?: readonly string[]; // allowlist; absent/[] = no restriction
}
export type AgentLimits = Record<string, AgentLimit>;

// Display-shaped values so the GET (from saved limits) and the POST error path
// (from raw submitted input) feed the same renderer — a validation error never
// discards what the owner typed. Two textareas, each "agentId = value" per line.
export interface AgentLimitFormValues {
  readonly agentTxLimits: string; // "agentId = usdc" per line
  readonly agentMerchants: string; // "agentId = m1, m2" per line
}

function splitLine(line: string): { agentId: string; value: string } | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  const eq = trimmed.indexOf("=");
  const agentId = (eq === -1 ? trimmed : trimmed.slice(0, eq)).trim();
  const value = eq === -1 ? "" : trimmed.slice(eq + 1).trim();
  return agentId.length === 0 ? null : { agentId, value };
}

function parseMerchantList(raw: string): string[] {
  const seen = new Set<string>();
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !seen.has(item) && seen.add(item));
}

export function agentLimitValuesFromForm(form: FormData): AgentLimitFormValues {
  return {
    agentTxLimits: String(form.get("agentTxLimits") ?? ""),
    agentMerchants: String(form.get("agentMerchants") ?? ""),
  };
}

export function agentLimitValuesFromLimits(limits: AgentLimits): AgentLimitFormValues {
  const tx: string[] = [];
  const merch: string[] = [];
  for (const [agentId, limit] of Object.entries(limits)) {
    if (limit.perTxAtomic && limit.perTxAtomic !== "0") tx.push(`${agentId} = ${atomicToUsdc(limit.perTxAtomic)}`);
    if (limit.merchants && limit.merchants.length > 0) merch.push(`${agentId} = ${limit.merchants.join(", ")}`);
  }
  return { agentTxLimits: tx.join("\n"), agentMerchants: merch.join("\n") };
}

export type AgentLimitsResult =
  | { readonly ok: true; readonly limits: AgentLimits }
  | { readonly ok: false; readonly error: string };

// Merge the two textareas into one AgentLimits map. A malformed per-tx amount is
// rejected so the owner sees a clear error rather than a silently-dropped cap.
export function parseAgentLimits(values: AgentLimitFormValues): AgentLimitsResult {
  const map: Record<string, { perTxAtomic?: string; merchants?: string[] }> = {};
  for (const line of values.agentTxLimits.split("\n")) {
    const parsed = splitLine(line);
    if (!parsed) continue;
    const atomic = usdcToAtomic(parsed.value);
    if (atomic === null) {
      return { ok: false, error: `Per-transaction limit for ${parsed.agentId} must be a USDC amount with up to 6 decimals (e.g. agent_ops_01 = 25).` };
    }
    (map[parsed.agentId] ??= {}).perTxAtomic = atomic;
  }
  for (const line of values.agentMerchants.split("\n")) {
    const parsed = splitLine(line);
    if (!parsed) continue;
    const merchants = parseMerchantList(parsed.value);
    if (merchants.length > 0) (map[parsed.agentId] ??= {}).merchants = merchants;
  }
  return { ok: true, limits: map };
}

function listField(name: string, label: string, hint: string, value: string): string {
  return `<div class="field"><label for="${name}">${label}</label><textarea id="${name}" name="${name}" placeholder="one per line: agentId = value">${escapeHtml(value)}</textarea><span class="hint">${hint}</span></div>`;
}

export function renderAgentLimitFields(values: AgentLimitFormValues): string {
  return `<div class="card"><h2>Per-agent overrides</h2>
    ${listField("agentTxLimits", "Per-agent transaction limit", "One per line: agentId = USDC (e.g. agent_ops_01 = 25). Caps a single payment for that agent — only tightens the workspace limit.", values.agentTxLimits)}
    ${listField("agentMerchants", "Per-agent allowed merchants", "One per line: agentId = m1, m2. Restricts that agent to this subset of the workspace's allowed merchants.", values.agentMerchants)}
  </div>`;
}

function minAtomic(a: string, b: string): string {
  return BigInt(a) <= BigInt(b) ? a : b;
}

// Overlay one agent's limit onto the workspace rules, producing the effective
// snapshot the engine evaluates for that agent. Tighten-only: the transaction
// limit becomes the min, and the allowed merchants become the intersection.
export function applyAgentLimits(rules: PolicyRuleSnapshot, limit: AgentLimit | undefined): PolicyRuleSnapshot {
  if (!limit) return rules;
  let next = rules;
  if (limit.perTxAtomic && limit.perTxAtomic !== "0") {
    next = { ...next, transactionLimit: usdcMoney(minAtomic(next.transactionLimit.amountAtomic, limit.perTxAtomic)) };
  }
  if (limit.merchants && limit.merchants.length > 0) {
    const allow = new Set(limit.merchants);
    next = { ...next, allowedMerchantIds: next.allowedMerchantIds.filter((m) => allow.has(m)) };
  }
  return next;
}
