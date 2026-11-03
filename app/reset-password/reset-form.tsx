"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPassword } from "@/lib/actions/auth";
import { PasswordInput } from "@/components/password-input";
import { AuthHeading } from "@/components/auth-shell";
import { Alert } from "@/components/ui";
import { AlertIcon, CheckIcon } from "@/components/icons";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, null);

  if (!token) {
    return (
      <div className="rise">
        <span className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-danger-soft text-danger">
          <AlertIcon className="size-6" />
        </span>
        <AuthHeading title="This link is incomplete" />
        <Link href="/forgot-password" className="btn btn-primary btn-lg w-full">
          Request a new link
        </Link>
      </div>
    );
  }

  if (state?.done) {
    return (
      <div className="rise">
        <span className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-cleared-soft text-cleared">
          <CheckIcon className="size-6" />
        </span>
        <AuthHeading title="Password saved" />
        <Link href="/login" className="btn btn-primary btn-lg w-full">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="rise space-y-4">
      <AuthHeading title="Choose a new password" />
      <input type="hidden" name="token" value={token} />
      <label className="block">
        <span className="label">New password</span>
        <PasswordInput name="password" required minLength={8} autoFocus autoComplete="new-password" className="field h-12" />
      </label>
      <label className="block">
        <span className="label">Confirm password</span>
        <PasswordInput name="confirm" required minLength={8} autoComplete="new-password" className="field h-12" />
      </label>
      {state?.error ? <Alert>{state.error}</Alert> : null}
      <button type="submit" disabled={pending} className="btn btn-primary btn-lg w-full">
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
