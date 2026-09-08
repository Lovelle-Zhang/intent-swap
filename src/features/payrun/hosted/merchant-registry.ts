import { escapeHtml } from "./ui";

// Merchant payout registry: owner-approved on-chain payout address per merchant
// id. Used at execution-verification time to require that a base-sepolia payment
// actually went to the address the owner pinned for that merchant. Kept out of
// policy-form.ts (size budget) and out of the domain PolicyRuleSnapshot — like
// agent budgets/limits, it is a hosted concern, not part of the pure engine.

export type MerchantAddresses = Record<string, string>; // merchantId -> "0x..." (lowercased)

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function isAddress(value: string): boolean {
  return ADDRESS_RE.test(value.trim());
}

export type MerchantAddressesResult =
  | { readonly ok: true; readonly addresses: MerchantAddresses }
  | { readonly ok: false; readonly error: string };

// Parse the "merchantId = 0xaddress" textarea. Blank lines skipped; a malformed
// address is rejected so the owner sees a clear error, not a silent drop.
export function parseMerchantAddresses(raw: string): MerchantAddressesResult {
  const map: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const eq = trimmed.indexOf("=");
    const merchantId = (eq === -1 ? trimmed : trimmed.slice(0, eq)).trim();
    const address = eq === -1 ? "" : trimmed.slice(eq + 1).trim();
    if (merchantId.length === 0) continue;
    if (!isAddress(address)) {
      return { ok: false, error: `Payout address for ${merchantId} must be a 0x… 40-hex address (e.g. acme_api = 0x1234…).` };
    }
    map[merchantId] = address.toLowerCase();
  }
  return { ok: true, addresses: map };
}

export function merchantAddressesToText(map: MerchantAddresses): string {
  return Object.entries(map).map(([id, addr]) => `${id} = ${addr}`).join("\n");
}

export function renderMerchantAddressField(text: string): string {
  return `<div class="card"><h2>Merchant payout addresses</h2>
    <div class="field"><label for="merchantAddresses">Approved on-chain addresses</label>
    <textarea id="merchantAddresses" name="merchantAddresses" placeholder="one per line: merchantId = 0xaddress">${escapeHtml(text)}</textarea>
    <span class="hint">Optional. One per line: <code>merchantId = 0x…</code>. When set, a Base Sepolia execution for that merchant is verified to have paid <b>this</b> address — not just any address the agent names.</span></div>
  </div>`;
}

// The pinned address for a merchant, or null when none is configured.
export function lookupMerchantAddress(map: MerchantAddresses, merchantId: string): string | null {
  return map[merchantId] ?? null;
}
