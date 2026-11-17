"use client";

import { RefreshButton } from "@/components/refresh-button";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteGuest, setFloorGuestStatus } from "@/lib/actions/guests";
import { GuestForm } from "@/components/floor/guest-form";
import { FLOOR_ROLE_LABEL, type FloorRole, type GuestStatus } from "@/lib/types";
import {
  Alert,
  ConfirmDialog,
  DateHeading,
  DateNav,
  EmptyState,
  StatTile,
  StatusBadge,
  Toast,
  useToast,
  PlateTag,
} from "@/components/ui";
import { LiveIndicator, useLiveRefresh } from "@/components/use-live-refresh";
import { PushPrompt } from "@/components/push-prompt";
import { BellIcon, BuildingIcon, CarIcon, NoteIcon, PencilIcon, PlusIcon, TrashIcon, UndoIcon, UserIcon, XIcon } from "@/components/icons";

export type FloorGuest = {
  id: string;
  /** ISO date of the visit. */
  visitDate: string;
  guestName: string;
  company: string | null;
  hostName: string;
  hostUserId: string | null;
  expectedArrival: string | null;
  status: GuestStatus;
  notes: string | null;
  licensePlate: string | null;
  vehicle: string | null;
  expectedLabel: string | null;
  checkedInLabel: string | null;
  /** Colleagues on the "Also notify" list. */
  notifyUsers: { id: string; name: string }[];
  /** You see this guest only because you're on its "Also notify" list. */
  invited: boolean;
  mine: boolean;
  canEdit: boolean;
};

type FloorOption = { id: string; name: string; number: number; role: FloorRole };
export type HostOption = { id: string; name: string };

export function GuestManager({
  date,
  today,
  dateLabel,
  floors,
  floorId,
  myRole,
  currentUserId,
  hosts,
  people,
  guests,
}: {
  date: string;
  today: string;
  dateLabel: string;
  floors: FloorOption[];
  floorId: string | null;
  myRole: FloorRole | null;
  currentUserId: string;
  hosts: HostOption[];
  /** Everyone on the floor, for "Also notify". */
  people: HostOption[];
  guests: FloorGuest[];
}) {
  const router = useRouter();
  const live = useLiveRefresh();
  const [editing, setEditing] = useState<FloorGuest | null | "new">(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<FloorGuest | null>(null);
  const [deletePending, startDelete] = useTransition();
  const [, startTransition] = useTransition();
  const { toast, show, dismiss } = useToast();
  const floor = floors.find((item) => item.id === floorId);
  const isAdmin = myRole === "ADMIN";
  const isPast = date < today;
  const recentCompanies = useMemo(
    () => [...new Set(guests.map((g) => g.company?.trim()).filter((c): c is string => Boolean(c)))],
    [guests],
  );

  const counts = useMemo(
    () => ({
      expected: guests.filter((g) => g.status === "EXPECTED").length,
      checkedIn: guests.filter((g) => g.status === "ARRIVED" || g.status === "CLEARED").length,
      gone: guests.filter((g) => g.status === "CANCELLED" || g.status === "NO_SHOW").length,
    }),
    [guests],
  );

  function visit(next: { date?: string; floorId?: string }) {
    const params = new URLSearchParams();
    const nextDate = next.date ?? date;
    if (nextDate !== today) params.set("date", nextDate);
    const nextFloor = next.floorId ?? floorId;
    if (nextFloor && floors.length > 1) params.set("floor", nextFloor);
    const qs = params.toString();
    router.push(qs ? `/floor?${qs}` : "/floor");
  }

  function changeStatus(guest: FloorGuest, status: "EXPECTED" | "CANCELLED", undo = false) {
    setError(null);
    setPendingId(guest.id);
    startTransition(async () => {
      const result = await setFloorGuestStatus(guest.id, status);
      setPendingId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      if (undo) return;
      show({
        message: status === "CANCELLED" ? `${guest.guestName}'s visit cancelled` : `${guest.guestName} restored`,
        action: {
          label: "Undo",
          onClick: () => changeStatus(guest, status === "CANCELLED" ? "EXPECTED" : "CANCELLED", true),
        },
      });
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    const guest = deleting;
    setError(null);
    startDelete(async () => {
      const result = await deleteGuest(guest.id);
      setDeleting(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      show({ message: `${guest.guestName} deleted` });
    });
  }

  const heading = isAdmin ? (floor?.name ?? "Floor guests") : `My guests${floor ? ` · ${floor.name}` : ""}`;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-3 py-5 md:px-5">
      {/* Title row */}
      <section className="flex flex-wrap items-end gap-3">
        <div className="mr-auto min-w-0">
          <DateHeading date={date} today={today} label={dateLabel} title={heading} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LiveIndicator live={live} />
          <RefreshButton />
          {floors.length > 1 ? (
            <label className="relative">
              <span className="sr-only">Floor</span>
              <select
                value={floorId ?? ""}
                onChange={(event) => visit({ floorId: event.target.value })}
                className="field h-10 w-auto pr-8 font-medium"
              >
                {floors.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.number} · {item.name}
                    {item.role === "ADMIN" ? ` (${FLOOR_ROLE_LABEL.ADMIN.toLowerCase()})` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <DateNav date={date} today={today} onChange={(next) => visit({ date: next })} />
        </div>
      </section>

      {!floorId ? (
        <EmptyState
          icon={<BuildingIcon className="size-6" />}
          title="You're not on a floor yet"
          body="Ask your floor admin to add you to their floor team. Once they do, you can add guests here."
        />
      ) : (
        <>
          <PushPrompt />

          {/* Day summary + main action */}
          <section className="grid grid-cols-2 gap-2.5 md:grid-cols-[repeat(3,1fr)_auto]">
            <StatTile label="Expected" value={counts.expected} tone="expected" />
            <StatTile label="Checked in" value={counts.checkedIn} tone="cleared" />
            <StatTile label="Cancelled / no-show" value={counts.gone} tone="idle" />
            <button
              type="button"
              className="btn btn-primary btn-lg col-span-2 h-auto min-h-12 md:col-span-1 md:px-6"
              onClick={() => setEditing("new")}
            >
              <PlusIcon className="size-5" />
              Add guest
            </button>
          </section>

          {isPast ? (
            <p className="rounded-xl bg-idle-soft px-3.5 py-2 text-sm text-muted">
              You are looking at a past day. New guests should go on today or a future date.
            </p>
          ) : null}

          {error ? <Alert onClose={() => setError(null)}>{error}</Alert> : null}

          {guests.length === 0 ? (
            <EmptyState
              icon={<UserIcon className="size-6" />}
              title={isAdmin ? "No guests for this day" : "You have no guests this day"}
              body={
                isAdmin
                  ? "Add the people reception should expect, or let your team add their own."
                  : "Add the people you're expecting. Reception will see them, and you'll be told when they arrive."
              }
              action={
                <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
                  <PlusIcon className="size-4" />
                  Add a guest
                </button>
              }
            />
          ) : (
            <ul className="card divide-y divide-line overflow-hidden">
              {guests.map((guest) => {
                const inactive = guest.status === "CANCELLED" || guest.status === "NO_SHOW";
                const pending = pendingId === guest.id;
                const mine = guest.hostUserId === currentUserId;
                return (
                  <li
                    key={guest.id}
                    className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center ${inactive ? "bg-panel-2/60" : ""} ${
                      guest.status === "ARRIVED" || guest.status === "CLEARED" ? "bg-cleared-soft/40" : ""
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className={`w-[4.75rem] shrink-0 pt-0.5 font-mono text-sm font-medium whitespace-nowrap ${inactive ? "text-muted" : ""}`}>
                        {guest.expectedLabel ?? "No time"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <h2 className={`text-base font-semibold tracking-tight ${inactive ? "text-muted line-through decoration-1" : ""}`}>
                            {guest.guestName}
                          </h2>
                          <StatusBadge status={guest.status} />
                          {guest.invited ? (
                            <span className="badge bg-arrived-soft text-arrived">Invited by {guest.hostName}</span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-sm text-muted">
                          {guest.company ? <span className="font-medium text-ink-soft">{guest.company} · </span> : null}
                          {isAdmin ? (
                            <>
                              Host: <span className="font-medium text-ink-soft">{mine ? "You" : guest.hostName}</span>
                            </>
                          ) : null}
                          {(guest.status === "ARRIVED" || guest.status === "CLEARED") && guest.checkedInLabel ? (
                            <span className="font-semibold text-cleared">
                              {isAdmin ? " · " : ""}Checked in at {guest.checkedInLabel}
                            </span>
                          ) : null}
                        </p>
                        {guest.notifyUsers.length ? (
                          <p className="mt-1.5 inline-flex max-w-full items-start gap-1.5 text-xs text-muted">
                            <BellIcon className="mt-px size-3.5 shrink-0" />
                            <span>Also notifying {guest.notifyUsers.map((u) => (u.id === currentUserId ? "you" : u.name)).join(", ")}</span>
                          </p>
                        ) : null}
                        {guest.licensePlate || guest.vehicle ? (
                          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                            <CarIcon className="size-4 shrink-0" />
                            {guest.licensePlate ? <PlateTag plate={guest.licensePlate} /> : null}
                            {guest.vehicle ? <span>{guest.vehicle}</span> : null}
                          </p>
                        ) : null}
                        {guest.notes ? (
                          <p className="mt-1.5 inline-flex max-w-full items-start gap-1.5 text-xs text-muted">
                            <NoteIcon className="mt-px size-3.5 shrink-0" />
                            <span className="break-words">{guest.notes}</span>
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className={`flex shrink-0 gap-1.5 pl-[5.5rem] sm:pl-0 ${guest.canEdit ? "" : "hidden"}`}>
                      {guest.status !== "CLEARED" && !inactive ? (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(guest)}>
                          <PencilIcon className="size-3.5" />
                          Edit
                        </button>
                      ) : null}
                      {guest.status === "EXPECTED" || guest.status === "ARRIVED" ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={pending}
                          onClick={() => changeStatus(guest, "CANCELLED")}
                        >
                          <XIcon className="size-3.5" />
                          Cancel visit
                        </button>
                      ) : null}
                      {guest.status === "CANCELLED" ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={pending}
                          onClick={() => changeStatus(guest, "EXPECTED")}
                        >
                          <UndoIcon className="size-3.5" />
                          Restore
                        </button>
                      ) : null}
                      {inactive ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm text-danger hover:bg-danger-soft hover:text-danger"
                          disabled={pending}
                          onClick={() => setDeleting(guest)}
                        >
                          <TrashIcon className="size-3.5" />
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {editing && floorId ? (
        <GuestForm
          date={editing === "new" && date < today ? today : date}
          today={today}
          floorId={floorId}
          floorName={floor?.name ?? ""}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          hosts={hosts}
          people={people}
          recentCompanies={recentCompanies}
          guest={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(name, isNew) => show({ message: isNew ? `${name} added` : `${name} updated` })}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.guestName}?`}
          body="This removes the guest from the list for good. It can't be undone."
          confirmLabel="Delete guest"
          danger
          pending={deletePending}
          onConfirm={confirmDelete}
          onClose={() => setDeleting(null)}
        />
      ) : null}

      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}
