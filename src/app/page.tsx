import Link from "next/link";
import type { Metadata } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./home.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-display" });
const body = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "ZenFix PayRun — Agent Payment Control Layer",
  description:
    "ZenFix sits between your AI agents and the money. Every payment they attempt is checked against your rules, then recorded as an auditable Pay Run. Sandbox — no real funds.",
};

const CHECKS = ["Within daily budget", "Recipient allow-listed", "Policy: purchase ≤ $1"];
const STEPS = [
  { n: "01 · intent", t: "The agent proposes", d: "An agent submits who to pay, how much, and what for — a structured intent, not a raw transfer." },
  { n: "02 · policy", t: "The layer decides", d: "Budget, recipient, and your policies are evaluated in one deterministic pass — allow, hold, or block." },
  { n: "03 · record", t: "It becomes a Pay Run", d: "The outcome, its reason codes, and the full trail are written down. Nothing happens off the record." },
];
const STATES = [
  { c: "a", label: "Allowed", p: "Cleared every rule and executed inside budget.", rc: "reason: within_budget, recipient_ok" },
  { c: "h", label: "Held", p: "Needs a human. Parked for review, nothing moved.", rc: "reason: over_soft_limit" },
  { c: "b", label: "Blocked", p: "Violated a hard rule and was stopped cold.", rc: "reason: recipient_not_listed" },
];

function Logo() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <rect x=".75" y=".75" width="38.5" height="38.5" rx="11" fill="var(--surface-2)" stroke="var(--line)" />
      <path d="M17.5 12.5 H13 V27.5 H17.5" fill="none" stroke="var(--signal)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22.5 12.5 H27 V27.5 H22.5" fill="none" stroke="var(--signal)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="20" cy="20" r="3.1" fill="var(--sandbox)" />
    </svg>
  );
}
const Check = () => (
  <span className="mark"><svg viewBox="0 0 12 12"><path d="M2 6.5 5 9 10 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
);

export default function HomePage() {
  return (
    <div className={`zf-home ${display.variable} ${body.variable} ${mono.variable}`}>
      <header className="bar">
        <div className="wrap">
          <Link className="brand" href="/"><Logo /> ZenFix <span className="tag">Sandbox</span></Link>
          <nav className="navlinks">
            <a href="#how">How it works</a>
            <a href="#states">Pay Runs</a>
            <Link className="btn btn-primary" href="/zenfix/sign-in">Sign in with Google</Link>
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="wrap">
          <div>
            <span className="kicker"><span className="dot" /><span className="eyebrow">Agent Payment Control Layer</span></span>
            <h1>Let agents pay.<br />On <em>your</em> terms.</h1>
            <p className="lede">ZenFix sits between your AI agents and the money. Every payment they attempt is checked against your rules — then recorded as a Pay Run you can read.</p>
            <div className="cta">
              <Link className="btn btn-primary" href="/zenfix/sign-in">Sign in with Google</Link>
              <Link className="btn btn-ghost" href="/command-center">Explore the sandbox →</Link>
            </div>
            <div className="trust">
              <span><b>No real funds</b> — simulated</span>
              <span><b>One-click</b> Google sign-in</span>
              <span><b>Every run</b> auditable</span>
            </div>
          </div>
          <div className="payrun" role="img" aria-label="A sandbox Pay Run evaluated and allowed by policy">
            <div className="top"><span className="id">PAY&nbsp;RUN&nbsp;·&nbsp;<b>payrun_dd27f286</b></span><span className="live">Evaluating</span></div>
            <div className="body">
              <div className="field"><span className="k">Agent</span><span className="v mono">agent_sandbox_004</span></div>
              <div className="field"><span className="k">Purpose</span><span className="v">Purchase a verified API result</span></div>
              <div className="field"><span className="k">Amount</span><span className="v num">0.42 USDC</span></div>
              <div className="gate">
                <div className="checks">
                  {CHECKS.map((c) => (
                    <div className="check" key={c}><Check /> {c} <span className="pass mono">pass</span></div>
                  ))}
                </div>
                <div className="stamp"><span className="lab">Policy decision</span><span className="out"><span className="ring" />Allowed</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="block" id="how">
        <div className="wrap">
          <span className="eyebrow">How the control layer works</span>
          <h2 className="lead-h">A payment is a request first, money second.</h2>
          <p className="lead-p">Nothing leaves until it clears your rules. Each attempt runs through one deterministic pass and lands as an explainable record.</p>
          <div className="flow">
            {STEPS.map((s, i) => (
              <div className="step" key={s.n}>{i < 2 && <span className="wire" />}<div className="n">{s.n}</div><h3>{s.t}</h3><p>{s.d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="block" id="states">
        <div className="wrap">
          <span className="eyebrow">Three outcomes · one vocabulary</span>
          <h2 className="lead-h">Read any Pay Run at a glance.</h2>
          <p className="lead-p">The same decision language runs through the whole product — the list, the detail, and the audit trail.</p>
          <div className="states">
            {STATES.map((s) => (
              <div className={`state ${s.c}`} key={s.label}><span className="pill"><span className="d" />{s.label}</span><p>{s.p}</p><div className="rc">{s.rc}</div></div>
            ))}
          </div>
        </div>
      </section>

      <section className="close">
        <div className="wrap">
          <h2>Give your agents a budget,<br />not the keys.</h2>
          <p>One click with Google. It&rsquo;s a sandbox — no real funds ever move.</p>
          <div className="cta">
            <Link className="btn btn-primary" href="/zenfix/sign-in">Sign in with Google</Link>
            <Link className="btn btn-ghost" href="/command-center">Explore the sandbox →</Link>
          </div>
        </div>
      </section>

      <footer className="foot">
        <div className="wrap">
          <span>ZenFix PayRun · Sandbox — no real funds</span>
          <nav>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/swap">Intent Swap</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
