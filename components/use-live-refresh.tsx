"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export type LiveState = "connecting" | "live" | "offline";

const FALLBACK_POLL_MS = 30_000;

/**
 * Refreshes server data when any guest changes. Uses the Supabase broadcast
 * channel when it is configured, and falls back to polling every 30 seconds.
 */
export function useLiveRefresh() {
  const router = useRouter();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const [live, setLive] = useState<LiveState>(supabaseUrl && supabaseKey ? "connecting" : "offline");

  useEffect(() => {
    if (!supabaseUrl || !supabaseKey) return;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const channel = supabase
      .channel("reception-board")
      .on("broadcast", { event: "guests-changed" }, () => router.refresh())
      .subscribe((next) => {
        if (next === "SUBSCRIBED") setLive("live");
        if (next === "CHANNEL_ERROR" || next === "TIMED_OUT" || next === "CLOSED") setLive("offline");
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, supabaseKey, supabaseUrl]);

  useEffect(() => {
    if (live === "live") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, FALLBACK_POLL_MS);
    return () => window.clearInterval(timer);
  }, [live, router]);

  return live;
}

export function LiveIndicator({ live }: { live: LiveState }) {
  const label = live === "live" ? "Live" : live === "connecting" ? "Connecting" : "Auto-refresh 30s";
  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ${
        live === "live" ? "bg-cleared-soft text-cleared" : "bg-idle-soft text-muted"
      }`}
      title={live === "live" ? "Updates appear instantly" : "Live updates unavailable; refreshing every 30 seconds"}
    >
      <span className="relative flex size-2">
        {live === "live" ? (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-cleared opacity-60" />
        ) : null}
        <span className={`relative inline-flex size-2 rounded-full ${live === "live" ? "bg-cleared" : "bg-idle"}`} />
      </span>
      {label}
    </span>
  );
}
