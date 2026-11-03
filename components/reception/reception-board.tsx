"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setReceptionStatus } from "@/lib/actions/guests";
import { formatClock } from "@/lib/dates";
import { type GuestStatus } from "@/lib/types";
import {
  Alert,
  DateHeading,
  DateNav,
  EmptyState,
  StatTile,
  StatusBadge,
  Toast,
  useToast,
} from "@/components/ui";
import { LiveIndicator, useLiveRefresh } from "@/components/use-live-refresh";
import {
  ArrowUpIcon,
  CheckIcon,
  ChevronDown,
  NoteIcon,
  RefreshIcon,
  SearchIcon,
  UndoIcon,
  UserIcon,
  XIcon,
} from "@/components/icons";

export type BoardGuest = {
  id: string;
  guestName: string;
  company: string | null;
  hostName: string;
  expectedArrival: string | null;
  status: GuestStatus;
  notes: string | null;
  clearedAt: string | null;
  floorId: string;
  floorName: string;
  floorNumber: number;
};

type FloorOption = { id: string; name: string; number: number };

/** "active" = everyone still relevant today (hides cancelled and no-shows). */
type StatusFilter = "active" | "EXPECTED" | "ARRIVED" | "CLEARED" | "GONE";

const STATUS_ORDER: Record<GuestStatus, number> = {
  ARRIVED: 0,
  EXPECTED: 1,
  CLEARED: 2,
  NO_SHOW: 3,
  CANCELLED: 4,
};

function matchesStatus(filter: StatusFilter, status: GuestStatus) {
  if (filter === "active") return status !== "CANCELLED" && status !== "NO_SHOW";
  if (filter === "GONE") return status === "CANCELLED" || status === "NO_SHOW";
  return status === filter;
}

export function ReceptionBoard({
  date,
  today,
  timeZone,
  guests,
  floors,
}: {
  date: string;
  today: string;
  timeZone: string;
  guests: BoardGuest[];
  floors: FloorOption[];
}) {
  const router = useRouter();
  const live = useLiveRefresh();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [floorId, setFloorId] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [, startTransition] = useTransition();
  const { toast, show, dismiss } = useToast();

  // Current office time, used to flag late guests. Set on the client only.
  useEffect(() => {
    const tick = () => setNow(formatClock(new Date(), timeZone));
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, [timeZone]);

  // Press "/" to jump to search.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const counts = useMemo(() => {
    const byStatus = { EXPECTED: 0, ARRIVED: 0, CLEARED: 0, GONE: 0 };
    for (const guest of guests) {
      if (guest.status === "CANCELLED" || guest.status === "NO_SHOW") byStatus.GONE += 1;
      else byStatus[guest.status] += 1;
    }
    return byStatus;
  }, [guests]);

  const floorCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const guest of guests) {
      if (matchesStatus(status, guest.status)) map[guest.floorId] = (map[guest.floorId] ?? 0) + 1;
    }
    return map;
  }, [guests, status]);

  const needle = query.trim().toLowerCase();
  const visible = guests.filter((guest) => {
    if (floorId !== "all" && guest.floorId !== floorId) return false;
    if (!matchesStatus(status, guest.status)) return false;
    if (!needle) return true;
    return `${guest.guestName} ${guest.company ?? ""} ${guest.hostName}`.toLowerCase().includes(needle);
  });

  const groups = floors
    .filter((floor) => floorId === "all" || floor.id === floorId)
    .map((floor) => ({
      floor,
      guests: visible
        .filter((guest) => guest.floorId === floor.id)
        .sort(
          (a, b) =>
            STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
            (a.expectedArrival ?? "99:99").localeCompare(b.expectedArrival ?? "99:99") ||
            a.guestName.localeCompare(b.guestName),
        ),
    }))
    .filter((group) => group.guests.length > 0);

  function go(nextDate: string) {
    router.push(nextDate === today ? "/reception" : `/reception?date=${nextDate}`);
  }

  function toggleStatus(next: StatusFilter) {
    setStatus((current) => (current === next ? "active" : next));
  }

  function updateStatus(guest: BoardGuest, next: GuestStatus, opts: { undo?: boolean } = {}) {
    const previous = guest.status;
    setError(null);
    setPendingId(guest.id);
    startTransition(async () => {
      const result = await setReceptionStatus(guest.id, next);
      setPendingId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFlashId(guest.id);
      window.setTimeout(() => setFlashId((current) => (current === guest.id ? null : current)), 1600);
      router.refresh();
      if (opts.undo) return;
      const message =
        next === "CLEARED"
          ? `${guest.guestName} cleared for ${guest.floorName}`
          : next === "ARRIVED"
            ? `${guest.guestName} is in the lobby`
            : next === "NO_SHOW"
              ? `${guest.guestName} marked no-show`
              : `${guest.guestName} restored`;
      show({
        message,
        action: { label: "Undo", onClick: () => updateStatus({ ...guest, status: next }, previous, { undo: true }) },
      });
    });
  }

  const filtersActive = status !== "active" || floorId !== "all" || needle.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-5 md:px-5">
      {/* Title row */}
      <section className="flex flex-wrap items-end gap-3">
        <div className="mr-auto min-w-0">
          <DateHeading date={date} today={today} title="Reception" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LiveIndicator live={live} />
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="Refresh now"
            title="Refresh now"
            onClick={() => startRefresh(() => router.refresh())}
          >
            <RefreshIcon className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <DateNav date={date} today={today} onChange={go} />
        </div>
      </section>

      {/* Status tiles double as filters */}
      <section className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <StatTile label="Expected" value={counts.EXPECTED} tone="expected" active={status === "EXPECTED"} onClick={() => toggleStatus("EXPECTED")} />
        <StatTile label="In lobby" value={counts.ARRIVED} tone="arrived" active={status === "ARRIVED"} onClick={() => toggleStatus("ARRIVED")} />
        <StatTile label="Cleared" value={counts.CLEARED} tone="cleared" active={status === "CLEARED"} onClick={() => toggleStatus("CLEARED")} />
        <StatTile label="No-show / cancelled" value={counts.GONE} tone="idle" active={status === "GONE"} onClick={() => toggleStatus("GONE")} />
      </section>

      {/* Search + floor filter */}
      <section className="card flex flex-col gap-2.5 p-2.5 lg:flex-row lg:items-center">
        <label className="relative block lg:w-80 lg:shrink-0">
          <span className="sr-only">Search guests</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search guest, company or host"
            className="field pl-9"
          />
        </label>
        <div className="scrollbar-none flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          <button type="button" className="chip" aria-pressed={floorId === "all"} onClick={() => setFloorId("all")}>
            All floors
          </button>
          {floors.map((floor) => (
            <button
              key={floor.id}
              type="button"
              className="chip"
              aria-pressed={floorId === floor.id}
              onClick={() => setFloorId(floor.id)}
            >
              {floor.name}
              <span className="font-mono text-[11px] opacity-60">{floorCounts[floor.id] ?? 0}</span>
            </button>
          ))}
        </div>
        {filtersActive ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm shrink-0"
            onClick={() => {
              setQuery("");
              setFloorId("all");
              setStatus("active");
            }}
          >
            <XIcon className="size-3.5" />
            Clear filters
          </button>
        ) : null}
      </section>

      {error ? <Alert onClose={() => setError(null)}>{error}</Alert> : null}

      {/* Guest list */}
      {groups.length === 0 ? (
        <EmptyState
          icon={<UserIcon className="size-6" />}
          title={guests.length === 0 ? "No guests listed for this day" : "No guests match this view"}
          body={
            guests.length === 0
              ? "Floor admins add visitors ahead of time. New names appear here automatically."
              : "Try another floor or status, or clear the search."
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((group) => {
            const isCollapsed = collapsed[group.floor.id] ?? false;
            const waiting = group.guests.filter((g) => g.status === "EXPECTED" || g.status === "ARRIVED").length;
            return (
              <section key={group.floor.id} className="card overflow-hidden">
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-panel-2"
                  onClick={() => setCollapsed((current) => ({ ...current, [group.floor.id]: !isCollapsed }))}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink font-mono text-sm font-medium text-white">
                    {group.floor.number}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{group.floor.name}</span>
                    <span className="block text-xs text-muted">
                      {group.guests.length} {group.guests.length === 1 ? "guest" : "guests"}
                      {waiting > 0 ? ` · ${waiting} still to clear` : ""}
                    </span>
                  </span>
                  <ChevronDown className={`size-5 text-muted transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                </button>
                {isCollapsed ? null : (
                  <ul className="divide-y divide-line border-t border-line">
                    {group.guests.map((guest) => (
                      <GuestRow
                        key={guest.id}
                        guest={guest}
                        timeZone={timeZone}
                        late={
                          date === today &&
                          now !== null &&
                          guest.status === "EXPECTED" &&
                          !!guest.expectedArrival &&
                          guest.expectedArrival < now
                        }
                        pending={pendingId === guest.id}
                        flash={flashId === guest.id}
                        onStatus={(next) => updateStatus(guest, next)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <p className="hidden pb-2 text-center text-xs text-muted lg:block">
        Tip: press <kbd className="rounded border border-line-strong bg-panel px-1 font-mono">/</kbd> to search
      </p>

      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}

function GuestRow({
  guest,
  timeZone,
  late,
  pending,
  flash,
  onStatus,
}: {
  guest: BoardGuest;
  timeZone: string;
  late: boolean;
  pending: boolean;
  flash: boolean;
  onStatus: (next: GuestStatus) => void;
}) {
  const done = guest.status === "CLEARED" || guest.status === "CANCELLED" || guest.status === "NO_SHOW";

  return (
    <li className={`px-4 py-3 ${flash ? "flash" : ""} ${done ? "bg-panel-2/60" : ""}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="w-14 shrink-0 pt-0.5">
            <div className={`font-mono text-base font-medium ${done ? "text-muted" : "text-ink"}`}>
              {guest.expectedArrival ?? "—:—"}
            </div>
            {late ? <div className="text-[11px] font-bold text-signal uppercase">Late</div> : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className={`text-base font-semibold tracking-tight ${done ? "text-muted" : ""}`}>
                {guest.guestName}
              </h3>
              <StatusBadge status={guest.status} />
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {guest.company ? <span className="font-medium text-ink-soft">{guest.company} · </span> : null}
              Host: {guest.hostName}
              {guest.clearedAt && guest.status === "CLEARED" ? ` · cleared ${formatClock(guest.clearedAt, timeZone)}` : ""}
            </p>
            {guest.notes ? (
              <p className="mt-1.5 inline-flex max-w-full items-start gap-1.5 rounded-lg bg-expected-soft px-2 py-1 text-xs font-medium text-expected">
                <NoteIcon className="mt-px size-3.5 shrink-0" />
                <span className="break-words">{guest.notes}</span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 pl-[4.25rem] md:pl-0">
          {guest.status === "EXPECTED" ? (
            <button type="button" className="btn btn-secondary h-11" disabled={pending} onClick={() => onStatus("ARRIVED")}>
              <CheckIcon className="size-4" />
              Arrived
            </button>
          ) : null}
          {guest.status === "EXPECTED" || guest.status === "ARRIVED" ? (
            <>
              <button
                type="button"
                className="btn btn-go h-11 min-w-28 px-5"
                disabled={pending}
                onClick={() => onStatus("CLEARED")}
              >
                <ArrowUpIcon className="size-4" />
                {pending ? "Saving…" : "Clear"}
              </button>
              <button
                type="button"
                className="btn btn-ghost h-11"
                disabled={pending}
                onClick={() => onStatus("NO_SHOW")}
              >
                No-show
              </button>
            </>
          ) : null}
          {guest.status === "CLEARED" ? (
            <button type="button" className="btn btn-ghost h-11" disabled={pending} onClick={() => onStatus("ARRIVED")}>
              <UndoIcon className="size-4" />
              Undo
            </button>
          ) : null}
          {guest.status === "NO_SHOW" || guest.status === "CANCELLED" ? (
            <button type="button" className="btn btn-secondary h-11" disabled={pending} onClick={() => onStatus("EXPECTED")}>
              <UndoIcon className="size-4" />
              Restore
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
