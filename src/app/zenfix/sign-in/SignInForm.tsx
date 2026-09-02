"use client";

import { useState } from "react";

export function SignInForm() {
  const [pending, setPending] = useState(false);
  return (
    <form action="/zenfix/sign-in/request" method="post" onSubmit={() => setPending(true)}>
      <label htmlFor="email">Email address</label>
      <input id="email" name="email" type="email" autoComplete="email" required disabled={pending} />
      <button type="submit" disabled={pending}>{pending ? "Sending…" : "Email me a magic link"}</button>
    </form>
  );
}
