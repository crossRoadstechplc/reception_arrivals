import type { Floor, Guest, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatClock, fromDateOnly, officeHourMinute } from "@/lib/dates";
import type { BookingOutcome, RoomOption } from "@/lib/types";

/**
 * Meeting room bookings through the Workforce API. Only the 6th floor is
 * connected for now. The guest is always saved first: a booking problem is
 * reported to the person but never stops the visit being recorded.
 */

const BOOKING_FLOOR_NUMBER = 6;
/** East Africa Time has no daylight saving, so the office offset never changes. */
const OFFICE_OFFSET_HOURS = 3;
const REQUEST_TIMEOUT_MS = 10_000;

export type BookingWanted = { roomId: string; minutes: number };

type WorkforceBooking = {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  room: { id: string; name: string };
};

class WorkforceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

function connection() {
  const url = process.env.BOOKING_WEBHOOK_URL?.trim().replace(/\/$/, "");
  const key = process.env.BOOKING_WEBHOOK_KEY?.trim();
  return url && key ? { url, key } : null;
}

async function workforce<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
  const target = connection();
  if (!target) throw new WorkforceError("NOT_CONFIGURED", "Room booking is not connected.");
  let response: Response;
  try {
    response = await fetch(`${target.url}${path}`, {
      method,
      headers: { "X-API-Key": target.key, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("Workforce booking API could not be reached", error);
    throw new WorkforceError("UNREACHABLE", "The booking system could not be reached.");
  }
  const json = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { code?: string; message?: string; details?: Record<string, unknown> };
  } | null;
  if (response.ok && json?.data !== undefined) return json.data;
  const code = json?.error?.code ?? "SERVER_ERROR";
  console.error(`Workforce booking API answered ${response.status} ${code}`);
  throw new WorkforceError(code, json?.error?.message ?? "The booking system had a problem.", json?.error?.details);
}

/** This floor is connected to a booking system. */
export function roomBookingAvailable(floor: Pick<Floor, "number">) {
  return floor.number === BOOKING_FLOOR_NUMBER && connection() !== null;
}

/** Connected, and the floor admin has turned booking on. */
export function roomBookingOn(floor: Pick<Floor, "number" | "roomBookingEnabled">) {
  return roomBookingAvailable(floor) && floor.roomBookingEnabled;
}

function officeHHMM(value: string | Date) {
  const { hour, minute } = officeHourMinute(value);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const slotLabel = (start: string | Date, end: string | Date) => `${formatClock(start)} – ${formatClock(end)}`;

/** A moment written in office time, the format the booking API expects. */
function officeStamp(ms: number) {
  const shifted = new Date(ms + OFFICE_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 19);
  return `${shifted}+0${OFFICE_OFFSET_HOURS}:00`;
}

/** The rooms this floor can book, with the times already taken on a day. */
export async function roomsForDay(date: string, ignoreBookingId?: string | null): Promise<RoomOption[]> {
  const rooms = await workforce<{
    items: { id: string; name: string; location: string | null; capacity: number | null }[];
  }>("GET", "/rooms?page=1&pageSize=100");
  return Promise.all(
    rooms.items.map(async (room) => {
      const day = await workforce<{ busy: { startsAt: string; endsAt: string; bookingId?: string }[] }>(
        "GET",
        `/rooms/${room.id}/availability?date=${date}`,
      );
      return {
        id: room.id,
        name: room.name,
        location: room.location,
        capacity: room.capacity,
        busy: day.busy
          .filter((slot) => !ignoreBookingId || slot.bookingId !== ignoreBookingId)
          .map((slot) => ({
            from: officeHHMM(slot.startsAt),
            to: officeHHMM(slot.endsAt),
            label: slotLabel(slot.startsAt, slot.endsAt),
          })),
      };
    }),
  );
}

const isHeld = (guest: Pick<Guest, "bookingId" | "bookingStatus">) =>
  Boolean(guest.bookingId) && guest.bookingStatus === "BOOKED";

function heldMinutes(guest: Pick<Guest, "bookingStartsAt" | "bookingEndsAt">) {
  if (!guest.bookingStartsAt || !guest.bookingEndsAt) return 60;
  return Math.round((guest.bookingEndsAt.getTime() - guest.bookingStartsAt.getTime()) / 60_000);
}

async function roomName(roomId: string, known?: string | null) {
  if (known) return known;
  try {
    const rooms = await workforce<{ items: { id: string; name: string }[] }>("GET", "/rooms?page=1&pageSize=100");
    return rooms.items.find((room) => room.id === roomId)?.name ?? "The meeting room";
  } catch {
    return "The meeting room";
  }
}

/** Why a booking failed, in words for the person who asked for it. */
function reasonFor(error: unknown, room: string, hostName: string, code: string): { kind: "taken" | "failed"; reason: string } {
  const failure = error instanceof WorkforceError ? error : new WorkforceError("SERVER_ERROR", "");
  switch (failure.code) {
    case "ROOM_UNAVAILABLE": {
      const { startsAt, endsAt } = (failure.details ?? {}) as { startsAt?: string; endsAt?: string };
      const when = startsAt && endsAt ? ` from ${slotLabel(startsAt, endsAt)}` : " at that time";
      return { kind: "taken", reason: `${room} is taken${when}.` };
    }
    case "EMPLOYEE_NOT_FOUND":
      return { kind: "failed", reason: `The booking system doesn't recognise ${hostName}'s user code (${code}).` };
    case "PAST_SLOT":
      return { kind: "failed", reason: "That time has already passed." };
    case "ROOM_NOT_FOUND":
      return { kind: "failed", reason: `${room} is no longer available to book.` };
    default:
      return { kind: "failed", reason: "The booking system had a server problem." };
  }
}

const clearedBooking = {
  bookingId: null,
  bookingStatus: null,
  bookingRoomId: null,
  bookingRoomName: null,
  bookingStartsAt: null,
  bookingEndsAt: null,
  bookingEmployee: null,
  bookingTitle: null,
  bookingError: null,
} satisfies Prisma.GuestUpdateInput;

const cancelRemote = (bookingId: string, reason: string) =>
  workforce<WorkforceBooking>("POST", `/bookings/${bookingId}/cancel`, { reason });

/**
 * Brings the room booking in line with a saved guest.
 * `wanted`: details = book or update, null = no room, undefined = keep any booking in step with the visit.
 */
export async function syncGuestBooking(guestId: string, wanted: BookingWanted | null | undefined): Promise<BookingOutcome | undefined> {
  const guest = await db.guest.findUnique({
    where: { id: guestId },
    include: { floor: true, hostUser: { select: { externalId: true, name: true, email: true, active: true } } },
  });
  if (!guest) return undefined;
  const held = isHeld(guest);
  const saved = `${guest.guestName} was saved`;

  if (wanted === null) {
    if (held) {
      try {
        await cancelRemote(guest.bookingId!, "Room no longer needed");
      } catch (error) {
        console.error("Room booking could not be cancelled", error);
        return { kind: "failed", message: `${saved}, but the room booking could not be cancelled because of a server problem.` };
      }
    }
    if (guest.bookingStatus) await db.guest.update({ where: { id: guest.id }, data: clearedBooking });
    return held ? { kind: "cancelled", message: `The ${guest.bookingRoomName ?? "room"} booking was cancelled.` } : undefined;
  }
  if (wanted === undefined && !held) return undefined;

  const roomId = wanted?.roomId ?? guest.bookingRoomId!;
  const minutes = wanted?.minutes ?? heldMinutes(guest);
  const earlier = held ? slotLabel(guest.bookingStartsAt!, guest.bookingEndsAt!) : "";

  /** Records a problem and says what happened to the room. */
  const problem = async (kind: "taken" | "failed", reason: string, keepHeld = held): Promise<BookingOutcome> => {
    const room = await roomName(roomId, guest.bookingRoomId === roomId ? guest.bookingRoomName : null);
    await db.guest.update({
      where: { id: guest.id },
      data: keepHeld
        ? { bookingError: reason }
        : { ...clearedBooking, bookingStatus: "FAILED", bookingRoomId: roomId, bookingRoomName: room, bookingError: reason, bookingEndsAt: null },
    });
    return {
      kind,
      message: keepHeld
        ? `${reason} ${saved}, and ${guest.bookingRoomName ?? "the room"} is still booked for ${earlier}.`
        : `${reason} ${saved}, but the room was not booked.`,
    };
  };

  if (!held && !roomBookingOn(guest.floor)) return problem("failed", "Room booking is turned off for this floor.");
  if (!guest.expectedArrival) return problem("failed", "A room needs an expected time.");

  const code = guest.hostUser?.active ? guest.hostUser.externalId : null;
  const hostName = guest.hostUser?.name || guest.hostUser?.email || guest.hostName;
  if (!code) {
    if (held) await cancelRemote(guest.bookingId!, "Host changed").catch((error) => console.error("Room booking could not be cancelled", error));
    return problem("failed", "A room can only be booked for a host with an account.", false);
  }

  const startMs = new Date(`${fromDateOnly(guest.visitDate)}T${guest.expectedArrival}:00+0${OFFICE_OFFSET_HOURS}:00`).getTime();
  const endMs = startMs + minutes * 60_000;
  const slot = { startsAt: officeStamp(startMs), endsAt: officeStamp(endMs) };
  const title = `Meeting with ${guest.guestName}${guest.company ? ` (${guest.company})` : ""}`.slice(0, 120);

  const remember = (booking: WorkforceBooking, attempt: number) =>
    db.guest.update({
      where: { id: guest.id },
      data: {
        bookingId: booking.id,
        bookingStatus: "BOOKED",
        bookingRoomId: booking.room.id,
        bookingRoomName: booking.room.name,
        bookingStartsAt: new Date(booking.startsAt),
        bookingEndsAt: new Date(booking.endsAt),
        bookingEmployee: code,
        bookingTitle: title,
        bookingAttempt: attempt,
        bookingError: null,
      },
    });

  if (held) {
    const sameHost = guest.bookingEmployee === code;
    const sameSlot =
      guest.bookingRoomId === roomId && guest.bookingStartsAt!.getTime() === startMs && guest.bookingEndsAt!.getTime() === endMs;
    if (sameHost && sameSlot && guest.bookingTitle === title) {
      if (guest.bookingError) await db.guest.update({ where: { id: guest.id }, data: { bookingError: null } });
      return undefined;
    }
    if (sameHost) {
      try {
        const moved = await workforce<WorkforceBooking>("PATCH", `/bookings/${guest.bookingId}`, { roomId, title, ...slot });
        await remember(moved, guest.bookingAttempt);
        return sameSlot ? undefined : { kind: "booked", message: `${moved.room.name} is now booked for ${slotLabel(moved.startsAt, moved.endsAt)}.` };
      } catch (error) {
        // Cancelled in the other system: book it again below.
        if (!(error instanceof WorkforceError && ["BOOKING_CANCELLED", "BOOKING_NOT_FOUND"].includes(error.code))) {
          const room = await roomName(roomId, guest.bookingRoomId === roomId ? guest.bookingRoomName : null);
          const { kind, reason } = reasonFor(error, room, hostName, code);
          return problem(kind, reason);
        }
      }
    } else {
      // A booking can't change hands, so the new host gets a new one.
      await cancelRemote(guest.bookingId!, "Host changed").catch((error) => console.error("Room booking could not be cancelled", error));
    }
  }

  const create = (attempt: number) =>
    workforce<WorkforceBooking>("POST", "/bookings", {
      employeeCode: code,
      roomId,
      title,
      notes: "Booked from Arrival Desk",
      ...slot,
      externalId: `${guest.id}-${attempt}`,
    });

  let attempt = guest.bookingAttempt;
  try {
    let booking: WorkforceBooking;
    try {
      booking = await create(attempt);
    } catch (error) {
      if (!(error instanceof WorkforceError && error.code === "EXTERNAL_ID_CONFLICT")) throw error;
      // A reference can only be used once, so retire the old booking and use a new one.
      const old = error.details?.bookingId;
      if (typeof old === "string") await cancelRemote(old, "Replaced by a new booking").catch(() => undefined);
      attempt += 1;
      booking = await create(attempt);
    }
    // Repeating a reference returns the booking it first made, even a cancelled one.
    if (booking.status !== "BOOKED") {
      attempt += 1;
      booking = await create(attempt);
    }
    await remember(booking, attempt);
    return { kind: "booked", message: `${booking.room.name} is booked for ${slotLabel(booking.startsAt, booking.endsAt)}.` };
  } catch (error) {
    const room = await roomName(roomId, guest.bookingRoomId === roomId ? guest.bookingRoomName : null);
    const { kind, reason } = reasonFor(error, room, hostName, code);
    return problem(kind, reason, false);
  }
}

/** The visit was cancelled: free the room, remembering it in case the visit is restored. */
export async function releaseGuestBooking(guestId: string): Promise<BookingOutcome | undefined> {
  const guest = await db.guest.findUnique({ where: { id: guestId } });
  if (!guest || !isHeld(guest)) return undefined;
  try {
    await cancelRemote(guest.bookingId!, "Visit cancelled");
    await db.guest.update({ where: { id: guest.id }, data: { bookingStatus: "RELEASED", bookingError: null } });
    return { kind: "cancelled", message: `The ${guest.bookingRoomName ?? "room"} booking was cancelled.` };
  } catch (error) {
    console.error("Room booking could not be cancelled", error);
    return { kind: "failed", message: `The visit was cancelled, but the ${guest.bookingRoomName ?? "room"} booking could not be cancelled because of a server problem.` };
  }
}

/** The visit was restored: ask for the room it had before. */
export async function restoreGuestBooking(guestId: string): Promise<BookingOutcome | undefined> {
  const guest = await db.guest.findUnique({ where: { id: guestId } });
  if (!guest || guest.bookingStatus !== "RELEASED" || !guest.bookingRoomId) return undefined;
  return syncGuestBooking(guest.id, { roomId: guest.bookingRoomId, minutes: heldMinutes(guest) });
}

/** What the floor screens show about a guest's room. */
export function guestBookingView(guest: Guest) {
  if (!guest.bookingStatus || guest.bookingStatus === "RELEASED") return null;
  const booked = guest.bookingStatus === "BOOKED" && guest.bookingStartsAt && guest.bookingEndsAt;
  return {
    booked: Boolean(booked),
    roomId: guest.bookingRoomId,
    roomName: guest.bookingRoomName,
    minutes: booked ? heldMinutes(guest) : null,
    timeLabel: booked ? slotLabel(guest.bookingStartsAt!, guest.bookingEndsAt!) : null,
    problem: guest.bookingError,
  };
}
