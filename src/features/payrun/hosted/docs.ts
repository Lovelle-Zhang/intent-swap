import { escapeHtml, FONTS } from "./ui";
import { DOC_SECTIONS } from "./docs-sections";

// Public, unauthenticated API reference at /docs — shareable with developers.
// Control-layer identity, single column; content lives in docs-sections.ts.

const LOGO = `<svg viewBox="0 0 32 24" width="26" height="20" fill="none" aria-hidden="true"><path d="M11 3H5.5v18H11" stroke="var(--signal)" stroke-width="2.6" stroke-linecap="round"/><path d="M21 3h5.5v18H21" stroke="var(--signal)" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="12" r="3" fill="var(--sandbox)"/></svg>`;

const STYLE = `
:root{--bg:#0A0C0F;--surface:#111419;--surface-2:#161A20;--line:#232A33;--line-soft:#1A1F26;--text:#EBEDEF;--muted:#8A929C;--faint:#5A626C;--signal:#2DD4BF;--sandbox:#F5B841;--display:'Bricolage Grotesque',Georgia,serif;--body:'Hanken Grotesk',system-ui,sans-serif;--mono:'IBM Plex Mono',ui-monospace,monospace}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--body);line-height:1.6;-webkit-font-smoothing:antialiased;background-image:linear-gradient(var(--line-soft) 1px,transparent 1px);background-size:100% 34px}
.top{border-bottom:1px solid var(--line-soft)}
.top-in{max-width:820px;margin:0 auto;padding:16px 24px;display:flex;align-items:center;gap:10px}
.brand{display:flex;align-items:center;gap:9px;color:var(--text);text-decoration:none;font-family:var(--display);font-weight:700;font-size:16px}
.brand b{color:var(--muted);font-weight:600}
.top .spacer{flex:1}
.top a.app{color:var(--muted);text-decoration:none;font-size:13px}.top a.app:hover{color:var(--text)}
main{max-width:820px;margin:0 auto;padding:44px 24px 100px}
.hero h1{margin:0;font-family:var(--display);font-size:34px;font-weight:700;letter-spacing:-.02em}
.hero p{margin:10px 0 0;color:var(--muted);font-size:16px}
.pill{display:inline-block;margin-top:16px;font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--sandbox);border:1px solid color-mix(in srgb,var(--sandbox) 40%,transparent);padding:4px 10px;border-radius:999px}
nav.toc{display:flex;flex-wrap:wrap;gap:8px;margin:26px 0 8px}
nav.toc a{font-family:var(--mono);font-size:12px;color:var(--muted);text-decoration:none;border:1px solid var(--line);border-radius:7px;padding:5px 10px}
nav.toc a:hover{color:var(--text);border-color:var(--signal)}
section{margin-top:38px;scroll-margin-top:20px}
h2{font-family:var(--display);font-size:22px;font-weight:700;margin:0 0 12px;padding-top:18px;border-top:1px solid var(--line-soft)}
p{margin:12px 0}
ul{margin:12px 0;padding-left:20px}li{margin:6px 0}
ul.codes,ul.codes li{list-style:none;padding-left:0}
a.link{color:var(--signal);text-decoration:none}a.link:hover{text-decoration:underline}
.muted{color:var(--muted);font-size:14px}
.mono{font-family:var(--mono);font-size:.92em;color:var(--text)}
.verb{font-family:var(--mono);font-size:12px;font-weight:600;color:#04201C;background:var(--signal);border-radius:6px;padding:2px 8px;letter-spacing:.04em}
pre.code{margin:14px 0;padding:15px 17px;background:var(--surface-2);border:1px solid var(--line);border-radius:10px;overflow-x:auto}
pre.code code{font-family:var(--mono);font-size:12.5px;color:var(--muted);white-space:pre;line-height:1.65}
footer{max-width:820px;margin:0 auto;padding:0 24px 80px;color:var(--faint);font-size:13px}
:focus-visible{outline:2px solid var(--signal);outline-offset:2px;border-radius:6px}
`;

export function renderDocsPage(): string {
  const toc = DOC_SECTIONS.map((s) => `<a href="#${s.id}">${escapeHtml(s.title)}</a>`).join("");
  const body = DOC_SECTIONS.map(
    (s) => `<section id="${s.id}"><h2>${escapeHtml(s.title)}</h2>${s.html}</section>`,
  ).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ZenFix PayRun — API Reference</title>${FONTS}<style>${STYLE}</style></head><body><header class="top"><div class="top-in"><a class="brand" href="/">${LOGO} ZenFix <b>PayRun</b></a><span class="spacer"></span><a class="app" href="/zenfix/workspace">Open app →</a></div></header><main><div class="hero"><h1>API Reference</h1><p>Let agents pay — on your terms. A control layer that decides and logs every payment before a cent moves.</p><span class="pill">Authorization + audit · never moves funds</span></div><nav class="toc">${toc}</nav>${body}</main><footer>ZenFix PayRun · this API authorizes and records payment decisions; execution happens on your own rail.</footer></body></html>`;
}
