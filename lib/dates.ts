const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FALLBACK_TIME_ZONE = "Africa/Nairobi";

export function officeTimeZone() {
  const configured = process.env.OFFICE_TIMEZONE || FALLBACK_TIME_ZONE;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: configured }).format(new Date());
    return configured;
  } catch {
    console.error(
      `OFFICE_TIMEZONE "${configured}" is not a valid time zone. Using ${FALLBACK_TIME_ZONE}.`,
    );
    return FALLBACK_TIME_ZONE;
  }
}

export function officeTodayISO(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: officeTimeZone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function isISODate(value: string) {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function toDateOnly(iso: string) {
  if (!isISODate(iso)) {
    throw new Error("Invalid date");
  }
  return new Date(`${iso}T00:00:00.000Z`);
}

export function fromDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function shiftISO(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function formatOfficeDate(iso: string) {
  const date = new Date(`${iso}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: officeTimeZone(),
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

/**
 * Hour (0-23) and minute of a moment in the office time zone.
 * Only the numbers come from Intl; we build the text ourselves, because
 * browsers disagree on AM/PM spacing (some use an invisible U+202F space),
 * which breaks on some devices and makes server and browser text differ.
 */
export function officeHourMinute(value: Date | string, timeZone = officeTimeZone()) {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  // Some engines report midnight as 24; normalise to 0.
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { hour, minute };
}

/** 12-hour text with a plain space, e.g. 14, 5 -> "2:05 PM". */
export function twelveHour(hour: number, minute: number) {
  const period = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${String(minute).padStart(2, "0")} ${period}`;
}

/** A moment shown as office time (EAT by default), e.g. "2:30 PM". Call on the server. */
export function formatClock(value: Date | string, timeZone = officeTimeZone()) {
  const { hour, minute } = officeHourMinute(value, timeZone);
  return twelveHour(hour, minute);
}

/** Minutes since midnight, office time. Used for the "Late" check. */
export function officeMinutesNow(now = new Date(), timeZone = officeTimeZone()) {
  const { hour, minute } = officeHourMinute(now, timeZone);
  return hour * 60 + minute;
}

/** A stored "HH:MM" time of day shown in 12-hour format, e.g. "14:30" -> "2:30 PM". */
export function formatTimeOfDay(value: string | null | undefined) {
  const match = value?.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return twelveHour(Number(match[1]) % 24, Number(match[2]));
}

/** "HH:MM" -> minutes since midnight, or null. */
export function timeOfDayMinutes(value: string | null | undefined) {
  const match = value?.match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
