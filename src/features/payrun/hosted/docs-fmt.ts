import { escapeHtml } from "./ui";

// Shared shape + formatting helpers for the /api-docs content. The sections
// themselves live in docs-sections.ts (intro) and docs-api-sections.ts (endpoints).

export interface DocSection {
  readonly id: string;
  readonly title: string;
  readonly html: string;
}

export const pre = (code: string) => `<pre class="code"><code>${escapeHtml(code)}</code></pre>`;
export const lang = (label: string, code: string) => `<p class="lang">${label}</p>${pre(code)}`;
export const trio = (curl: string, py: string, js: string) =>
  `${lang("curl", curl)}${lang("Python", py)}${lang("JavaScript", js)}`;
