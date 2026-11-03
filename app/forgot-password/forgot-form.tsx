"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/actions/auth";
import { AuthHeading } from "@/components/auth-shell";
import { Alert } from "@/components/ui";
import { CheckIcon, ChevronLeft } from "@/components/icons";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, null);

  if (state?.sent) {
    return (
      <div className="rise">
        <span className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-cleared-soft text-cleared">
          <CheckIcon className="size-6" />
        </span>
        <AuthHeading
          title="Check your email" />
        <Link href="/login" className="btn btn-secondary btn-lg w-full">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="rise space-y-4">
      <Link href="/login" className="-ml-1 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <ChevronLeft className="size-4" />
        Sign in
      </Link>
      <AuthHeading
        title="Reset your password" />
      <label className="block">
        <span className="label">Work email</span>
        <input
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="username"
          placeholder="you@company.com"
          className="field h-12"
        />
      </label>
      {state?.error ? <Alert>{state.error}</Alert> : null}
      <button type="submit" disabled={pending} className="btn btn-primary btn-lg w-full">
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
