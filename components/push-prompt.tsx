"use client";

import { useEffect, useState, useTransition } from "react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/lib/actions/push";
import { playChime, setSoundEnabled, soundEnabled } from "@/components/arrival-chime";

type State = "loading" | "hidden" | "ios-install" | "unsupported" | "blocked" | "off" | "on";

const DISMISS_KEY = "arrival-desk:push-dismissed";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

/**
 * Lets a host turn on "your guest has arrived" browser notifications.
 * Shows a banner until they decide, then a small status pill.
 */
export function PushPrompt() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [sound, setSound] = useState(true);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!publicKey) return setState("hidden");
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
      setSound(soundEnabled());
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) return setState(isIos() && !isStandalone() ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        // Pick up a newer sw.js right away instead of waiting for the browser.
        void registration.update().catch(() => {});
        const existing = await registration.pushManager.getSubscription();
        if (cancelled) return;
        if (existing && Notification.permission === "granted") {
          // Re-save so the subscription follows whoever is signed in on this browser.
          await savePushSubscription(existing.toJSON(), navigator.userAgent);
          setState("on");
        } else {
          setState("off");
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) setState("unsupported");
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  function turnOn() {
    setMessage(null);
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "blocked" : "off");
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const subscription =
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey!),
          }));
        const result = await savePushSubscription(subscription.toJSON(), navigator.userAgent);
        if (!result.ok) {
          setMessage(result.error);
          return;
        }
        setState("on");
        setMessage("Alerts are on for this browser.");
      } catch (error) {
        console.error(error);
        setMessage("Could not turn on alerts in this browser.");
      }
    });
  }

  function turnOff() {
    setMessage(null);
    startTransition(async () => {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("off");
    });
  }

  function test() {
    setMessage(null);
    startTransition(async () => {
      const result = await sendTestPush();
      setMessage(result.ok ? (result.notice ?? "Sent.") : result.error);
    });
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  if (state === "loading" || state === "hidden") return null;

  if (state === "on") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-cleared-soft px-2.5 text-xs font-semibold text-cleared">
          <BellIcon className="size-3.5" />
          Arrival alerts on
        </span>
        <button type="button" className="text-xs font-semibold text-muted hover:text-ink" disabled={pending} onClick={test}>
          Send test
        </button>
        <span className="text-line-strong">·</span>
        <button
          type="button"
          className="text-xs font-semibold text-muted hover:text-ink"
          aria-pressed={sound}
          title={sound ? "Chime plays while Arrival Desk is open" : "Device's normal notification sound only"}
          onClick={() => {
            const next = !sound;
            setSoundEnabled(next);
            setSound(next);
            if (next) void playChime();
          }}
        >
          {sound ? "Chime: on" : "Chime: off"}
        </button>
        <span className="text-line-strong">·</span>
        <button type="button" className="text-xs font-semibold text-muted hover:text-ink" disabled={pending} onClick={turnOff}>
          Turn off
        </button>
        {message ? <span className="text-xs text-muted">{message}</span> : null}
      </div>
    );
  }

  if (dismissed) {
    if (state !== "off") return null;
    return (
      <button type="button" className="inline-flex items-center gap-1.5 self-start text-xs font-semibold text-muted hover:text-ink" onClick={turnOn}>
        <BellIcon className="size-3.5" />
        Turn on arrival alerts
      </button>
    );
  }

  const copy: Record<Exclude<State, "loading" | "hidden" | "on">, { title: string; body: string }> = {
    off: {
      title: "Get an alert when your guests arrive",
      body: "Reception checks them in and this device pings you right away. You'll also get an email as a record.",
    },
    "ios-install": {
      title: "Want arrival alerts on this iPhone?",
      body: "Tap the Share button, then “Add to Home Screen”. Open Arrival Desk from the new icon and turn alerts on there. Until then you'll get emails.",
    },
    unsupported: {
      title: "This browser can't show alerts",
      body: "You'll still get an email when your guests arrive. Chrome, Edge, Firefox and Safari support alerts.",
    },
    blocked: {
      title: "Alerts are blocked for this site",
      body: "Allow notifications in the browser's site settings to get alerts. Until then you'll get emails.",
    },
  };
  const { title, body } = copy[state];

  return (
    <div className="card fade flex flex-col gap-3 border-arrived/25 bg-arrived-soft/60 p-4 sm:flex-row sm:items-center">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-arrived text-white">
        <BellIcon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted">{body}</p>
        {message ? <p className="mt-1 text-sm font-medium text-danger">{message}</p> : null}
      </div>
      <div className="flex shrink-0 gap-2">
        <button type="button" className="btn btn-ghost" onClick={dismiss}>
          {state === "off" ? "Not now" : "Got it"}
        </button>
        {state === "off" ? (
          <button type="button" className="btn btn-dark" disabled={pending} onClick={turnOn}>
            {pending ? "Turning on…" : "Turn on alerts"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
