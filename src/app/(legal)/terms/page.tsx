import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service — ZenFix PayRun" };

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="updated">Last updated September 18, 2026</p>
      <p className="intro">
        ZenFix PayRun (&ldquo;ZenFix&rdquo;) is an agent payment control layer, currently in test mode on
        Base Sepolia and provided for evaluation. By signing in and using it, you agree to these terms.
      </p>

      <section>
        <h2>No custody, no money movement</h2>
        <p>
          ZenFix is not a bank, custodian, exchange, money transmitter, broker, or financial-services
          provider. It never holds, custodies, moves, or transmits your funds, private keys, or any
          other asset — your agents execute any payment themselves on their own rails, and ZenFix only
          authorizes, records, and verifies them. The hosted service runs in test mode on Base Sepolia;
          amounts shown in test mode are testnet USDC, which has no monetary value and cannot be
          exchanged for real money. Nothing in ZenFix is financial, investment, tax, or legal advice.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>
          Use the sandbox for lawful evaluation only. Do not attempt to disrupt the service, access
          other users&rsquo; workspaces, or upload unlawful content.
        </p>
      </section>

      <section>
        <h2>Provided &ldquo;as is&rdquo;</h2>
        <p>
          The service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis without
          warranties of any kind. It may change or be discontinued at any time, and sandbox data may be
          reset. To the extent permitted by law, we are not liable for any damages arising from use of
          the sandbox.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>Questions: <a href="mailto:zynono@gmail.com">zynono@gmail.com</a>.</p>
      </section>
    </>
  );
}
