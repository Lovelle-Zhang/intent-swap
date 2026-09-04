import { Bricolage_Grotesque, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { SignInForm } from "./SignInForm";
import "./signin.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-display" });
const body = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

const messages: Record<string, string> = {
  sent: "Check your email for a secure ZenFix sign-in link.",
  invalid_email: "Enter a valid email address.",
  auth_unavailable: "Sign-in is temporarily unavailable. Please try again later.",
  expired_link: "That sign-in link is invalid or expired. Request a new one.",
  signed_out: "You have signed out.",
};

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

export default function SignInPage({ searchParams }: { searchParams: { status?: string } }) {
  const message = searchParams.status ? messages[searchParams.status] : undefined;
  return (
    <div className={`zf-auth ${display.variable} ${body.variable} ${mono.variable}`}>
      <div className="card">
        <div className="brand"><Logo /> ZenFix <b>PayRun</b></div>
        <p className="eyebrow">Sandbox · No real funds</p>
        <h1>Sign in</h1>
        <p className="lead">Sign in with Google to reach your persistent sandbox workspace and its Pay Runs.</p>
        {message ? <p className="notice" role="status">{message}</p> : null}
        <SignInForm />
        <div className="foot">
          <a href="/">← Home</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </div>
      </div>
    </div>
  );
}
