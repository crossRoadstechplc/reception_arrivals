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

export function formatClock(value: Date | string, timeZone = officeTimeZone()) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
