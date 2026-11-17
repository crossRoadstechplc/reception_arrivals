"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Period = "AM" | "PM";
type Time = { hour: number; minute: number; period: Period };

function parse(value: string | null | undefined): Time | null {
  const match = value?.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h24 = Number(match[1]) % 24;
  return { hour: h24 % 12 === 0 ? 12 : h24 % 12, minute: Number(match[2]) % 60, period: h24 >= 12 ? "PM" : "AM" };
}

function to24(time: Time) {
  const h24 = (time.hour % 12) + (time.period === "PM" ? 12 : 0);
  return `${String(h24).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const label = (time: Time) => `${time.hour}:${pad(time.minute)} ${time.period}`;

/**
 * Clock-dial time picker (like a phone's alarm clock). Same on every device,
 * unlike the browser's time input, which follows the device's 12/24-hour setting.
 * Submits "HH:MM" in 24-hour time, or "" for no time.
 *
 * Uncontrolled with `defaultValue`, or controlled with `value` + `onChange`.
 */
export function TimeField({
  name,
  defaultValue,
  value: controlled,
  onChange,
  size = "md",
}: {
  name?: string;
  defaultValue?: string | null;
  value?: string | null;
  onChange?: (value: string) => void;
  size?: "md" | "lg";
}) {
  const [own, setOwn] = useState<Time | null>(() => parse(defaultValue));
  const [open, setOpen] = useState(false);
  const value = controlled !== undefined ? parse(controlled) : own;

  function set(next: Time | null) {
    if (controlled === undefined) setOwn(next);
    onChange?.(next ? to24(next) : "");
  }

  return (
    <div className="flex items-center gap-1.5">
      {name ? <input type="hidden" name={name} value={value ? to24(value) : ""} /> : null}
      <button
        type="button"
        className={`field flex flex-1 items-center justify-between text-left ${size === "lg" ? "h-14 text-xl" : ""}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <span className={value ? "font-mono font-medium" : "text-muted"}>{value ? label(value) : "Any time"}</span>
        <ClockIcon />
      </button>
      {value ? (
        <button type="button" className="btn btn-ghost btn-sm px-2" aria-label="Clear time" title="Clear time" onClick={() => set(null)}>
          ✕
        </button>
      ) : null}
      {open ? (
        <ClockDialog
          initial={value ?? { hour: 9, minute: 0, period: "AM" }}
          onCancel={() => setOpen(false)}
          onSave={(next) => {
            set(next);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

const SIZE = 256;
const CENTER = SIZE / 2;
const RADIUS = 100;

function point(angleDeg: number, radius = RADIUS) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CENTER + radius * Math.sin(rad), y: CENTER - radius * Math.cos(rad) };
}

function ClockDialog({
  initial,
  onCancel,
  onSave,
}: {
  initial: Time;
  onCancel: () => void;
  onSave: (time: Time) => void;
}) {
  const [time, setTime] = useState<Time>(initial);
  const [mode, setMode] = useState<"hour" | "minute">("hour");
  const [typing, setTyping] = useState(false);
  const [hourText, setHourText] = useState(String(initial.hour));
  const [minuteText, setMinuteText] = useState(pad(initial.minute));
  const dialRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const cancelRef = useRef(onCancel);
  useEffect(() => {
    cancelRef.current = onCancel;
  });

  // Escape closes only this picker, not the form underneath.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      cancelRef.current();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  function pick(clientX: number, clientY: number) {
    const box = dialRef.current?.getBoundingClientRect();
    if (!box) return;
    const dx = clientX - (box.left + box.width / 2);
    const dy = clientY - (box.top + box.height / 2);
    const angle = (Math.atan2(dx, -dy) * 180) / Math.PI + 360;
    if (mode === "hour") {
      const hour = Math.round(angle / 30) % 12 || 12;
      setTime((t) => ({ ...t, hour }));
      setHourText(String(hour));
    } else {
      const minute = (Math.round(angle / 30) * 5) % 60; // 5-minute steps; type for exact minutes
      setTime((t) => ({ ...t, minute }));
      setMinuteText(pad(minute));
    }
  }

  function commitTyped(): Time | null {
    const hour = Number(hourText);
    const minute = Number(minuteText);
    if (!Number.isInteger(hour) || hour < 1 || hour > 12) return null;
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
    return { ...time, hour, minute };
  }

  const typedValid = !typing || commitTyped() !== null;
  const selectedAngle = mode === "hour" ? (time.hour % 12) * 30 : time.minute * 6;
  const knob = point(selectedAngle);
  const marks =
    mode === "hour"
      ? Array.from({ length: 12 }, (_, i) => ({ value: i === 0 ? 12 : i, text: String(i === 0 ? 12 : i), angle: i * 30 }))
      : Array.from({ length: 12 }, (_, i) => ({ value: i * 5, text: pad(i * 5), angle: i * 30 }));
  const current = mode === "hour" ? time.hour : time.minute;

  const box = (active: boolean) =>
    `flex h-[4.5rem] w-24 items-center justify-center rounded-xl font-mono text-5xl font-medium transition-colors ${
      active ? "bg-signal-soft text-signal-deep" : "bg-panel-2 text-ink hover:bg-idle-soft"
    }`;

  return createPortal(
    <div
      className="fade fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label="Select time" className="card w-full max-w-[20.5rem] p-5 shadow-xl">
        <p className="mb-4 text-sm font-semibold text-muted">{typing ? "Enter time" : "Select time"}</p>

        <div className="flex items-center gap-2">
          {typing ? (
            <>
              <input
                aria-label="Hour"
                inputMode="numeric"
                maxLength={2}
                className={`${box(true)} text-center outline-none`}
                value={hourText}
                autoFocus
                onChange={(e) => setHourText(e.target.value.replace(/\D/g, ""))}
              />
              <span className="text-4xl font-semibold">:</span>
              <input
                aria-label="Minute"
                inputMode="numeric"
                maxLength={2}
                className={`${box(false)} text-center outline-none focus:bg-signal-soft focus:text-signal-deep`}
                value={minuteText}
                onChange={(e) => setMinuteText(e.target.value.replace(/\D/g, ""))}
                onBlur={() => minuteText.length === 1 && setMinuteText(pad(Number(minuteText)))}
              />
            </>
          ) : (
            <>
              <button type="button" className={box(mode === "hour")} onClick={() => setMode("hour")} aria-label="Hour">
                {pad(time.hour)}
              </button>
              <span className="text-4xl font-semibold">:</span>
              <button type="button" className={box(mode === "minute")} onClick={() => setMode("minute")} aria-label="Minute">
                {pad(time.minute)}
              </button>
            </>
          )}
          <div className="ml-auto flex flex-col gap-1.5" role="radiogroup" aria-label="AM or PM">
            {(["AM", "PM"] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={time.period === p}
                onClick={() => setTime((t) => ({ ...t, period: p }))}
                className={`h-8 w-14 rounded-lg border text-sm font-semibold transition-colors ${
                  time.period === p ? "border-cleared bg-cleared-soft text-cleared" : "border-line-strong text-muted hover:text-ink"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {!typing ? (
          <div
            ref={dialRef}
            className="relative mx-auto mt-6 touch-none rounded-full bg-panel-2 select-none"
            style={{ width: SIZE, height: SIZE }}
            onPointerDown={(event) => {
              dragging.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              pick(event.clientX, event.clientY);
            }}
            onPointerMove={(event) => {
              if (dragging.current) pick(event.clientX, event.clientY);
            }}
            onPointerUp={() => {
              dragging.current = false;
              // Like a phone clock: after the hour, move on to minutes.
              if (mode === "hour") setMode("minute");
            }}
          >
            <svg className="pointer-events-none absolute inset-0" width={SIZE} height={SIZE} aria-hidden="true">
              <line x1={CENTER} y1={CENTER} x2={knob.x} y2={knob.y} stroke="var(--signal)" strokeWidth="2" />
              <circle cx={CENTER} cy={CENTER} r="4" fill="var(--signal)" />
              <circle cx={knob.x} cy={knob.y} r="20" fill="var(--signal)" />
            </svg>
            {marks.map((mark) => {
              const p = point(mark.angle);
              const active = mark.value === current;
              return (
                <span
                  key={mark.text}
                  className={`pointer-events-none absolute flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[15px] font-medium ${
                    active ? "text-white" : "text-ink"
                  }`}
                  style={{ left: p.x, top: p.y }}
                >
                  {mark.text}
                </span>
              );
            })}
          </div>
        ) : null}

        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm mr-auto px-2"
            aria-label={typing ? "Use the clock" : "Type the time"}
            title={typing ? "Use the clock" : "Type the time"}
            onClick={() => {
              if (typing) {
                const typed = commitTyped();
                if (typed) setTime(typed);
              } else {
                setHourText(String(time.hour));
                setMinuteText(pad(time.minute));
              }
              setTyping((v) => !v);
            }}
          >
            {typing ? <ClockIcon /> : <KeyboardIcon />}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-dark"
            disabled={!typedValid}
            onClick={() => {
              const result = typing ? commitTyped() : time;
              if (result) onSave(result);
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 text-muted" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6" />
    </svg>
  );
}
