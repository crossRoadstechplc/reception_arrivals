"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export type LiveState = "connecting" | "live" | "offline";

const BACKUP_CHECK_MS = 30_000;
const BACK_TO_TODAY_MS = 10 * 60_000;

/**
 * Refreshes server data when any guest changes, through the Supabase broadcast
 * channel when it is configured, with a check every 30 seconds as the backup.
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

  // Always runs as a backup, in case a live update is ever missed.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, BACKUP_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [router]);

  // Coming back to the tab shows the latest guests (and a new day) right away.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [router]);

  return live;
}

/** Someone left looking at another date is brought back to today after a while. */
export function useBackToToday(date: string, today: string, goToday: () => void) {
  const go = useRef(goToday);
  useEffect(() => {
    go.current = goToday;
  });
  useEffect(() => {
    if (date === today) return;
    const timer = window.setTimeout(() => go.current(), BACK_TO_TODAY_MS);
    return () => window.clearTimeout(timer);
  }, [date, today]);
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
