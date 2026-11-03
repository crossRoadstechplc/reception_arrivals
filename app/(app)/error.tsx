"use client";

import Link from "next/link";
import { AlertIcon } from "@/components/icons";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-6">
      <div className="card w-full max-w-md p-8 text-center">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-danger-soft text-danger">
          <AlertIcon className="size-6" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">This page couldn&apos;t load</h1>
        <p className="mt-2 text-sm text-muted">
          Usually this is a lost connection to the database. Try again in a moment. If it keeps happening, tell your
          admin.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/" className="btn btn-secondary">
            Go home
          </Link>
          <button type="button" onClick={reset} className="btn btn-primary">
            Try again
          </button>
        </div>
      </div>
    </main>
  );
}
