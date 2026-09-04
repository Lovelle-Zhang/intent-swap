import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service — ZenFix PayRun" };

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="updated">Last updated September 4, 2026</p>
      <p className="intro">
        ZenFix PayRun (&ldquo;ZenFix&rdquo;) is a <strong>sandbox demonstration</strong> provided for
        evaluation. By signing in and using it, you agree to these terms.
      </p>

      <section>
        <h2>No real funds</h2>
        <p>
          ZenFix does not process real payments. All balances, amounts, and &ldquo;USDC&rdquo; figures
          are simulated for demonstration only. Nothing here is a financial service, and no money moves.
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
