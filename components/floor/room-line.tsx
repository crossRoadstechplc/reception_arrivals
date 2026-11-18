import { AlertIcon, BuildingIcon } from "@/components/icons";
import type { FloorGuest } from "@/components/floor/guest-manager";

/** The meeting room for a visit, or why it couldn't be booked. */
export function RoomLine({ booking }: { booking: FloorGuest["booking"] }) {
  if (!booking) return null;
  return (
    <>
      {booking.booked ? (
        <p className="mt-1.5 flex max-w-full items-start gap-1.5 text-xs font-medium text-ink-soft">
          <BuildingIcon className="mt-px size-3.5 shrink-0 text-muted" />
          <span>
            {booking.roomName} · {booking.timeLabel}
          </span>
        </p>
      ) : null}
      {booking.problem ? (
        <p className="mt-1.5 flex max-w-full items-start gap-1.5 text-xs font-semibold text-danger">
          <AlertIcon className="mt-px size-3.5 shrink-0" />
          <span>
            {booking.booked ? "Room not moved" : "Room not booked"}: {booking.problem}
          </span>
        </p>
      ) : null}
    </>
  );
}
