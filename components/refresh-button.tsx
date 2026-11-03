"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshIcon } from "@/components/icons";

/** Reloads the page's data from the server without a full page reload. */
export function RefreshButton() {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon"
      aria-label="Refresh now"
      title="Refresh now"
      disabled={refreshing}
      onClick={() => startRefresh(() => router.refresh())}
    >
      <RefreshIcon className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
    </button>
  );
}
