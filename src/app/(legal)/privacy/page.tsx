import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy — ZenFix PayRun", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="updated">Last updated September 18, 2026</p>
      <p className="intro">
        ZenFix PayRun (&ldquo;ZenFix&rdquo;) is an agent payment control layer: it authorizes and audits
        the payments your AI agents attempt, and verifies them on-chain. It never holds your funds or
        keys and never moves money itself. The hosted service runs in <strong>test mode on Base
        Sepolia</strong>, a public testnet; test-mode amounts are testnet USDC with no monetary value.
      </p>

      <section>
        <h2>What we collect</h2>
        <p>
          When you sign in with Google, we receive your email address and basic profile (your name)
          solely to identify your account. Inside the app you create Pay Runs; those records — the
          intent your agent submits (agent id, purpose, merchant, amount) and any on-chain references it
          reports back (public transaction hashes and wallet addresses) — are stored in your own
          persistent workspace. API keys are stored only as a hash; the full key is shown once.
        </p>
      </section>

      <section>
        <h2>How we use it</h2>
        <p>
          We use this data only to sign you in and to keep your personal sandbox workspace and its Pay
          Runs available to you. We do not sell it, share it with third parties, or use it for
          advertising or profiling.
        </p>
      </section>

      <section>
        <h2>Where it is stored</h2>
        <p>
          Account and Pay Run data are stored in our managed Postgres database (Supabase). Sign-in is
          handled via Google OAuth; we never see or store your Google password.
        </p>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>
          We set first-party session cookies (via Supabase) so you stay signed in. We use no
          third-party, analytics, or advertising cookies.
        </p>
      </section>

      <section>
        <h2>Retention &amp; deletion</h2>
        <p>
          You can request deletion of your account and all associated sandbox data at any time by
          emailing us; we will remove it promptly.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions or deletion requests:{" "}
          <a href="mailto:zynono@gmail.com">zynono@gmail.com</a>.
        </p>
      </section>
    </>
  );
}
