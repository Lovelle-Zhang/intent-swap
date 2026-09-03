// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { SignInForm } from "@/app/zenfix/sign-in/SignInForm";

describe("ZenFix sign-in", () => {
  test("offers Google as the only sign-in option", () => {
    render(<SignInForm />);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    // The email magic-link option was removed: Supabase built-in email is
    // rate-limited (2/hour) and the two unstyled buttons were easy to confuse.
    expect(screen.queryByLabelText("Email address")).toBeNull();
    expect(screen.queryByRole("button", { name: /magic link/i })).toBeNull();
  });
});
