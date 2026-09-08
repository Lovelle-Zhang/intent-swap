// Shared visual shell for the hosted product surfaces (workspace, pay runs).
// These routes render server-built HTML strings; centralizing the chrome + a
// small design system here keeps every page consistent and each route small.
// The design-system CSS + brand mark live in ui-styles.ts (STYLE / LOGO).

import { LOGO, STYLE } from "./ui-styles";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
}

export const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Hanken+Grotesk:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">`;

export function statusBadge(text: string, variant: "ok" | "blocked" | "hold" | "neutral"): string {
  return `<span class="badge ${variant}">${escapeHtml(text)}</span>`;
}

export interface HostedPageOptions {
  readonly title: string;
  readonly heading: string;
  readonly workspace?: { readonly name: string; readonly projectId: string };
  readonly lead?: string;
  readonly notice?: string | null;
  readonly noticeVariant?: "ok" | "warn";
  readonly bodyHtml?: string;
  readonly actionsHtml?: string;
  readonly wide?: boolean;
  readonly active?: "overview" | "payruns" | "policy" | "keys";
}

export function hostedPage(options: HostedPageOptions): string {
  const wrapClass = options.wide ? "wrap wide" : "wrap";
  const barClass = options.wide ? "bar-in wide" : "bar-in";
  const crumb = options.workspace
    ? `<p class="crumb"><b>${escapeHtml(options.workspace.name)}</b> · <code>${escapeHtml(options.workspace.projectId)}</code></p>`
    : "";
  const lead = options.lead ? `<p class="lead">${escapeHtml(options.lead)}</p>` : "";
  const notice = options.notice
    ? `<p class="notice${options.noticeVariant === "warn" ? " warn" : ""}" role="status">${escapeHtml(options.notice)}</p>`
    : "";
  const navItem = (id: "overview" | "payruns" | "policy" | "keys", href: string, label: string) =>
    `<a href="${href}"${options.active === id ? ' class="on" aria-current="page"' : ""}>${label}</a>`;
  const topbar = `<header class="topbar"><div class="${barClass}"><div class="bar-left"><a class="brand" href="/zenfix/workspace">${LOGO} ZenFix <b>PayRun</b></a><nav class="appnav">${navItem("overview", "/zenfix/workspace", "Overview")}${navItem("payruns", "/zenfix/payruns", "Pay Runs")}${navItem("policy", "/zenfix/policy", "Policy")}${navItem("keys", "/zenfix/keys", "API Keys")}<a href="/api-docs">Docs</a></nav></div><div class="bar-right"><span class="sandbox-tag">Sandbox · No real funds</span><form action="/zenfix/sign-out" method="post"><button type="submit" class="signout">Sign out</button></form></div></div></header>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(options.title)}</title>${FONTS}<style>${STYLE}</style></head><body>${topbar}<main class="${wrapClass}">${crumb}<h1>${escapeHtml(options.heading)}</h1>${lead}${notice}${options.bodyHtml ?? ""}${options.actionsHtml ?? ""}</main></body></html>`;
}
