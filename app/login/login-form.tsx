"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login } from "@/lib/actions/auth";
import { PasswordInput } from "@/components/password-input";
import { AuthHeading } from "@/components/auth-shell";
import { Alert } from "@/components/ui";

export function LoginForm({ banner }: { banner?: string }) {
  const [state, action, pending] = useActionState(login, null);
  const message = state?.error || banner;

  return (
    <form action={action} className="rise space-y-4">
      <AuthHeading title="Welcome back" />
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
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="password" className="label mb-0">
            Password
          </label>
          <Link href="/forgot-password" className="text-xs font-semibold text-signal hover:underline">
            Forgot password?
          </Link>
        </div>
        <PasswordInput id="password" name="password" required autoComplete="current-password" className="field h-12" />
      </div>
      {message ? <Alert>{message}</Alert> : null}
      <button type="submit" disabled={pending} className="btn btn-primary btn-lg w-full">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
