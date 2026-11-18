"use client";

import { useEffect } from "react";

const KEY = "arrival-desk:session-renewed";
const EVERY_MS = 12 * 60 * 60 * 1000;

/** Renews the sign-in while the site is in use, so active people are never signed out. */
export function SessionKeepAlive() {
  useEffect(() => {
    function renew() {
      if (document.visibilityState !== "visible") return;
      const age = Date.now() - Number(localStorage.getItem(KEY) ?? 0);
      if (age >= 0 && age < EVERY_MS) return;
      // Reading the session makes the server send a cookie with a fresh expiry date.
      fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
        .then((response) => {
          if (response.ok) localStorage.setItem(KEY, String(Date.now()));
        })
        .catch(() => {});
    }
    renew();
    document.addEventListener("visibilitychange", renew);
    return () => document.removeEventListener("visibilitychange", renew);
  }, []);

  return null;
}
