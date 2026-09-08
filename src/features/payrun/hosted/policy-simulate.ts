import type { CanonicalPolicyDecision } from "../domain/types";
import type { IntakeInput } from "./intake";
import { usdcToAtomic } from "./policy-form";
import { escapeHtml, statusBadge } from "./ui";

// Policy dry-run: evaluate a hypothetical intent against the CURRENT saved policy
// with the real engine, WITHOUT persisting anything, so an owner can test how a
// change would decide before an agent ever sends it. GET form → the simulate
// route calls evaluateWorkspaceIntent and renders the decision below.

export interface SimulateValues {
  readonly agentId: string;
  readonly purpose: string;
  readonly amount: string;
  readonly merchantId: string;
  readonly payee: string;
  readonly category: string;
  readonly artifactType: string;
}

const DEFAULTS: SimulateValues = {
  agentId: "agent_ops_01", purpose: "Dry run", amount: "20",
  merchantId: "acme_api", payee: "ACME", category: "api", artifactType: "api_result",
};

export function simulateValues(params: URLSearchParams): SimulateValues {
  const g = (k: keyof SimulateValues) => (params.get(k) ?? "").trim();
  return {
    agentId: g("agentId"), purpose: g("purpose"), amount: g("amount"),
    merchantId: g("merchantId"), payee: g("payee"), category: g("category"),
    artifactType: g("artifactType") || "api_result",
  };
}

export type SimulateParse =
  | { readonly ok: true; readonly input: IntakeInput }
  | { readonly ok: false; readonly error: string };

export function parseSimulateInput(v: SimulateValues): SimulateParse {
  if (!v.agentId || !v.merchantId || !v.payee || !v.category) {
    return { ok: false, error: "Agent, merchant id, payee, and category are all required." };
  }
  if (usdcToAtomic(v.amount) === null) {
    return { ok: false, error: "Amount must be a USDC value with up to 6 decimals (e.g. 20 or 12.50)." };
  }
  return {
    ok: true,
    input: {
      agentId: v.agentId, purpose: v.purpose || "Dry run", amount: v.amount,
      merchant: { id: v.merchantId, payee: v.payee, category: v.category },
      artifactType: v.artifactType, idempotencyKey: "dry-run", // never persisted
    },
  };
}

function field(name: keyof SimulateValues, label: string, value: string, type = "text"): string {
  return `<label for="sim_${name}">${label}</label><input type="${type}"${type === "number" ? ' min="0" step="0.000001"' : ""} id="sim_${name}" name="${name}" value="${escapeHtml(value)}">`;
}

export function renderSimulateForm(v: SimulateValues = DEFAULTS): string {
  return `<div class="card"><h2>Test an intent</h2>
    <p class="lead">Evaluate a hypothetical payment against the policy above — nothing is saved. Use it to check a change before an agent sends anything.</p>
    <form class="row" method="get" action="/zenfix/policy/simulate">
      ${field("agentId", "Agent", v.agentId)}
      ${field("amount", "Amount", v.amount, "number")}
      ${field("merchantId", "Merchant", v.merchantId)}
      ${field("category", "Category", v.category)}
      <button type="submit" class="btn">Dry-run</button>
    </form></div>`;
}

function variantOf(outcome: string): "ok" | "hold" | "blocked" | "neutral" {
  if (["allowed", "pass", "approved"].includes(outcome)) return "ok";
  if (["needs_review", "review"].includes(outcome)) return "hold";
  if (["blocked", "block", "denied"].includes(outcome)) return "blocked";
  return "neutral";
}
const humanize = (s: string) => s.replace(/_/g, " ");

export function renderSimulateResult(v: SimulateValues, decision: CanonicalPolicyDecision): string {
  const chips = decision.reasonCodes.length
    ? `<div class="chips">${decision.reasonCodes.map((r) => `<span class="chip">${escapeHtml(r)}</span>`).join("")}</div>`
    : "";
  const checks = `<ul class="checklist">${decision.checks.map((c) =>
    `<li><span class="mk ${variantOf(c.outcome)}"></span><div><span class="rc">${escapeHtml(humanize(c.ruleClass))} · ${escapeHtml(c.reasonCode)}</span><p>${escapeHtml(c.explanation)}</p></div></li>`).join("")}</ul>`;
  return `<div class="card"><h2>Dry-run decision</h2>
    <p class="hint">Simulated only — no Pay Run was created. ${escapeHtml(v.agentId)} · ${escapeHtml(v.amount)} USDC → ${escapeHtml(v.merchantId)}</p>
    <div class="detail-head">${statusBadge(humanize(decision.outcome), variantOf(decision.outcome))}<span class="meta"><span>Risk <b>${escapeHtml(decision.riskLevel)}</b></span><span>Next <b>${escapeHtml(humanize(decision.nextAction))}</b></span></span></div>
    ${chips}${checks}</div>`;
}
