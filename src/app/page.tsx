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
    "ZenFix authorizes and audits every payment your AI agents attempt — checked against your rules, then verified on-chain that it really happened, to the address you approved. It never holds your funds or keys. Test mode on Base Sepolia.",
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
const VERIFY = [
  { n: "not just decided", t: "The agent pays on its own rail", d: "ZenFix never holds your funds or private keys. Your agent executes the payment itself and reports the transaction back." },
  { n: "read the chain", t: "We confirm it really happened", d: "On Base Sepolia, ZenFix reads the public chain and checks the transaction succeeded, moved USDC, and paid at least the amount you authorized." },
  { n: "to the right party", t: "…to the address you approved", d: "Pin a payout address per merchant and verification requires the transfer to have gone there — a claim the chain doesn't back is rejected, not recorded." },
];
const TRUST = [
  { n: "isolated", t: "Your workspace, only yours", d: "Every workspace is row-level isolated in the database. One tenant can never read another's Pay Runs, policy, or keys." },
  { n: "no custody", t: "We hold no funds, no keys", d: "ZenFix decides and verifies — it never moves money. API keys are stored only as hashes; the full key is shown once and can only be revoked." },
  { n: "on the record", t: "Every decision is auditable", d: "Each Pay Run keeps its intent, the rule-by-rule decision, the human review, and the execution proof — an append-only trail you can read end to end." },
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
          <Link className="brand" href="/"><Logo /> ZenFix <span className="tag">Test mode</span></Link>
          <nav className="navlinks">
            <a href="#how">How it works</a>
            <a href="#states">Pay Runs</a>
            <a href="/api-docs">API docs</a>
            <Link className="btn btn-primary" href="/zenfix/sign-in">Sign in with Google</Link>
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="wrap">
          <div>
            <span className="kicker"><span className="dot" /><span className="eyebrow">Agent Payment Control Layer</span></span>
            <h1>Let agents pay.<br />On <em>your</em> terms.</h1>
            <p className="lede">ZenFix sits between your AI agents and the money. Every payment they attempt is checked against your rules — then <em>verified on-chain</em> that it really happened, to the address you approved. It never holds your funds or keys.</p>
            <div className="cta">
              <Link className="btn btn-primary" href="/zenfix/sign-in">Sign in with Google</Link>
              <a className="btn btn-ghost" href="#verify">See how it works</a>
            </div>
            <div className="trust">
              <span><b>Test mode</b> on Base Sepolia</span>
              <span><b>Verified</b> on-chain, not self-reported</span>
              <span><b>Never</b> holds funds or keys</span>
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

      <section className="block" id="verify">
        <div className="wrap">
          <span className="eyebrow">Verified, not self-reported</span>
          <h2 className="lead-h">&ldquo;Executed&rdquo; is a fact, not a claim.</h2>
          <p className="lead-p">Most tools take an agent&rsquo;s word that a payment went through. ZenFix reads the chain and checks — before a Pay Run is marked done.</p>
          <div className="flow">
            {VERIFY.map((s, i) => (
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

      <section className="block" id="trust">
        <div className="wrap">
          <span className="eyebrow">Built to be trusted with the decision</span>
          <h2 className="lead-h">You keep the money. We keep the record.</h2>
          <p className="lead-p">ZenFix is the authorization and audit layer — deliberately never the custodian.</p>
          <div className="flow">
            {TRUST.map((s, i) => (
              <div className="step" key={s.n}>{i < 2 && <span className="wire" />}<div className="n">{s.n}</div><h3>{s.t}</h3><p>{s.d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="close">
        <div className="wrap">
          <h2>Give your agents a budget,<br />not the keys.</h2>
          <p>One click with Google. Free while in test mode on Base Sepolia — production access on request.</p>
          <div className="cta">
            <Link className="btn btn-primary" href="/zenfix/sign-in">Sign in with Google</Link>
            <a className="btn btn-ghost" href="/api-docs">Read the API</a>
          </div>
        </div>
      </section>

      <footer className="foot">
        <div className="wrap">
          <span>ZenFix PayRun · Test mode — verified on Base Sepolia, no mainnet funds</span>
          <nav>
            <a href="/api-docs">API docs</a>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/swap">Intent Swap</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
