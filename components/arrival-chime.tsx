"use client";

import { useEffect } from "react";

const SOUND_KEY = "arrival-desk:sound";
const SOUND_URL = "/sounds/arrival.wav";

export function soundEnabled() {
  return typeof window !== "undefined" && localStorage.getItem(SOUND_KEY) !== "off";
}

export function setSoundEnabled(on: boolean) {
  localStorage.setItem(SOUND_KEY, on ? "on" : "off");
}

let audio: HTMLAudioElement | null = null;

function getAudio() {
  if (!audio) {
    audio = new Audio(SOUND_URL);
    audio.preload = "auto";
  }
  return audio;
}

/** Plays the arrival chime. Resolves true if the browser let it play. */
export async function playChime() {
  try {
    const sound = getAudio();
    sound.currentTime = 0;
    sound.volume = 1;
    await sound.play();
    return true;
  } catch {
    // Browsers block sound until the person has clicked somewhere on the page.
    return false;
  }
}

/**
 * Invisible. Answers the service worker when a guest-arrived push comes in:
 * plays the chime and replies "played" so the notification stays silent,
 * or "skipped" so the device's own sound plays instead.
 */
export function ArrivalChime() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    function onMessage(event: MessageEvent) {
      if (event.data?.type !== "arrival-chime") return;
      const port = event.ports[0];
      if (!soundEnabled()) {
        port?.postMessage("skipped");
        return;
      }
      void playChime().then((played) => port?.postMessage(played ? "played" : "skipped"));
    }

    // Warm up the audio on the first click so later plays aren't blocked.
    function unlock() {
      const sound = getAudio();
      sound.muted = true;
      sound
        .play()
        .then(() => {
          sound.pause();
          sound.currentTime = 0;
        })
        .catch(() => {})
        .finally(() => {
          sound.muted = false;
        });
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    }

    navigator.serviceWorker.addEventListener("message", onMessage);
    navigator.serviceWorker.startMessages();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  return null;
}
