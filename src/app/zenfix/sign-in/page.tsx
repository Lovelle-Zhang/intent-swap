import { SignInForm } from "./SignInForm";

const messages: Record<string, string> = {
  sent: "Check your email for a secure ZenFix sign-in link.",
  invalid_email: "Enter a valid email address.",
  auth_unavailable: "Sign-in is temporarily unavailable. Please try again later.",
  expired_link: "That sign-in link is invalid or expired. Request a new one.",
  signed_out: "You have signed out.",
};

export default function SignInPage({ searchParams }: { searchParams: { status?: string } }) {
  const message = searchParams.status ? messages[searchParams.status] : undefined;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <div><p className="text-sm text-cyan-300">ZenFix Hosted Sandbox</p><h1 className="text-3xl font-semibold">Sign in</h1></div>
      <p className="text-stone-300">Use an email magic link to access your persistent Personal Workspace.</p>
      {message ? <p role="status" className="rounded border border-stone-700 p-3">{message}</p> : null}
      <SignInForm />
    </main>
  );
}
