import type { PolicyFormValues } from "./policy-form";
import { escapeHtml } from "./ui";

// The dumb HTML renderer for the /zenfix/policy form. Both the GET (from saved
// rules) and the POST error path (from raw submitted input) feed the same
// PolicyFormValues here, so a validation error never discards what the owner
// typed. Rendering lives apart from the form <-> policy translation.

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
      ${amountField("dailyBudget", "Daily budget", "0 or empty = unlimited.", values.dailyBudget)}
    </div>
      ${listField("agentBudgets", "Agent budgets", "One per line: agentId = daily USDC (e.g. agent_ops_01 = 50). Empty = no per-agent cap.", values.agentBudgets)}
    </div>
    <div class="card"><h2>Merchants</h2>
      ${listField("allowedMerchantIds", "Allowed merchants", "Merchant IDs that are pre-approved.", values.allowedMerchantIds)}
      ${listField("blockedMerchantIds", "Blocked merchants", "Merchant IDs that are always denied.", values.blockedMerchantIds)}
      ${listField("blockedCategories", "Blocked categories", "Merchant categories that are always denied.", values.blockedCategories)}
      <label class="check"><input type="checkbox" name="requireReviewForNewMerchant"${checked}><span class="ct">Require review for new merchants<small>A merchant not seen before must be reviewed before its first payment.</small></span></label>
    </div>
    <div class="actions"><button type="submit" class="btn">Save policy</button><a class="link" href="/zenfix/payruns">← Back to Pay Runs</a></div>
  </form>`;
}
