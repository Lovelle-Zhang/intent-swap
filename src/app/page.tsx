import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ZenFix PayRun — Agent Payment Control Layer",
  description:
    "Let AI agents spend money inside your rules. Every payment attempt becomes an explainable, auditable Pay Run. Sandbox — no real funds.",
};

const FEATURES = [
  {
    icon: "🛡",
    title: "Policy-gated spending",
    desc: "Every payment an agent attempts is checked against your budget and rules before anything moves — allowed, held for review, or blocked.",
  },
  {
    icon: "🧾",
    title: "Explainable Pay Runs",
    desc: "Each attempt becomes an auditable Pay Run carrying its policy decision, reason codes, and full trail — nothing happens off the record.",
  },
  {
    icon: "🗂",
    title: "Persistent workspace",
    desc: "Sign in with Google and your sandbox workspace and its Pay Runs are always there when you come back.",
  },
];

const STEPS = [
  { n: "1", t: "Agent proposes a payment", d: "An AI agent submits an intent — recipient, amount, and purpose." },
  { n: "2", t: "The control layer decides", d: "ZenFix evaluates it against your budget and policy in one deterministic pass." },
  { n: "3", t: "The outcome is recorded", d: "Allowed, held, or blocked — captured as an auditable Pay Run you can inspect." },
];

export default function HomePage() {
  return (
    <div>
      <section className="mx-auto max-w-4xl px-6 pt-24 pb-16 text-center">
        <p className="text-xs font-semibold tracking-[0.18em] text-amber-400">SANDBOX · NO REAL FUNDS</p>
        <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight text-stone-50 sm:text-6xl">
          Let AI agents spend money
          <br className="hidden sm:block" /> inside your rules.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-stone-400">
          ZenFix PayRun is an agent payment control layer. Every payment an agent attempts is
          policy-checked and captured as an explainable, auditable Pay Run.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/zenfix/sign-in"
            className="rounded-lg bg-cyan-400 px-6 py-3 font-semibold text-stone-950 transition-colors hover:bg-cyan-300"
          >
            Sign in with Google
          </Link>
          <Link
            href="/command-center"
            className="rounded-lg border border-stone-700 px-6 py-3 font-medium text-stone-200 transition-colors hover:bg-stone-900"
          >
            Explore the sandbox
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-12">
        <div className="grid gap-6 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-stone-800 bg-stone-900/40 p-6">
              <div className="text-2xl" aria-hidden>{f.icon}</div>
              <h3 className="mt-4 text-lg font-semibold text-stone-100">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-12">
        <h2 className="text-center text-sm font-semibold uppercase tracking-[0.12em] text-stone-500">How it works</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border border-stone-800 p-6">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-800 text-sm font-semibold text-cyan-300">
                {s.n}
              </div>
              <h3 className="mt-4 font-semibold text-stone-100">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-400">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h2 className="text-2xl font-bold text-stone-50">Try the sandbox</h2>
        <p className="mt-3 text-stone-400">One click with Google. No real funds ever move.</p>
        <Link
          href="/zenfix/sign-in"
          className="mt-6 inline-block rounded-lg bg-cyan-400 px-6 py-3 font-semibold text-stone-950 transition-colors hover:bg-cyan-300"
        >
          Sign in with Google
        </Link>
      </section>

      <footer className="border-t border-stone-800/70">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-stone-500">
          <span>ZenFix PayRun · Sandbox — no real funds</span>
          <nav className="flex gap-5">
            <Link href="/privacy" className="hover:text-stone-300">Privacy</Link>
            <Link href="/terms" className="hover:text-stone-300">Terms</Link>
            <Link href="/swap" className="hover:text-stone-300">Intent Swap</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
