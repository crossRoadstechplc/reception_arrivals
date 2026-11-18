"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setRoomBooking } from "@/lib/actions/guests";
import { Alert } from "@/components/ui";
import { BuildingIcon } from "@/components/icons";

/** Floor admins: offer a meeting room on this floor's guest form, or stop offering it. */
export function RoomBookingToggle({ floorId, enabled }: { floorId: string; enabled: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setError(null);
    setOn(next);
    startTransition(async () => {
      const result = await setRoomBooking(floorId, next);
      if (!result.ok) {
        setOn(!next);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-3 pt-5 md:px-5">
      <section className="card flex items-center gap-3 px-4 py-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-panel-2 text-muted">
          <BuildingIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="room-booking-title" className="text-[15px] font-semibold">
            Meeting room booking
          </h2>
          <p className="text-sm text-muted">
            {on ? "Hosts can book a meeting room when they add a guest." : "The guest form doesn’t offer a meeting room."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="room-booking-title"
          disabled={pending}
          onClick={toggle}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? "bg-signal" : "bg-line-strong"}`}
        >
          <span className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : ""}`} />
        </button>
      </section>
      {error ? (
        <div className="mt-2">
          <Alert onClose={() => setError(null)}>{error}</Alert>
        </div>
      ) : null}
    </div>
  );
}
