// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { SignInForm } from "@/app/zenfix/sign-in/SignInForm";

describe("ZenFix magic-link sign-in form", () => {
  test("labels the email field and prevents duplicate submission while pending", () => {
    const { container } = render(<SignInForm />);
    expect(screen.getByLabelText("Email address")).toHaveAttribute("type", "email");
    fireEvent.submit(container.querySelector("form")!);
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    // The email input must NOT be disabled on submit: a disabled field is
    // omitted from the native form POST, which would send an empty email.
    expect(screen.getByLabelText("Email address")).not.toBeDisabled();
  });
});
