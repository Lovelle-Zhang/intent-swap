import type { ApiKeyView } from "./api-keys";
import { escapeHtml, statusBadge } from "./ui";

function fmt(iso: string | null): string {
  return iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : "—";
}

function revokeButton(id: string): string {
  return `<form method="post" action="/zenfix/keys" class="inline"><input type="hidden" name="action" value="revoke"><input type="hidden" name="keyId" value="${escapeHtml(id)}"><button type="submit" class="btn ghost sm">Revoke</button></form>`;
}

function row(key: ApiKeyView): string {
  const status = key.revokedAt ? statusBadge("revoked", "neutral") : statusBadge("active", "ok");
  const action = key.revokedAt ? "" : revokeButton(key.id);
  return `<tr><td><code>${escapeHtml(key.prefix)}…</code></td><td>${escapeHtml(key.label || "—")}</td><td class="muted">${fmt(key.createdAt)}</td><td class="muted">${fmt(key.lastUsedAt)}</td><td>${status}</td><td>${action}</td></tr>`;
}

function usageCard(apiUrl: string): string {
  const curl = `curl -X POST ${apiUrl} \\
  -H "Authorization: Bearer zfk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"agentId":"agent_ops_01","purpose":"Buy a verified API result","amount":"12.50",
       "merchant":{"id":"acme_api","payee":"ACME","category":"api"},"artifactType":"api_result"}'`;
  return `<div class="card"><h2>Using a key</h2><p class="lead">Your agent submits an intent; ZenFix checks it against your <a class="link" href="/zenfix/policy">Policy</a> and returns an allow / needs-review / block decision. No funds move — the decision and its full trail land in <a class="link" href="/zenfix/payruns">Pay Runs</a>. See the full <a class="link" href="/docs">API reference</a>.</p><pre class="curl"><code>${escapeHtml(curl)}</code></pre></div>`;
}

export function renderKeysBody(keys: readonly ApiKeyView[], apiUrl: string, newKey?: string): string {
  const banner = newKey
    ? `<div class="card newkey"><h2>New key — copy it now</h2><p class="lead">This is the only time the full key is shown. Store it somewhere safe; you can revoke it anytime.</p><div class="keyval"><code>${escapeHtml(newKey)}</code></div></div>`
    : "";
  const createForm = `<div class="card"><h2>Create a key</h2><form class="row" method="post" action="/zenfix/keys"><input type="hidden" name="action" value="create"><label for="label">Label</label><input type="text" id="label" name="label" placeholder="e.g. production agent" maxlength="80"><button type="submit" class="btn">Create key</button></form></div>`;
  const rows = keys.length === 0
    ? `<tr><td colspan="6" class="empty">No API keys yet. Create one to let an agent call the intake API.</td></tr>`
    : keys.map(row).join("");
  const table = `<div class="tablewrap"><table><thead><tr><th>Key</th><th>Label</th><th>Created</th><th>Last used</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  return banner + createForm + table + usageCard(apiUrl);
}
