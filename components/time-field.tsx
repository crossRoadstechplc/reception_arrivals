"use client";

import { useState } from "react";

const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

function parse(value: string | null | undefined) {
  const match = value?.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { hour: "", minute: "00", period: "AM" as const };
  const h24 = Number(match[1]) % 24;
  return {
    hour: String(h24 % 12 === 0 ? 12 : h24 % 12),
    minute: match[2],
    period: (h24 >= 12 ? "PM" : "AM") as "AM" | "PM",
  };
}

/**
 * 12-hour time picker that looks and behaves the same on every device.
 * (The browser's own time input follows the device's 12/24-hour setting,
 * so "2:00" typed on a 24-hour phone was saved as 2 AM.)
 * Submits "HH:MM" in 24-hour time, or "" for no time.
 */
export function TimeField({ name, defaultValue }: { name: string; defaultValue?: string | null }) {
  const initial = parse(defaultValue);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);
  const [period, setPeriod] = useState<"AM" | "PM">(initial.period);

  const minuteOptions = MINUTES.includes(minute) ? MINUTES : [...MINUTES, minute].sort();
  let value = "";
  if (hour) {
    const h12 = Number(hour) % 12;
    const h24 = period === "PM" ? h12 + 12 : h12;
    value = `${String(h24).padStart(2, "0")}:${minute}`;
  }

  return (
    <div className="flex items-center gap-1.5">
      <input type="hidden" name={name} value={value} />
      <select aria-label="Hour" className="field w-[4.5rem] px-2" value={hour} onChange={(e) => setHour(e.target.value)}>
        <option value="">--</option>
        {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="font-semibold text-muted">:</span>
      <select
        aria-label="Minute"
        className="field w-[4.5rem] px-2"
        value={minute}
        disabled={!hour}
        onChange={(e) => setMinute(e.target.value)}
      >
        {minuteOptions.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <div className="flex rounded-xl border border-line-strong p-0.5" role="radiogroup" aria-label="AM or PM">
        {(["AM", "PM"] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={period === p}
            disabled={!hour}
            onClick={() => setPeriod(p)}
            className={`h-9 rounded-[10px] px-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
              period === p ? "bg-ink text-white" : "text-muted hover:text-ink"
            }`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
