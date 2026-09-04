import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service — ZenFix PayRun" };

export default function TermsPage() {
  return (
    <>
      <div>
        <h1 className="text-3xl font-bold text-stone-50">Terms of Service</h1>
        <p className="mt-1 text-sm text-stone-500">Last updated September 4, 2026</p>
      </div>

      <p>
        ZenFix PayRun (&ldquo;ZenFix&rdquo;) is a <strong>sandbox demonstration</strong> provided for
        evaluation. By signing in and using it, you agree to these terms.
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-stone-100">No real funds</h2>
        <p>
          ZenFix does not process real payments. All balances, amounts, and &ldquo;USDC&rdquo; figures are
          simulated for demonstration only. Nothing here is a financial service, and no money moves.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-stone-100">Acceptable use</h2>
        <p>
          Use the sandbox for lawful evaluation only. Do not attempt to disrupt the service, access
          other users&rsquo; workspaces, or upload unlawful content.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-stone-100">Provided &ldquo;as is&rdquo;</h2>
        <p>
          The service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis without
          warranties of any kind. It may change or be discontinued at any time, and sandbox data may be
          reset. To the extent permitted by law, we are not liable for any damages arising from use of
          the sandbox.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-stone-100">Contact</h2>
        <p>
          Questions:{" "}
          <a className="text-cyan-300 hover:underline" href="mailto:zynono@gmail.com">zynono@gmail.com</a>.
        </p>
      </section>
    </>
  );
}
