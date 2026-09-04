import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy — ZenFix PayRun" };

export default function PrivacyPage() {
  return (
    <>
      <div>
        <h1 className="text-3xl font-bold text-stone-50">Privacy Policy</h1>
        <p className="mt-1 text-sm text-stone-500">Last updated September 4, 2026</p>
      </div>

      <p>
        ZenFix PayRun (&ldquo;ZenFix&rdquo;) is a <strong>sandbox demonstration</strong> of an agent
        payment control layer. It moves no real money — every amount shown is simulated.
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-stone-100">What we collect</h2>
        <p>
          When you sign in with Google, we receive your email address and basic profile (your name)
          solely to identify your account. Inside the app you can create sandbox Pay Runs; the records
          you create are stored in your own persistent workspace.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-stone-100">How we use it</h2>
        <p>
          We use this data only to sign you in and to keep your personal sandbox workspace and its Pay
          Runs available to you. We do not sell it, share it with third parties, or use it for
          advertising or profiling.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-stone-100">Where it is stored</h2>
        <p>
          Account and Pay Run data are stored in our managed Postgres database (Supabase). Sign-in is
          handled via Google OAuth; we never see or store your Google password.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-stone-100">Retention &amp; deletion</h2>
        <p>
          You can request deletion of your account and all associated sandbox data at any time by
          emailing us; we will remove it promptly.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-stone-100">Contact</h2>
        <p>
          Questions or deletion requests:{" "}
          <a className="text-cyan-300 hover:underline" href="mailto:zynono@gmail.com">zynono@gmail.com</a>.
        </p>
      </section>
    </>
  );
}
