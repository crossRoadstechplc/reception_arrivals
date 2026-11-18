"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { login, loginWithCode, sendLoginCode } from "@/lib/actions/auth";
import { PasswordInput } from "@/components/password-input";
import { AuthHeading } from "@/components/auth-shell";
import { Alert } from "@/components/ui";

const RESEND_SECONDS = 30;

type Mode = "email" | "code" | "password";

export function LoginForm({ banner, defaultEmail = "" }: { banner?: string; defaultEmail?: string }) {
  const [mode, setMode] = useState<Mode>("email");
  const [email, setEmail] = useState(defaultEmail);
  const [wait, setWait] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  function send() {
    setError(null);
    startSending(async () => {
      const result = await sendLoginCode(email);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setWait(RESEND_SECONDS);
      setMode("code");
    });
  }

  if (mode === "code") {
    return (
      <CodeStep
        email={email}
        wait={wait}
        sending={sending}
        sendError={error}
        onResend={send}
        onChangeEmail={() => {
          setError(null);
          setMode("email");
        }}
      />
    );
  }

  if (mode === "password") {
    return (
      <PasswordStep
        email={email}
        onEmail={setEmail}
        banner={banner}
        onUseCode={() => {
          setError(null);
          setMode("email");
        }}
      />
    );
  }

  return (
    <form
      className="rise space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
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
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      {error || banner ? <Alert>{error || banner}</Alert> : null}
      <button type="submit" disabled={sending} className="btn btn-primary btn-lg w-full">
        {sending ? "Sending…" : "Email me a code"}
      </button>
      <button
        type="button"
        className="w-full text-center text-sm font-semibold text-muted hover:text-ink"
        onClick={() => {
          setError(null);
          setMode("password");
        }}
      >
        Use password instead
      </button>
    </form>
  );
}

function CodeStep({
  email,
  wait,
  sending,
  sendError,
  onResend,
  onChangeEmail,
}: {
  email: string;
  wait: number;
  sending: boolean;
  sendError: string | null;
  onResend: () => void;
  onChangeEmail: () => void;
}) {
  const [state, action, pending] = useActionState(loginWithCode, null);
  const [code, setCode] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const message = state?.error || sendError;

  return (
    <form ref={formRef} action={action} className="rise space-y-4">
      <AuthHeading title="Enter your code" />
      <p className="text-sm text-muted">
        We sent a 6-digit code to <span className="font-semibold break-all text-ink">{email.trim()}</span>
      </p>
      <input type="hidden" name="email" value={email} />
      <label className="block">
        <span className="label">Sign-in code</span>
        <input
          name="code"
          required
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          className="field h-14 text-center font-mono text-2xl tracking-[0.4em]"
          value={code}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(digits);
            // Sign in as soon as the last digit is in.
            if (digits.length === 6 && !pending) window.setTimeout(() => formRef.current?.requestSubmit(), 0);
          }}
        />
      </label>
      {message ? <Alert>{message}</Alert> : null}
      <button type="submit" disabled={pending} className="btn btn-primary btn-lg w-full">
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <div className="flex items-center justify-between text-sm font-semibold">
        <button type="button" className="text-muted hover:text-ink" onClick={onChangeEmail}>
          Use a different email
        </button>
        <button type="button" className="text-signal hover:underline disabled:text-muted disabled:no-underline" disabled={wait > 0 || sending} onClick={onResend}>
          {sending ? "Sending…" : wait > 0 ? `Resend in ${wait}s` : "Resend code"}
        </button>
      </div>
    </form>
  );
}

function PasswordStep({
  email,
  onEmail,
  banner,
  onUseCode,
}: {
  email: string;
  onEmail: (email: string) => void;
  banner?: string;
  onUseCode: () => void;
}) {
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
          autoComplete="username"
          placeholder="you@company.com"
          className="field h-12"
          value={email}
          onChange={(event) => onEmail(event.target.value)}
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
        <PasswordInput id="password" name="password" required autoFocus autoComplete="current-password" className="field h-12" />
      </div>
      {message ? <Alert>{message}</Alert> : null}
      <button type="submit" disabled={pending} className="btn btn-primary btn-lg w-full">
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <button type="button" className="w-full text-center text-sm font-semibold text-muted hover:text-ink" onClick={onUseCode}>
        Email me a code instead
      </button>
    </form>
  );
}
