"use client";

import { useState, useSyncExternalStore } from "react";
import { Modal } from "@/components/ui";
import { DownloadIcon, PhoneIcon, ShareIcon } from "@/components/icons";

/** Always redirects to the newest Android APK on GitHub. */
const ANDROID_DOWNLOAD = "/api/mobile/app-download";

type Device = "android" | "ios" | "desktop" | "installed" | "unknown";

function detectDevice(): Device {
  const ua = navigator.userAgent;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  // Already opened from the Home Screen shortcut: nothing to offer.
  if (standalone) return "installed";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  return "desktop";
}

const noopSubscribe = () => () => {};

/** The visitor's device, read in the browser (the server renders "unknown"). */
function useDevice(): Device {
  return useSyncExternalStore(noopSubscribe, detectDevice, () => "unknown");
}

/**
 * "Get the app": on Android it downloads the app straight away; on iPhone it
 * explains how to add Arrival Desk to the Home Screen; on a computer it shows both.
 */
export function GetAppButton({
  variant = "header",
  offerAndroidApp = true,
}: {
  variant?: "header" | "link";
  /** The Android app is for floor staff; reception accounts aren't offered it. */
  offerAndroidApp?: boolean;
}) {
  const device = useDevice();
  const [open, setOpen] = useState(false);

  if (device === "unknown" || device === "installed") return null;
  if (device === "android" && !offerAndroidApp) return null;

  const label = device === "android" ? "Get the app" : device === "ios" ? "Add to Home Screen" : "Get the app";
  const className =
    variant === "header"
      ? "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-console-muted transition-colors hover:bg-white/8 hover:text-white"
      : "inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink";
  const content = (
    <>
      {device === "android" ? <DownloadIcon className="size-4" /> : <PhoneIcon className="size-4" />}
      <span className={variant === "header" ? "hidden lg:inline" : ""}>{label}</span>
    </>
  );

  return (
    <>
      {device === "android" ? (
        <a href={ANDROID_DOWNLOAD} className={className} title="Download the Arrival Desk app for Android">
          {content}
        </a>
      ) : (
        <button type="button" className={className} title={label} onClick={() => setOpen(true)}>
          {content}
        </button>
      )}
      {open ? <GetAppDialog device={device} offerAndroidApp={offerAndroidApp} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function GetAppDialog({
  device,
  offerAndroidApp,
  onClose,
}: {
  device: Device;
  offerAndroidApp: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const link = typeof window === "undefined" ? ANDROID_DOWNLOAD : `${window.location.origin}${ANDROID_DOWNLOAD}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Modal
      title={device === "ios" ? "Add Arrival Desk to your Home Screen" : "Get Arrival Desk on your phone"}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-dark ml-auto" onClick={onClose}>
          Done
        </button>
      }
    >
      <div className="grid gap-5">
        {device === "desktop" && offerAndroidApp ? (
          <section className="grid gap-2">
            <h3 className="font-semibold">Android</h3>
            <p className="text-sm text-muted">
              Open this link on the Android phone to download the app. It updates itself when there&apos;s a new
              version.
            </p>
            <div className="flex flex-wrap gap-2">
              <a href={ANDROID_DOWNLOAD} className="btn btn-primary">
                <DownloadIcon className="size-4" />
                Download for Android
              </a>
              <button type="button" className="btn btn-secondary" onClick={copy}>
                {copied ? "Link copied" : "Copy link"}
              </button>
            </div>
            <p className="hint">
              Android may ask you to allow installing apps from your browser. That&apos;s expected: the app comes
              from Arrival Desk, not the Play Store.
            </p>
          </section>
        ) : null}

        <section className="grid gap-2">
          {device === "desktop" && offerAndroidApp ? <h3 className="font-semibold">iPhone and iPad</h3> : null}
          <ol className="grid gap-2.5 text-sm">
            <Step n={1}>
              Open this site in <b>Safari</b>.
            </Step>
            <Step n={2}>
              Tap the <b>Share</b> button
              <ShareIcon className="mx-1 inline size-4 align-[-3px]" />
              at the bottom of the screen.
            </Step>
            <Step n={3}>
              Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.
            </Step>
            <Step n={4}>
              Open Arrival Desk from the new icon. To get alerts when your guests arrive, turn on alerts there.
            </Step>
          </ol>
        </section>
      </div>
    </Modal>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-xs text-white">
        {n}
      </span>
      <span className="pt-0.5 leading-relaxed">{children}</span>
    </li>
  );
}
