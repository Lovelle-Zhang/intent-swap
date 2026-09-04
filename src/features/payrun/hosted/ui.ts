// Shared visual shell for the hosted product surfaces (workspace, pay runs).
// These routes render server-built HTML strings; centralizing the chrome + a
// small design system here keeps every page consistent and each route small.
// Visual language matches the ZenFix landing: control-layer / ledger identity.

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
}

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Hanken+Grotesk:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">`;

const LOGO = `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x=".75" y=".75" width="38.5" height="38.5" rx="11" fill="var(--surface-2)" stroke="var(--line)"/><path d="M17.5 12.5 H13 V27.5 H17.5" fill="none" stroke="var(--signal)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M22.5 12.5 H27 V27.5 H22.5" fill="none" stroke="var(--signal)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="20" cy="20" r="3.1" fill="var(--sandbox)"/></svg>`;

const STYLE = `
:root{--bg:#0A0C0F;--surface:#111419;--surface-2:#161A20;--surface-3:#1B2027;--line:#232A33;--line-soft:#1A1F26;--text:#EBEDEF;--muted:#8A929C;--faint:#5A626C;--signal:#2DD4BF;--allow:#34D399;--block:#F2777A;--sandbox:#F5B841;--font-display:'Bricolage Grotesque',Georgia,serif;--font-body:'Hanken Grotesk',system-ui,sans-serif;--font-mono:'IBM Plex Mono',ui-monospace,monospace}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font-body);-webkit-font-smoothing:antialiased;line-height:1.55;background-image:linear-gradient(var(--line-soft) 1px,transparent 1px);background-size:100% 34px}
code{font-family:var(--font-mono)}
.topbar{border-bottom:1px solid var(--line-soft)}
.bar-in{max-width:880px;margin:0 auto;padding:0 24px;height:60px;display:flex;align-items:center;justify-content:space-between}
.bar-in.wide{max-width:1120px}
.brand{display:flex;align-items:center;gap:10px;color:var(--text);text-decoration:none;font-family:var(--font-display);font-weight:700;font-size:16px;letter-spacing:-.01em}
.brand svg{width:28px;height:28px;display:block}
.brand b{color:var(--muted);font-weight:600}
.sandbox-tag{font-family:var(--font-mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--sandbox);border:1px solid color-mix(in srgb,var(--sandbox) 40%,transparent);padding:3px 9px;border-radius:999px}
.wrap{max-width:880px;margin:0 auto;padding:40px 24px 96px}
.wrap.wide{max-width:1120px}
.eyebrow{margin:0;font-family:var(--font-mono);font-size:11px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.crumb{margin:0;font-family:var(--font-mono);font-size:13px;color:var(--faint)}
.crumb b{color:var(--signal);font-weight:500}
.crumb code{font-size:12px;color:var(--muted)}
h1{margin:14px 0 0;font-family:var(--font-display);font-size:32px;font-weight:700;letter-spacing:-.02em}
.lead{margin:8px 0 0;color:var(--muted)}
.notice{margin:22px 0 0;padding:12px 16px;border:1px solid var(--line);border-left:3px solid var(--allow);border-radius:10px;background:color-mix(in srgb,var(--allow) 8%,transparent);color:#CFF3E6;font-size:14px}
.card{margin:26px 0 0;padding:20px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}
.card h2{margin:0 0 14px;font-family:var(--font-mono);font-size:11px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
label{font-size:13px;color:var(--muted)}
select,.btn{font:inherit;font-size:14px;border-radius:9px;border:1px solid var(--line);background:var(--surface-2);color:var(--text);padding:9px 13px}
select{min-width:160px;font-family:var(--font-mono);font-size:13px}
.btn{cursor:pointer;font-weight:600;background:var(--signal);color:#04201C;border-color:var(--signal)}
.btn:hover{background:#3EE9D3}
.btn.ghost{background:transparent;color:var(--muted);border-color:var(--line);font-weight:500}
.btn.ghost:hover{background:var(--surface-2);color:var(--text)}
.tablewrap{margin:22px 0 0;overflow-x:auto;border:1px solid var(--line);border-radius:14px}
table{border-collapse:collapse;width:100%;font-size:13px;white-space:nowrap}
th{padding:12px 16px;text-align:left;font-family:var(--font-mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);font-weight:500;border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--surface-3) 55%,transparent)}
td{padding:13px 16px;border-bottom:1px solid var(--line-soft);color:var(--text)}
td code{font-family:var(--font-mono);font-size:12px;color:var(--muted)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;font-family:var(--font-mono)}
td.purpose{white-space:normal;max-width:340px;color:var(--muted)}
td.muted{color:var(--faint);font-family:var(--font-mono);font-size:12px}
tr:last-child td{border-bottom:0}
tbody tr:hover td{background:color-mix(in srgb,var(--surface-2) 60%,transparent)}
.empty{padding:28px;text-align:center;color:var(--faint)}
.badge{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-mono);font-size:11px;font-weight:500;padding:3px 10px;border-radius:999px;border:1px solid transparent;text-transform:uppercase;letter-spacing:.04em}
.badge::before{content:"";width:5px;height:5px;border-radius:50%;background:currentColor}
.badge.ok{color:var(--allow);background:color-mix(in srgb,var(--allow) 12%,transparent);border-color:color-mix(in srgb,var(--allow) 34%,transparent)}
.badge.blocked{color:var(--block);background:color-mix(in srgb,var(--block) 12%,transparent);border-color:color-mix(in srgb,var(--block) 34%,transparent)}
.badge.neutral{color:var(--muted);background:color-mix(in srgb,var(--muted) 12%,transparent);border-color:var(--line)}
dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:12px 28px;font-size:14px}
dt{color:var(--muted);font-family:var(--font-mono);font-size:12px;text-transform:uppercase;letter-spacing:.06em}
dd{margin:0;color:var(--text)}
.actions{margin:28px 0 0;display:flex;flex-wrap:wrap;gap:18px;align-items:center}
a.link{color:var(--signal);text-decoration:none;font-size:14px}
a.link:hover{text-decoration:underline}
:focus-visible{outline:2px solid var(--signal);outline-offset:2px;border-radius:6px}
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
  const barClass = options.wide ? "bar-in wide" : "bar-in";
  const crumb = options.workspace
    ? `<p class="crumb"><b>${escapeHtml(options.workspace.name)}</b> · <code>${escapeHtml(options.workspace.projectId)}</code></p>`
    : "";
  const lead = options.lead ? `<p class="lead">${escapeHtml(options.lead)}</p>` : "";
  const notice = options.notice ? `<p class="notice" role="status">${escapeHtml(options.notice)}</p>` : "";
  const topbar = `<header class="topbar"><div class="${barClass}"><a class="brand" href="/">${LOGO} ZenFix <b>PayRun</b></a><span class="sandbox-tag">Sandbox · No real funds</span></div></header>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(options.title)}</title>${FONTS}<style>${STYLE}</style></head><body>${topbar}<main class="${wrapClass}">${crumb}<h1>${escapeHtml(options.heading)}</h1>${lead}${notice}${options.bodyHtml ?? ""}${options.actionsHtml ?? ""}</main></body></html>`;
}
