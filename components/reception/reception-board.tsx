"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDeskNote, setReceptionStatus } from "@/lib/actions/guests";
import { timeOfDayMinutes } from "@/lib/dates";
import { type GuestStatus } from "@/lib/types";
import { Alert, DateHeading, DateNav, Drawer, EmptyState, PlateTag, StatusBadge, Toast, useToast } from "@/components/ui";
import { LiveIndicator, useLiveRefresh } from "@/components/use-live-refresh";
import { RefreshButton } from "@/components/refresh-button";
import { CarIcon, CheckIcon, NoteIcon, PencilIcon, SearchIcon, UndoIcon, UserIcon, XIcon } from "@/components/icons";

export type BoardGuest = {
  id: string;
  guestName: string;
  company: string | null;
  hostName: string;
  hostHasAccount: boolean;
  hostNotifiedVia: string | null;
  /** Colleagues on the guest's "Also notify" list, and how each was alerted. */
  alsoNotify: { name: string; notifiedVia: string | null }[];
  /** Time text is made on the server so every device shows the same thing. */
  expectedLabel: string | null;
  checkedInAt: string | null;
  checkedInLabel: string | null;
  createdLabel: string;
  notifiedLabel: string | null;
  arrivedByName: string | null;
  expectedArrival: string | null;
  status: GuestStatus;
  notes: string | null;
  deskNote: string | null;
  createdByName: string | null;
  floorId: string;
  floorName: string;
  /** The company that occupies the guest's floor. */
  floorCompany: string | null;
  floorNumber: number;
  licensePlate: string | null;
  vehicle: string | null;
};

type FloorOption = { id: string; name: string; company: string | null; number: number };

const hasCar = (guest: BoardGuest) => Boolean(guest.licensePlate || guest.vehicle);
const squash = (text: string) => text.toLowerCase().replace(/[\s-]+/g, "");
type Tab = "expected" | "in" | "gone";

const TABS: { id: Tab; label: string }[] = [
  { id: "expected", label: "Expected" },
  { id: "in", label: "Checked in" },
  { id: "gone", label: "Not coming" },
];

function tabOf(status: GuestStatus): Tab {
  if (status === "ARRIVED" || status === "CLEARED") return "in";
  if (status === "CANCELLED" || status === "NO_SHOW") return "gone";
  return "expected";
}

const byExpectedTime = (a: BoardGuest, b: BoardGuest) =>
  (a.expectedArrival ?? "99:99").localeCompare(b.expectedArrival ?? "99:99") || a.guestName.localeCompare(b.guestName);

const byCheckInDesc = (a: BoardGuest, b: BoardGuest) => (b.checkedInAt ?? "").localeCompare(a.checkedInAt ?? "");

export function ReceptionBoard({
  date,
  today,
  dateLabel,
  officeMinutes,
  guests,
  floors,
}: {
  date: string;
  today: string;
  /** e.g. "Monday 16 November", made on the server. */
  dateLabel: string;
  /** Office time (minutes since midnight) when the server built this page. */
  officeMinutes: number;
  guests: BoardGuest[];
  floors: FloorOption[];
}) {
  const router = useRouter();
  const live = useLiveRefresh();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("expected");
  const [floorId, setFloorId] = useState("all");
  const [carsOnly, setCarsOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState({ base: officeMinutes, minutes: 0 });
  const [, startTransition] = useTransition();
  const { toast, show, dismiss } = useToast();

  // Office time for the "Late" tag: the server's time plus how long this page
  // has been open (a steady timer), so a wrong device clock can't affect it.
  useEffect(() => {
    const started = performance.now();
    const timer = window.setInterval(() => {
      setElapsed({ base: officeMinutes, minutes: Math.floor((performance.now() - started) / 60_000) });
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [officeMinutes]);
  const nowMinutes = officeMinutes + (elapsed.base === officeMinutes ? elapsed.minutes : 0);

  // Press "/" anywhere to jump to search.
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

  const needle = query.trim().toLowerCase();
  const searching = needle.length > 0;

  const inScope = useMemo(
    () =>
      guests.filter((guest) => {
        if (floorId !== "all" && guest.floorId !== floorId) return false;
        if (carsOnly && !hasCar(guest)) return false;
        if (!needle) return true;
        const text = `${guest.guestName} ${guest.company ?? ""} ${guest.hostName} ${guest.floorCompany ?? ""} ${guest.vehicle ?? ""}`;
        // Plates match with or without spaces and dashes.
        if (text.toLowerCase().includes(needle)) return true;
        return guest.licensePlate ? squash(guest.licensePlate).includes(squash(needle)) : false;
      }),
    [guests, floorId, carsOnly, needle],
  );

  const counts = useMemo(() => {
    const result: Record<Tab, number> = { expected: 0, in: 0, gone: 0 };
    for (const guest of inScope) result[tabOf(guest.status)] += 1;
    return result;
  }, [inScope]);

  // While searching, show matches from every tab so reception finds anyone instantly.
  const visible = useMemo(() => {
    if (searching) {
      const order: Record<Tab, number> = { expected: 0, in: 1, gone: 2 };
      return inScope.slice().sort((a, b) => order[tabOf(a.status)] - order[tabOf(b.status)] || byExpectedTime(a, b));
    }
    const list = inScope.filter((guest) => tabOf(guest.status) === tab);
    return list.sort(tab === "in" ? byCheckInDesc : byExpectedTime);
  }, [inScope, searching, tab]);

  const floorCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const guest of guests) if (tabOf(guest.status) === "expected") map[guest.floorId] = (map[guest.floorId] ?? 0) + 1;
    return map;
  }, [guests]);

  // Cars still to come or parked (not cancelled), so reception can plan parking.
  const carCount = useMemo(
    () => guests.filter((g) => hasCar(g) && tabOf(g.status) !== "gone" && (floorId === "all" || g.floorId === floorId)).length,
    [guests, floorId],
  );

  const selected = guests.find((guest) => guest.id === selectedId) ?? null;
  const isToday = date === today;

  function go(nextDate: string) {
    setSelectedId(null);
    router.push(nextDate === today ? "/reception" : `/reception?date=${nextDate}`);
  }

  function isLate(guest: BoardGuest) {
    const expected = timeOfDayMinutes(guest.expectedArrival);
    return isToday && guest.status === "EXPECTED" && expected !== null && expected < nowMinutes;
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
          ? `${guest.guestName} checked in. ${guest.hostHasAccount ? `Alerting ${guest.hostName}.` : ""}`
          : next === "NO_SHOW"
            ? `${guest.guestName} marked no-show`
            : `${guest.guestName} moved back to expected`;
      show({
        message: message.trim(),
        action: { label: "Undo", onClick: () => updateStatus({ ...guest, status: next }, previous, { undo: true }) },
      });
    });
  }

  function checkIn(guest: BoardGuest) {
    // After checking in from search, clear it so the desk is ready for the next person.
    if (searching) setQuery("");
    updateStatus(guest, "CLEARED");
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-5 md:px-5">
      {/* Title row */}
      <section className="flex flex-wrap items-end gap-3">
        <div className="mr-auto min-w-0">
          <DateHeading date={date} today={today} label={dateLabel} title="Reception" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LiveIndicator live={live} />
          <RefreshButton />
          <DateNav date={date} today={today} onChange={go} />
        </div>
      </section>

      {/* Search first: reception types the name as the visitor walks up */}
      <section className="flex flex-col gap-2.5 sm:flex-row">
        <label className="relative block flex-1">
          <span className="sr-only">Find a visitor</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setQuery("");
              if (event.key === "Enter" && visible.length === 1) setSelectedId(visible[0].id);
            }}
            placeholder="Find a visitor, company, host or plate…"
            className="field h-12 pl-11 text-base"
            autoComplete="off"
          />
        </label>
        <select
          aria-label="Floor"
          value={floorId}
          onChange={(event) => setFloorId(event.target.value)}
          className="field h-12 font-medium sm:w-72"
        >
          <option value="all">All floors</option>
          {floors.map((floor) => (
            <option key={floor.id} value={floor.id}>
              {floor.name}
              {floor.company ? ` · ${floor.company}` : ""}
              {floorCounts[floor.id] ? ` · ${floorCounts[floor.id]} expected` : ""}
            </option>
          ))}
        </select>
      </section>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-line">
        <div role="tablist" className="flex gap-1">
          {TABS.map((item) => {
            const active = !searching && tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setQuery("");
                  setTab(item.id);
                }}
                className={`-mb-px inline-flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors ${
                  active ? "border-signal text-ink" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {item.label}
                <span
                  className={`rounded-full px-1.5 font-mono text-[11px] ${
                    active ? (item.id === "in" ? "bg-cleared text-white" : "bg-ink text-white") : "bg-idle-soft"
                  }`}
                >
                  {counts[item.id]}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-pressed={carsOnly}
          onClick={() => setCarsOnly((v) => !v)}
          title="Show only visitors coming by car"
          className={`mb-1.5 ml-auto inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
            carsOnly ? "border-ink bg-ink text-white" : "border-line-strong text-muted hover:text-ink"
          }`}
        >
          <CarIcon className="size-4" />
          By car
          <span className={`rounded-full px-1.5 font-mono text-[11px] ${carsOnly ? "bg-white/20" : "bg-idle-soft"}`}>
            {carCount}
          </span>
        </button>
        {searching ? (
          <p className="w-full pb-2 text-sm text-muted sm:w-auto">
            {visible.length} {visible.length === 1 ? "match" : "matches"} for “{query.trim()}”
            <button type="button" className="ml-2 font-semibold text-ink hover:underline" onClick={() => setQuery("")}>
              Clear
            </button>
          </p>
        ) : null}
      </div>

      {error ? <Alert onClose={() => setError(null)}>{error}</Alert> : null}

      {/* Visitor log */}
      {visible.length === 0 ? (
        <EmptyState
          icon={<UserIcon className="size-6" />}
          title={
            searching
              ? "No visitor matches that"
              : carsOnly
                ? "No visitors coming by car here"
                : guests.length === 0
                ? "No visitors listed for this day"
                : tab === "expected"
                  ? "Everyone expected is checked in"
                  : tab === "in"
                    ? "Nobody checked in yet"
                    : "No cancellations or no-shows"
          }
          body={
            searching
              ? "Check the spelling, or try the company, host or plate."
              : carsOnly
                ? "Turn off “By car” to see everyone."
              : guests.length === 0
                ? "Floor staff add their visitors ahead of time. New names appear here automatically."
                : undefined
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden grid-cols-[6rem_minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_13rem] gap-4 border-b border-line bg-panel-2 px-4 py-2 text-[11px] font-bold tracking-wider text-muted uppercase lg:grid">
            <span>Time</span>
            <span>Visitor</span>
            <span>Host</span>
            <span>Floor</span>
            <span className="text-right">{!searching && tab === "in" ? "Checked in" : ""}</span>
          </div>
          <ul className="divide-y divide-line">
            {visible.map((guest) => (
              <VisitorRow
                key={guest.id}
                guest={guest}
                late={isLate(guest)}
                pending={pendingId === guest.id}
                flash={flashId === guest.id}
                onOpen={() => setSelectedId(guest.id)}
                onCheckIn={() => checkIn(guest)}
              />
            ))}
          </ul>
        </div>
      )}

      <p className="hidden pb-2 text-center text-xs text-muted lg:block">
        Press <kbd className="rounded border border-line-strong bg-panel px-1 font-mono">/</kbd> to search ·{" "}
        <kbd className="rounded border border-line-strong bg-panel px-1 font-mono">Enter</kbd> opens a single match
      </p>

      {selected ? (
        <VisitorPanel
          key={selected.id}
          guest={selected}
          late={isLate(selected)}
          pending={pendingId === selected.id}
          onClose={() => setSelectedId(null)}
          onCheckIn={() => checkIn(selected)}
          onStatus={(next) => updateStatus(selected, next)}
          onSaved={(message) => show({ message })}
        />
      ) : null}

      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}

/* ---------------- Row ---------------- */

function VisitorRow({
  guest,
  late,
  pending,
  flash,
  onOpen,
  onCheckIn,
}: {
  guest: BoardGuest;
  late: boolean;
  pending: boolean;
  flash: boolean;
  onOpen: () => void;
  onCheckIn: () => void;
}) {
  const tab = tabOf(guest.status);

  return (
    <li
      className={`group cursor-pointer px-4 py-3 transition-colors hover:bg-panel-2 ${flash ? "flash" : ""} ${
        tab === "gone" ? "opacity-70" : ""
      }`}
      onClick={onOpen}
    >
      <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 lg:grid-cols-[6rem_minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_13rem] lg:gap-x-4">
        {/* Time */}
        <div className="self-start pt-0.5 lg:self-center lg:pt-0">
          <div className="font-mono text-sm font-medium whitespace-nowrap">
            {guest.expectedLabel ?? <span className="text-muted">Any time</span>}
          </div>
          {late ? <div className="text-[11px] font-bold text-signal uppercase">Late</div> : null}
        </div>

        {/* Visitor */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button
              type="button"
              className="truncate text-left text-base font-semibold tracking-tight group-hover:underline"
              onClick={(event) => {
                event.stopPropagation();
                onOpen();
              }}
            >
              {guest.guestName}
            </button>
            {tab === "gone" ? <StatusBadge status={guest.status} /> : null}
            {guest.notes ? (
              <span className="text-expected" title={`Note from floor: ${guest.notes}`}>
                <NoteIcon className="size-4" />
              </span>
            ) : null}
            {guest.deskNote ? (
              <span className="text-arrived" title={`Desk note: ${guest.deskNote}`}>
                <PencilIcon className="size-3.5" />
              </span>
            ) : null}
          </div>
          {guest.company ? <p className="truncate text-sm text-muted">{guest.company}</p> : null}
          {hasCar(guest) ? <CarLine guest={guest} /> : null}
          {/* Host + floor inline on small screens */}
          <p className="truncate text-sm text-muted lg:hidden">
            Visiting <span className="font-medium text-ink-soft">{guest.hostName}</span> · {guest.floorName}
            {guest.floorCompany ? ` · ${guest.floorCompany}` : ""}
          </p>
        </div>

        {/* Host */}
        <div className="hidden min-w-0 lg:block">
          <p className="truncate font-medium">{guest.hostName}</p>
          {!guest.hostHasAccount ? <p className="truncate text-xs text-muted">Not on Arrival Desk</p> : null}
        </div>

        {/* Floor */}
        <div className="hidden min-w-0 lg:block">
          <span className="inline-flex items-center gap-1.5 truncate text-sm">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-ink font-mono text-[11px] text-white">
              {guest.floorNumber}
            </span>
            <span className="min-w-0">
              <span className="block truncate">{guest.floorName}</span>
              {guest.floorCompany ? <span className="block truncate text-xs text-muted">{guest.floorCompany}</span> : null}
            </span>
          </span>
        </div>

        {/* Action / result */}
        <div className="col-span-2 flex items-center justify-end gap-2 pl-[5.5rem] lg:col-span-1 lg:pl-0" onClick={(e) => e.stopPropagation()}>
          {tab === "expected" ? (
            <button type="button" className="btn btn-go h-11 w-full px-5 text-[15px] lg:w-auto lg:min-w-36" disabled={pending} onClick={onCheckIn}>
              <CheckIcon className="size-4" />
              {pending ? "Saving…" : "Arrived"}
            </button>
          ) : tab === "in" ? (
            <div className="text-right">
              <p className="text-sm font-semibold text-cleared">
                {guest.checkedInLabel ? `Checked in ${guest.checkedInLabel}` : "Checked in"}
              </p>
              <HostAlert guest={guest} compact />
            </div>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onOpen}>
              Details
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function CarLine({ guest }: { guest: BoardGuest }) {
  return (
    <p className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted">
      <CarIcon className="size-4 shrink-0 text-ink-soft" />
      {guest.licensePlate ? <PlateTag plate={guest.licensePlate} /> : null}
      {guest.vehicle ? <span className="truncate">{guest.vehicle}</span> : null}
      <span className="truncate">· park for {guest.floorCompany ?? guest.floorName}</span>
    </p>
  );
}

/* ---------------- Host alert status ---------------- */

const ALERT_LABEL: Record<string, string> = {
  push: "Host alerted on device",
  email: "Host emailed",
  "push+email": "Host alerted on device and by email",
  none: "Host has no alerts. Call them",
};

function HostAlert({ guest, compact = false }: { guest: BoardGuest; compact?: boolean }) {
  if (tabOf(guest.status) !== "in") return null;
  const base = compact ? "text-xs" : "text-sm";
  const others = guest.alsoNotify.length;
  const plus = others ? ` + ${others} other${others === 1 ? "" : "s"}` : "";
  if (!guest.hostHasAccount) {
    return (
      <p className={`${base} font-medium text-expected`}>
        Host not on Arrival Desk. Let them know{others ? ` (alerting ${others} colleague${others === 1 ? "" : "s"})` : ""}
      </p>
    );
  }
  if (!guest.hostNotifiedVia) return <p className={`${base} text-muted`}>Alerting host{plus}…</p>;
  const ok = guest.hostNotifiedVia !== "none";
  return (
    <p className={`${base} inline-flex items-center gap-1 font-medium ${ok ? "text-muted" : "text-expected"}`}>
      {ok ? <CheckIcon className="size-3.5 text-cleared" /> : null}
      {ALERT_LABEL[guest.hostNotifiedVia] ?? "Host alerted"}
      {plus}
    </p>
  );
}

const PERSON_ALERT: Record<string, string> = {
  push: "alerted on device",
  email: "emailed",
  "push+email": "alerted on device and by email",
  none: "no alerts set up",
};

/* ---------------- Details panel ---------------- */

function VisitorPanel({
  guest,
  late,
  pending,
  onClose,
  onCheckIn,
  onStatus,
  onSaved,
}: {
  guest: BoardGuest;
  late: boolean;
  pending: boolean;
  onClose: () => void;
  onCheckIn: () => void;
  onStatus: (next: GuestStatus) => void;
  onSaved: (message: string) => void;
}) {
  const tab = tabOf(guest.status);

  const timeline: { label: string; detail: string | null; done: boolean }[] = [
    {
      label: "Added to the list",
      detail: `${guest.createdLabel}${guest.createdByName ? ` by ${guest.createdByName}` : ""}`,
      done: true,
    },
    {
      label: "Checked in",
      detail: guest.checkedInLabel
        ? `${guest.checkedInLabel}${guest.arrivedByName ? ` by ${guest.arrivedByName}` : ""}`
        : null,
      done: Boolean(guest.checkedInLabel) && tab === "in",
    },
    {
      label: "Host alerted",
      detail:
        guest.notifiedLabel && guest.hostNotifiedVia
          ? `${guest.notifiedLabel} · ${ALERT_LABEL[guest.hostNotifiedVia] ?? guest.hostNotifiedVia}`
          : guest.hostHasAccount
            ? null
            : "Host isn't on Arrival Desk",
      done: Boolean(guest.notifiedLabel) && guest.hostNotifiedVia !== "none",
    },
  ];

  return (
    <Drawer
      onClose={onClose}
      title={
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{guest.guestName}</h2>
            <StatusBadge status={guest.status} />
            {late ? <span className="badge bg-signal-soft text-signal-deep">Late</span> : null}
          </div>
          {guest.company ? <p className="mt-0.5 text-sm text-muted">{guest.company}</p> : null}
        </div>
      }
      footer={
        tab === "expected" ? (
          <>
            <button type="button" className="btn btn-go btn-lg flex-1" disabled={pending} onClick={onCheckIn}>
              <CheckIcon className="size-5" />
              {pending ? "Saving…" : "Arrived"}
            </button>
            <button type="button" className="btn btn-ghost btn-lg" disabled={pending} onClick={() => onStatus("NO_SHOW")}>
              No-show
            </button>
          </>
        ) : tab === "in" ? (
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => onStatus("EXPECTED")}>
            <UndoIcon className="size-4" />
            Undo check-in
          </button>
        ) : (
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => onStatus("EXPECTED")}>
            <UndoIcon className="size-4" />
            Move back to expected
          </button>
        )
      }
    >
      <div className="grid gap-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs font-semibold text-muted">Expected</dt>
            <dd className="mt-0.5 font-medium">{guest.expectedLabel ?? "Any time"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted">Floor</dt>
            <dd className="mt-0.5 font-medium">
              {guest.floorName}
              {guest.floorCompany ? <span className="block text-sm font-normal text-muted">{guest.floorCompany}</span> : null}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs font-semibold text-muted">Visiting</dt>
            <dd className="mt-0.5 font-medium">
              {guest.hostName}
              {!guest.hostHasAccount ? <span className="font-normal text-muted"> · not on Arrival Desk</span> : null}
            </dd>
          </div>
        </dl>

        {hasCar(guest) ? (
          <div className="rounded-xl border border-line bg-panel-2 px-3.5 py-3 text-sm">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide text-muted uppercase">
              <CarIcon className="size-4" />
              Coming by car
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {guest.licensePlate ? <PlateTag plate={guest.licensePlate} large /> : <span className="text-muted">No plate given</span>}
              {guest.vehicle ? <span className="font-medium">{guest.vehicle}</span> : null}
            </div>
            <p className="mt-2 text-xs text-muted">
              Parking for <span className="font-semibold text-ink-soft">{guest.floorCompany ?? guest.floorName}</span>
              {guest.floorCompany ? ` (${guest.floorName})` : ""}
            </p>
          </div>
        ) : null}

        {guest.notes ? (
          <div className="rounded-xl bg-expected-soft px-3.5 py-2.5 text-sm text-expected">
            <p className="mb-0.5 flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase">
              <NoteIcon className="size-3.5" />
              Note from the floor
            </p>
            <p className="break-words">{guest.notes}</p>
          </div>
        ) : null}

        <section>
          <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">Timeline</h3>
          <ol className="relative grid gap-3 border-l-2 border-line pl-4">
            {timeline.map((step) => (
              <li key={step.label} className="relative">
                <span
                  className={`absolute top-1 -left-[23px] flex size-3 rounded-full ring-4 ring-panel ${
                    step.done ? "bg-cleared" : "bg-line-strong"
                  }`}
                />
                <p className={`text-sm font-semibold ${step.done ? "" : "text-muted"}`}>{step.label}</p>
                <p className="text-xs text-muted">{step.detail ?? "Not yet"}</p>
              </li>
            ))}
          </ol>
        </section>

        {guest.alsoNotify.length ? (
          <section>
            <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">Also notified on arrival</h3>
            <ul className="grid gap-1.5 text-sm">
              {guest.alsoNotify.map((person) => (
                <li key={person.name} className="flex items-center justify-between gap-3">
                  <span className="font-medium">{person.name}</span>
                  <span className={`text-xs ${person.notifiedVia === "none" ? "text-expected" : "text-muted"}`}>
                    {tab === "in" ? (person.notifiedVia ? PERSON_ALERT[person.notifiedVia] ?? person.notifiedVia : "alerting…") : "on arrival"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <DeskNote guest={guest} onSaved={onSaved} />
      </div>
    </Drawer>
  );
}

function DeskNote({ guest, onSaved }: { guest: BoardGuest; onSaved: (message: string) => void }) {
  const router = useRouter();
  const [value, setValue] = useState(guest.deskNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = value.trim() !== (guest.deskNote ?? "");

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setDeskNote(guest.id, value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onSaved(value.trim() ? "Desk note saved" : "Desk note removed");
    });
  }

  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-xs font-bold tracking-wide text-muted uppercase">Desk note</h3>
        <span className="text-[11px] text-muted">Only reception and admins see this</span>
      </div>
      <textarea
        className="field min-h-20"
        value={value}
        maxLength={500}
        placeholder="e.g. ID checked, waiting in the café, left an umbrella"
        onChange={(event) => setValue(event.target.value)}
      />
      {error ? <p className="mt-1 text-sm font-medium text-danger">{error}</p> : null}
      {dirty ? (
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setValue(guest.deskNote ?? "")}>
            <XIcon className="size-3.5" />
            Discard
          </button>
          <button type="button" className="btn btn-dark btn-sm" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save note"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
