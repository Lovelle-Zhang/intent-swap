// Shared visual shell for the hosted product surfaces (workspace, pay runs).
// These routes render server-built HTML strings; centralizing the chrome + a
// small design system here keeps every page consistent and each route small.

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
}

const STYLE = `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:#0a0a0b;color:#e7e5e4;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.5}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.wrap{max-width:880px;margin:0 auto;padding:56px 24px 96px}
.wrap.wide{max-width:1120px}
.eyebrow{margin:0;font-size:11px;font-weight:600;letter-spacing:.18em;color:#fbbf24}
.crumb{margin:8px 0 0;font-size:13px;color:#8b8b86}
.crumb b{color:#67e8f9;font-weight:600}
.crumb code{font-size:12px;color:#a8a29e}
h1{margin:18px 0 0;font-size:30px;font-weight:700;letter-spacing:-.02em}
.lead{margin:8px 0 0;color:#a8a29e}
.notice{margin:22px 0 0;padding:12px 16px;border:1px solid #1f2937;border-left:3px solid #34d399;border-radius:8px;background:#0e1512;color:#d1fae5;font-size:14px}
.card{margin:28px 0 0;padding:20px;border:1px solid #26262b;border-radius:12px;background:#111113}
.card h2{margin:0 0 14px;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#8b8b86}
.row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
label{font-size:13px;color:#a8a29e}
select,.btn{font:inherit;font-size:14px;border-radius:8px;border:1px solid #3f3f46;background:#18181b;color:#e7e5e4;padding:8px 12px}
select{min-width:150px}
.btn{cursor:pointer;font-weight:600;background:#e7e5e4;color:#18181b;border-color:#e7e5e4}
.btn:hover{background:#fff}
.btn.ghost{background:transparent;color:#a8a29e;border-color:#3f3f46;font-weight:500}
.btn.ghost:hover{background:#18181b;color:#e7e5e4}
.tablewrap{margin:22px 0 0;overflow-x:auto;border:1px solid #26262b;border-radius:12px}
table{border-collapse:collapse;width:100%;font-size:13px;white-space:nowrap}
th{padding:12px 16px;text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8b8b86;font-weight:600;border-bottom:1px solid #26262b;background:#141416}
td{padding:12px 16px;border-bottom:1px solid #1c1c1f;color:#d6d3d1}
td code{font-size:12px;color:#a8a29e}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
td.purpose{white-space:normal;max-width:340px}
td.muted{color:#8b8b86}
tr:last-child td{border-bottom:0}
tbody tr:hover td{background:#151517}
.empty{padding:26px;text-align:center;color:#78716c}
.badge{display:inline-block;font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;border:1px solid transparent;text-transform:capitalize}
.badge.ok{color:#6ee7b7;background:#052e22;border-color:#0f3d2e}
.badge.blocked{color:#fca5a5;background:#3a1414;border-color:#5b1d1d}
.badge.neutral{color:#cbd5e1;background:#1e293b;border-color:#334155}
dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:12px 28px;font-size:14px}
dt{color:#8b8b86}
dd{margin:0}
.actions{margin:28px 0 0;display:flex;flex-wrap:wrap;gap:18px;align-items:center}
a.link{color:#67e8f9;text-decoration:none;font-size:14px}
a.link:hover{text-decoration:underline}
`;

export function statusBadge(text: string, variant: "ok" | "blocked" | "neutral"): string {
  return `<span class="badge ${variant}">${escapeHtml(text)}</span>`;
}

export interface HostedPageOptions {
  readonly title: string;
  readonly heading: string;
  readonly workspace?: { readonly name: string; readonly projectId: string };
  readonly lead?: string;
  readonly notice?: string | null;
  readonly bodyHtml?: string;
  readonly actionsHtml?: string;
  readonly wide?: boolean;
}

export function hostedPage(options: HostedPageOptions): string {
  const wrapClass = options.wide ? "wrap wide" : "wrap";
  const crumb = options.workspace
    ? `<p class="crumb"><b>${escapeHtml(options.workspace.name)}</b> · <code>${escapeHtml(options.workspace.projectId)}</code></p>`
    : "";
  const lead = options.lead ? `<p class="lead">${escapeHtml(options.lead)}</p>` : "";
  const notice = options.notice ? `<p class="notice" role="status">${escapeHtml(options.notice)}</p>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(options.title)}</title><style>${STYLE}</style></head><body><main class="${wrapClass}"><p class="eyebrow">SANDBOX / NO REAL FUNDS</p>${crumb}<h1>${escapeHtml(options.heading)}</h1>${lead}${notice}${options.bodyHtml ?? ""}${options.actionsHtml ?? ""}</main></body></html>`;
}
