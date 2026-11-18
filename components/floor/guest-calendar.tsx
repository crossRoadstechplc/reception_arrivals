"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { timeOfDayMinutes } from "@/lib/dates";
import { FLOOR_ROLE_LABEL, type FloorRole } from "@/lib/types";
import { GuestForm } from "@/components/floor/guest-form";
import type { FloorGuest, HostOption } from "@/components/floor/guest-manager";
import { EmptyState, MissedBadge, Modal, PlateTag, StatusBadge, Toast, useToast } from "@/components/ui";
import { LiveIndicator, useBackToToday, useLiveRefresh } from "@/components/use-live-refresh";
import { RefreshButton } from "@/components/refresh-button";
import { PushPrompt } from "@/components/push-prompt";
import { BuildingIcon, CarIcon, CheckIcon, ChevronLeft, ChevronRight, NoteIcon, PencilIcon, PlusIcon } from "@/components/icons";

export type CalendarView = "day" | "week";

type Day = { iso: string; label: string; weekday: string; day: number; month: string; year: number };
type FloorOption = { id: string; name: string; number: number; role: FloorRole };
type Kind = "exp" | "late" | "in" | "gone";

/** Pixels per hour on the time grid. */
const HOUR = 64;
/** A block is this tall; guests only have an arrival time, so every block is the same size. */
const BLOCK = 52;
const BLOCK_MINUTES = (BLOCK / HOUR) * 60;

const KIND_STYLE: Record<Kind, string> = {
  exp: "border-expected/25 bg-expected-soft text-ink hover:border-expected/50",
  late: "border-signal/30 bg-signal-soft text-ink hover:border-signal/60",
  in: "border-cleared/25 bg-cleared-soft text-[#2c5a41] hover:border-cleared/50",
  gone: "border-line-strong/70 bg-idle-soft text-idle hover:border-line-strong",
};
const STRUCK = "line-through decoration-[1.5px]";

function shift(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function hourLabel(hour: number) {
  return `${hour % 12 || 12} ${hour < 12 || hour === 24 ? "AM" : "PM"}`;
}

function nowLabel(minutes: number) {
  const h = Math.floor(minutes / 60);
  return `${h % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Side-by-side lanes for guests whose blocks would overlap. */
function layoutLanes(guests: FloorGuest[]) {
  const timed = guests
    .map((g) => ({ id: g.id, start: timeOfDayMinutes(g.expectedArrival) ?? 0 }))
    .sort((a, b) => a.start - b.start);
  const result = new Map<string, { lane: number; lanes: number }>();
  let cluster: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const close = () => {
    for (const item of cluster) result.set(item.id, { lane: item.lane, lanes: laneEnds.length });
    cluster = [];
    laneEnds = [];
  };
  for (const item of timed) {
    if (item.start >= clusterEnd) close();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) lane = laneEnds.push(0) - 1;
    laneEnds[lane] = item.start + BLOCK_MINUTES;
    cluster.push({ id: item.id, lane });
    clusterEnd = Math.max(clusterEnd, item.start + BLOCK_MINUTES);
  }
  close();
  return result;
}

export function GuestCalendar({
  view,
  date,
  today,
  rangeLabel,
  days,
  officeMinutes,
  floors,
  floorId,
  myRole,
  currentUserId,
  hosts,
  people,
  guests,
}: {
  view: CalendarView;
  date: string;
  today: string;
  /** Made on the server so every device shows the same text. */
  rangeLabel: string;
  days: Day[];
  /** Office time (minutes since midnight) when the server built the page. */
  officeMinutes: number;
  floors: FloorOption[];
  floorId: string | null;
  myRole: FloorRole | null;
  currentUserId: string;
  hosts: HostOption[];
  people: HostOption[];
  guests: FloorGuest[];
}) {
  const router = useRouter();
  const live = useLiveRefresh();
  useBackToToday(date, today, () => visit({ date: today }));
  const { toast, show, dismiss } = useToast();
  const [open, setOpen] = useState<FloorGuest | null>(null);
  const [editing, setEditing] = useState<FloorGuest | "new" | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState({ base: officeMinutes, minutes: 0 });

  const floor = floors.find((f) => f.id === floorId);
  const isAdmin = myRole === "ADMIN";

  // Office time for the "now" line and "Late": the server's time plus how long
  // the page has been open, so a wrong device clock can't move it.
  useEffect(() => {
    const started = performance.now();
    const timer = window.setInterval(() => {
      setElapsed({ base: officeMinutes, minutes: Math.floor((performance.now() - started) / 60_000) });
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [officeMinutes]);
  const nowMinutes = officeMinutes + (elapsed.base === officeMinutes ? elapsed.minutes : 0);

  const byDay = useMemo(() => {
    const map = new Map<string, FloorGuest[]>();
    for (const day of days) map.set(day.iso, []);
    for (const guest of guests) map.get(guest.visitDate)?.push(guest);
    return map;
  }, [days, guests]);

  // Hours shown: 8 AM to 6 PM, stretched to fit anyone earlier or later.
  const [startHour, endHour] = useMemo(() => {
    let first = 8;
    let last = 18;
    for (const guest of guests) {
      const minutes = timeOfDayMinutes(guest.expectedArrival);
      if (minutes === null) continue;
      first = Math.min(first, Math.floor(minutes / 60));
      last = Math.max(last, Math.min(24, Math.ceil((minutes + BLOCK_MINUTES) / 60)));
    }
    return [first, last];
  }, [guests]);

  function kindOf(guest: FloorGuest): Kind {
    if (guest.status === "ARRIVED" || guest.status === "CLEARED") return "in";
    if (guest.status === "CANCELLED" || guest.status === "NO_SHOW") return "gone";
    if (guest.visitDate < today) return "gone"; // their day passed without checking in
    const expected = timeOfDayMinutes(guest.expectedArrival);
    return guest.visitDate === today && expected !== null && expected < nowMinutes ? "late" : "exp";
  }

  function visit(next: { date?: string; view?: CalendarView; floorId?: string }) {
    const params = new URLSearchParams();
    const nextDate = next.date ?? date;
    if (nextDate !== today) params.set("date", nextDate);
    const nextView = next.view ?? view;
    if (nextView === "day") params.set("view", "day");
    const nextFloor = next.floorId ?? floorId;
    if (nextFloor && floors.length > 1) params.set("floor", nextFloor);
    const qs = params.toString();
    setOpen(null);
    router.push(qs ? `/floor/calendar?${qs}` : "/floor/calendar");
  }

  // The day shown on phones in week view (and the default date for "Add guest").
  const focusDay =
    picked && byDay.has(picked) ? picked : byDay.has(date) ? date : byDay.has(today) ? today : days[0]?.iso;
  const addDate = focusDay && focusDay >= today ? focusDay : today;

  const heading = isAdmin ? (floor?.name ?? "Calendar") : `My guests${floor ? ` · ${floor.name}` : ""}`;
  const helpers = { kindOf, onOpen: setOpen };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-5 md:px-5">
      {/* Title row */}
      <section className="flex flex-wrap items-end gap-3">
        <div className="mr-auto min-w-0">
          <p className="text-xs font-semibold tracking-[0.14em] text-signal uppercase">Calendar</p>
          <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-tight md:text-[1.75rem]">{heading}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LiveIndicator live={live} />
          <RefreshButton />
          {floors.length > 1 ? (
            <select
              aria-label="Floor"
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
          ) : null}
        </div>
      </section>

      {!floorId ? (
        <EmptyState
          icon={<BuildingIcon className="size-6" />}
          title="You're not on a floor yet"
          body="Ask a super admin to add you to your floor."
        />
      ) : (
        <>
          <PushPrompt />

          {/* Controls */}
          <section className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-line-strong bg-panel p-0.5" role="radiogroup" aria-label="View">
              {(["day", "week"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={view === v}
                  onClick={() => visit({ view: v, date: v === "day" && focusDay ? focusDay : date })}
                  className={`h-9 rounded-[10px] px-4 text-sm font-semibold capitalize transition-colors ${
                    view === v ? "bg-ink text-white" : "text-muted hover:text-ink"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn btn-secondary size-10 p-0"
                aria-label={view === "day" ? "Previous day" : "Previous week"}
                onClick={() => visit({ date: shift(date, view === "day" ? -1 : -7) })}
              >
                <ChevronLeft className="size-4" />
              </button>
              <button type="button" className="btn btn-secondary h-10" disabled={date === today} onClick={() => visit({ date: today })}>
                Today
              </button>
              <button
                type="button"
                className="btn btn-secondary size-10 p-0"
                aria-label={view === "day" ? "Next day" : "Next week"}
                onClick={() => visit({ date: shift(date, view === "day" ? 1 : 7) })}
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            <span className="text-[15px] font-semibold">{rangeLabel}</span>
            <button type="button" className="btn btn-primary ml-auto" onClick={() => setEditing("new")}>
              <PlusIcon className="size-4" />
              Add guest
            </button>
          </section>

          <Legend />

          {/* Desktop: time grid */}
          <div className="hidden md:block">
            {view === "week" ? (
              <WeekGrid
                days={days}
                byDay={byDay}
                today={today}
                startHour={startHour}
                endHour={endHour}
                nowMinutes={nowMinutes}
                showHost={isAdmin}
                onPickDay={(iso) => visit({ view: "day", date: iso })}
                {...helpers}
              />
            ) : (
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <DayGrid
                    day={days[0]}
                    guests={byDay.get(days[0].iso) ?? []}
                    isToday={days[0].iso === today}
                    startHour={startHour}
                    endHour={endHour}
                    nowMinutes={nowMinutes}
                    showHost={isAdmin}
                    {...helpers}
                  />
                </div>
                <DaySummary guests={byDay.get(days[0].iso) ?? []} {...helpers} />
              </div>
            )}
          </div>

          {/* Phones: day strip + list */}
          <div className="flex flex-col gap-3 md:hidden">
            {view === "week" ? (
              <div className="flex gap-1.5">
                {days.map((day) => {
                  const on = day.iso === focusDay;
                  const count = byDay.get(day.iso)?.length ?? 0;
                  return (
                    <button
                      key={day.iso}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPicked(day.iso)}
                      className={`flex h-16 min-w-0 flex-1 flex-col items-center justify-center rounded-xl border transition-colors ${
                        on ? "border-ink bg-ink text-white" : day.iso === today ? "border-signal/40 bg-signal-soft" : "border-line bg-panel"
                      }`}
                    >
                      <span className="text-[11px] font-semibold tracking-wider uppercase opacity-75">{day.weekday}</span>
                      <span className="text-lg leading-tight font-semibold">{day.day}</span>
                      <span className="text-[10.5px] opacity-75">{count === 0 ? "—" : `${count} guest${count === 1 ? "" : "s"}`}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            {focusDay ? (
              <AgendaList
                guests={byDay.get(focusDay) ?? []}
                isToday={focusDay === today}
                nowMinutes={nowMinutes}
                showHost={isAdmin}
                {...helpers}
              />
            ) : null}
          </div>
        </>
      )}

      {open ? (
        <GuestDetails
          guest={open}
          kind={kindOf(open)}
          showHost={isAdmin}
          onClose={() => setOpen(null)}
          onEdit={() => {
            setEditing(open);
            setOpen(null);
          }}
        />
      ) : null}

      {editing && floorId ? (
        <GuestForm
          date={editing === "new" ? addDate : editing.visitDate}
          floorId={floorId}
          floorName={floor?.name ?? ""}
          today={today}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          hosts={hosts}
          people={people}
          guest={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(name, isNew) => show({ message: isNew ? `${name} added` : `${name} updated` })}
        />
      ) : null}

      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}

/* ---------------- Pieces ---------------- */

type Helpers = { kindOf: (guest: FloorGuest) => Kind; onOpen: (guest: FloorGuest) => void };

function Legend() {
  const items: { label: string; className: string; struck?: boolean }[] = [
    { label: "Expected", className: KIND_STYLE.exp },
    { label: "Late", className: KIND_STYLE.late },
    { label: "Arrived", className: KIND_STYLE.in, struck: true },
    { label: "Cancelled / no-show / missed", className: KIND_STYLE.gone, struck: true },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-2">
          <span className={`h-3.5 w-5 rounded border ${item.className}`} />
          <span className={item.struck ? "line-through" : ""}>{item.label}</span>
        </span>
      ))}
      <span className="ml-auto hidden lg:inline">Blocks show the expected arrival time. Click one for details.</span>
    </div>
  );
}

function StatusLine({ guest, kind, long = false }: { guest: FloorGuest; kind: Kind; long?: boolean }) {
  if (kind === "in") {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-cleared">
        <CheckIcon className="size-3.5" />
        {long ? "Arrived " : ""}
        {guest.checkedInLabel ?? ""}
      </span>
    );
  }
  if (kind === "gone") return <span className="font-semibold">{guest.status === "EXPECTED" ? "Missed" : guest.status === "NO_SHOW" ? "No-show" : "Cancelled"}</span>;
  if (kind === "late") return <span className="font-bold tracking-wide text-signal-deep">{long ? "LATE · not checked in yet" : "LATE"}</span>;
  return long ? <span className="font-semibold text-expected">Expected</span> : null;
}

function hasCar(guest: FloorGuest) {
  return Boolean(guest.licensePlate || guest.vehicle);
}

function HourGutter({ startHour, endHour }: { startHour: number; endHour: number }) {
  return (
    <div className="relative w-16 shrink-0" style={{ height: (endHour - startHour) * HOUR }}>
      {Array.from({ length: endHour - startHour + 1 }, (_, i) => (
        <span key={i} className="absolute right-2.5 -translate-y-1/2 font-mono text-[11px] text-muted" style={{ top: i * HOUR }}>
          {hourLabel(startHour + i)}
        </span>
      ))}
    </div>
  );
}

function HourLines({ startHour, endHour }: { startHour: number; endHour: number }) {
  return (
    <>
      {Array.from({ length: endHour - startHour + 1 }, (_, i) => (
        <div key={i} className="pointer-events-none absolute inset-x-0 border-t border-line" style={{ top: i * HOUR }}>
          {i < endHour - startHour ? (
            <div className="absolute inset-x-0 border-t border-dashed border-line/60" style={{ top: HOUR / 2 }} />
          ) : null}
        </div>
      ))}
    </>
  );
}

function NowLine({ minutes, startHour, endHour }: { minutes: number; startHour: number; endHour: number }) {
  if (minutes < startHour * 60 || minutes > endHour * 60) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-signal"
      style={{ top: ((minutes - startHour * 60) / 60) * HOUR }}
      title={`Now · ${nowLabel(minutes)}`}
    >
      <span className="absolute -top-1 -left-1 size-2.5 rounded-full bg-signal" />
    </div>
  );
}

function AnyTimeChip({ guest, kind, onOpen }: { guest: FloorGuest; kind: Kind; onOpen: (g: FloorGuest) => void }) {
  const struck = kind === "in" || kind === "gone";
  return (
    <button
      type="button"
      onClick={() => onOpen(guest)}
      className={`flex w-full min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-left text-[12.5px] font-semibold transition-colors ${KIND_STYLE[kind]}`}
    >
      {kind === "in" ? <CheckIcon className="size-3.5 shrink-0 text-cleared" /> : null}
      <span className={`truncate ${struck ? STRUCK : ""}`}>{guest.guestName}</span>
    </button>
  );
}

function TimedBlock({
  guest,
  kind,
  top,
  lane,
  lanes,
  detailed,
  showHost,
  onOpen,
}: {
  guest: FloorGuest;
  kind: Kind;
  top: number;
  lane: number;
  lanes: number;
  detailed: boolean;
  showHost: boolean;
  onOpen: (g: FloorGuest) => void;
}) {
  const struck = kind === "in" || kind === "gone" ? STRUCK : "";
  const width = 100 / lanes;
  const sub = [guest.company, showHost ? (detailed ? `Host: ${guest.hostName}` : guest.hostName) : null].filter(Boolean).join(" · ");
  const roomy = detailed && lanes === 1;

  return (
    <button
      type="button"
      onClick={() => onOpen(guest)}
      className={`absolute z-[1] flex overflow-hidden rounded-lg border text-left transition-colors focus-visible:z-20 ${KIND_STYLE[kind]} ${
        roomy ? "items-center gap-4 px-3" : "flex-col gap-px px-2 py-1"
      }`}
      style={{ top: top + 2, height: BLOCK - 4, left: `calc(${lane * width}% + 3px)`, width: `calc(${width}% - 6px)` }}
      title={`${guest.expectedLabel ?? ""} · ${guest.guestName}`}
    >
      {roomy ? (
        <>
          <span className="w-[4.5rem] shrink-0 font-mono text-[13px] font-semibold text-muted">{guest.expectedLabel}</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={`truncate text-[15px] font-semibold ${struck}`}>{guest.guestName}</span>
            {sub ? <span className={`truncate text-[12.5px] text-muted ${struck}`}>{sub}</span> : null}
          </span>
          {hasCar(guest) ? (
            <span className="hidden shrink-0 items-center gap-1.5 text-xs text-muted lg:inline-flex">
              <CarIcon className="size-4" />
              {guest.licensePlate ? <PlateTag plate={guest.licensePlate} /> : null}
              {guest.vehicle ? <span className="max-w-40 truncate">{guest.vehicle}</span> : null}
            </span>
          ) : null}
          <span className="shrink-0 text-[12.5px]">
            <StatusLine guest={guest} kind={kind} long />
          </span>
        </>
      ) : (
        <>
          <span className="flex w-full items-center gap-1.5 font-mono text-[11px] text-muted">
            <span className="truncate">{guest.expectedLabel}</span>
            <StatusLine guest={guest} kind={kind} />
            {hasCar(guest) ? <CarIcon className="ml-auto size-3.5 shrink-0" /> : null}
          </span>
          <span className={`w-full truncate text-[13.5px] font-semibold ${struck}`}>{guest.guestName}</span>
          {sub && lanes < 3 ? <span className={`w-full truncate text-[11.5px] text-muted ${struck}`}>{sub}</span> : null}
        </>
      )}
    </button>
  );
}

function DayColumn({
  guests,
  isToday,
  startHour,
  endHour,
  nowMinutes,
  detailed,
  showHost,
  kindOf,
  onOpen,
}: {
  guests: FloorGuest[];
  isToday: boolean;
  startHour: number;
  endHour: number;
  nowMinutes: number;
  detailed: boolean;
  showHost: boolean;
} & Helpers) {
  const timed = guests.filter((g) => timeOfDayMinutes(g.expectedArrival) !== null);
  const lanes = layoutLanes(timed);
  return (
    <div className={`relative min-w-0 flex-1 border-l border-line ${isToday ? "bg-signal-soft/30" : ""}`} style={{ height: (endHour - startHour) * HOUR }}>
      <HourLines startHour={startHour} endHour={endHour} />
      {isToday ? <NowLine minutes={nowMinutes} startHour={startHour} endHour={endHour} /> : null}
      {timed.map((guest) => {
        const minutes = timeOfDayMinutes(guest.expectedArrival)!;
        const place = lanes.get(guest.id) ?? { lane: 0, lanes: 1 };
        return (
          <TimedBlock
            key={guest.id}
            guest={guest}
            kind={kindOf(guest)}
            top={((minutes - startHour * 60) / 60) * HOUR}
            lane={place.lane}
            lanes={place.lanes}
            detailed={detailed}
            showHost={showHost}
            onOpen={onOpen}
          />
        );
      })}
    </div>
  );
}

function WeekGrid({
  days,
  byDay,
  today,
  startHour,
  endHour,
  nowMinutes,
  showHost,
  onPickDay,
  kindOf,
  onOpen,
}: {
  days: Day[];
  byDay: Map<string, FloorGuest[]>;
  today: string;
  startHour: number;
  endHour: number;
  nowMinutes: number;
  showHost: boolean;
  onPickDay: (iso: string) => void;
} & Helpers) {
  const anyTime = days.map((day) => (byDay.get(day.iso) ?? []).filter((g) => !g.expectedArrival));
  const hasAnyTime = anyTime.some((list) => list.length > 0);

  return (
    <div className="card overflow-hidden">
      <div className="flex border-b border-line bg-panel-2">
        <div className="w-16 shrink-0" />
        {days.map((day) => {
          const list = byDay.get(day.iso) ?? [];
          const arrived = list.filter((g) => kindOf(g) === "in").length;
          const isToday = day.iso === today;
          return (
            <button
              key={day.iso}
              type="button"
              onClick={() => onPickDay(day.iso)}
              title={`Open ${day.label}`}
              className={`min-w-0 flex-1 border-l border-line px-3 py-2.5 text-left transition-colors hover:bg-idle-soft/60 ${
                isToday ? "bg-signal-soft" : ""
              }`}
            >
              <span className="flex items-baseline gap-2">
                <span className={`text-xs font-semibold tracking-wider uppercase ${isToday ? "text-signal-deep" : "text-muted"}`}>
                  {day.weekday}
                </span>
                <span className={`text-[22px] leading-tight font-semibold ${isToday ? "text-signal-deep" : ""}`}>{day.day}</span>
              </span>
              <span className="block truncate text-xs text-muted">
                {list.length === 0 ? "No guests" : `${list.length} guest${list.length === 1 ? "" : "s"}`}
                {arrived ? ` · ${arrived} arrived` : ""}
              </span>
            </button>
          );
        })}
      </div>

      {hasAnyTime ? (
        <div className="flex border-b border-line">
          <div className="flex w-16 shrink-0 items-center justify-end pr-2.5 text-right font-mono text-[10.5px] leading-tight text-muted">
            ANY
            <br />
            TIME
          </div>
          {days.map((day, i) => (
            <div key={day.iso} className={`flex min-w-0 flex-1 flex-col gap-1 border-l border-line p-1.5 ${day.iso === today ? "bg-signal-soft/30" : ""}`}>
              {anyTime[i].map((guest) => (
                <AnyTimeChip key={guest.id} guest={guest} kind={kindOf(guest)} onOpen={onOpen} />
              ))}
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex pt-3 pb-2.5">
        <HourGutter startHour={startHour} endHour={endHour} />
        <div className="flex min-w-0 flex-1 pr-px">
          {days.map((day) => (
            <DayColumn
              key={day.iso}
              guests={byDay.get(day.iso) ?? []}
              isToday={day.iso === today}
              startHour={startHour}
              endHour={endHour}
              nowMinutes={nowMinutes}
              detailed={false}
              showHost={showHost}
              kindOf={kindOf}
              onOpen={onOpen}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DayGrid({
  day,
  guests,
  isToday,
  startHour,
  endHour,
  nowMinutes,
  showHost,
  kindOf,
  onOpen,
}: {
  day: Day;
  guests: FloorGuest[];
  isToday: boolean;
  startHour: number;
  endHour: number;
  nowMinutes: number;
  showHost: boolean;
} & Helpers) {
  const anyTime = guests.filter((g) => !g.expectedArrival);
  return (
    <div className="card overflow-hidden" aria-label={day.label}>
      {anyTime.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel-2 px-3.5 py-2.5">
          <span className="font-mono text-[10.5px] text-muted">ANY TIME</span>
          {anyTime.map((guest) => (
            <span key={guest.id} className="w-auto max-w-64">
              <AnyTimeChip guest={guest} kind={kindOf(guest)} onOpen={onOpen} />
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex pt-3 pb-2.5 pr-3">
        <HourGutter startHour={startHour} endHour={endHour} />
        <DayColumn
          guests={guests}
          isToday={isToday}
          startHour={startHour}
          endHour={endHour}
          nowMinutes={nowMinutes}
          detailed
          showHost={showHost}
          kindOf={kindOf}
          onOpen={onOpen}
        />
      </div>
    </div>
  );
}

function DaySummary({ guests, kindOf, onOpen }: { guests: FloorGuest[] } & Helpers) {
  const toCome = guests.filter((g) => ["exp", "late"].includes(kindOf(g)));
  const here = guests.filter((g) => kindOf(g) === "in");
  const gone = guests.filter((g) => kindOf(g) === "gone");

  return (
    <aside className="hidden w-72 shrink-0 flex-col gap-3 lg:flex">
      <div className="card p-4">
        <h2 className="mb-3 text-[15px] font-semibold">This day</h2>
        <div className="grid grid-cols-3 gap-2">
          {[
            { n: toCome.length, label: "to come", cls: "bg-expected-soft text-expected" },
            { n: here.length, label: "arrived", cls: "bg-cleared-soft text-cleared" },
            { n: gone.length, label: "not coming", cls: "bg-idle-soft text-idle" },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl px-3 py-2.5 ${s.cls}`}>
              <div className="text-2xl font-semibold">{s.n}</div>
              <div className="text-xs text-muted">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
      <SummaryList title="Still to come" empty="Nobody left to come." guests={toCome} kindOf={kindOf} onOpen={onOpen} />
      <SummaryList title="Already here" empty="Nobody has arrived yet." guests={here} kindOf={kindOf} onOpen={onOpen} />
    </aside>
  );
}

function SummaryList({ title, empty, guests, kindOf, onOpen }: { title: string; empty: string; guests: FloorGuest[] } & Helpers) {
  return (
    <div className="card p-4">
      <h2 className="mb-1 text-[15px] font-semibold">{title}</h2>
      {guests.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul>
          {guests.map((guest) => {
            const kind = kindOf(guest);
            return (
              <li key={guest.id} className="border-t border-line first:border-t-0">
                <button type="button" onClick={() => onOpen(guest)} className="flex w-full items-start gap-3 py-2 text-left hover:opacity-80">
                  <span className={`w-[4.25rem] shrink-0 pt-px font-mono text-[12.5px] ${kind === "late" ? "font-semibold text-signal-deep" : "text-muted"}`}>
                    {kind === "in" ? guest.checkedInLabel : (guest.expectedLabel ?? "Any time")}
                  </span>
                  <span className="min-w-0">
                    <span className={`block truncate text-sm font-semibold ${kind === "in" ? `${STRUCK} text-muted` : ""}`}>{guest.guestName}</span>
                    {guest.company ? <span className="block truncate text-xs text-muted">{guest.company}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AgendaList({
  guests,
  isToday,
  nowMinutes,
  showHost,
  kindOf,
  onOpen,
}: {
  guests: FloorGuest[];
  isToday: boolean;
  nowMinutes: number;
  showHost: boolean;
} & Helpers) {
  if (guests.length === 0) {
    return <EmptyState title="No guests this day" body="Tap “Add guest” to put someone on the list." />;
  }
  const timed = guests.filter((g) => g.expectedArrival);
  const anyTime = guests.filter((g) => !g.expectedArrival);
  // Where the "now" line goes: before the first guest expected after now.
  const nowIndex = isToday ? timed.findIndex((g) => (timeOfDayMinutes(g.expectedArrival) ?? 0) > nowMinutes) : -1;
  const ordered: (FloorGuest | "now")[] = [...anyTime];
  timed.forEach((guest, i) => {
    if (i === nowIndex) ordered.push("now");
    ordered.push(guest);
  });
  if (isToday && nowIndex === -1 && timed.length > 0) ordered.push("now");

  return (
    <ul className="flex flex-col gap-2">
      {ordered.map((item) =>
        item === "now" ? (
          <li key="now" className="flex items-center gap-2" aria-label={`Now, ${nowLabel(nowMinutes)}`}>
            <span className="font-mono text-[11px] font-semibold text-signal">{nowLabel(nowMinutes)}</span>
            <span className="h-0.5 flex-1 rounded bg-signal" />
          </li>
        ) : (
          <li key={item.id}>
            <AgendaRow guest={item} kind={kindOf(item)} showHost={showHost} onOpen={onOpen} />
          </li>
        ),
      )}
    </ul>
  );
}

function AgendaRow({ guest, kind, showHost, onOpen }: { guest: FloorGuest; kind: Kind; showHost: boolean; onOpen: (g: FloorGuest) => void }) {
  const struck = kind === "in" || kind === "gone" ? STRUCK : "";
  const sub = [guest.company, showHost ? guest.hostName : null].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={() => onOpen(guest)}
      className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${KIND_STYLE[kind]}`}
    >
      <span className="w-16 shrink-0 font-mono text-xs text-muted">{guest.expectedLabel ?? "Any time"}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate text-[15px] font-semibold ${struck}`}>{guest.guestName}</span>
        {sub ? <span className={`truncate text-[12.5px] text-muted ${struck}`}>{sub}</span> : null}
      </span>
      {hasCar(guest) ? <CarIcon className="size-4 shrink-0 text-muted" /> : null}
      <span className="shrink-0 text-xs">
        <StatusLine guest={guest} kind={kind} />
      </span>
    </button>
  );
}

function GuestDetails({
  guest,
  kind,
  showHost,
  onClose,
  onEdit,
}: {
  guest: FloorGuest;
  kind: Kind;
  showHost: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  // Same rule as the guest list: once reception has checked them in, or the visit is off, it can't be edited.
  const editable = guest.canEdit && (guest.status === "EXPECTED" || guest.status === "ARRIVED");
  return (
    <Modal
      title={guest.guestName}
      description={guest.company ?? undefined}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost mr-auto" onClick={onClose}>
            Close
          </button>
          {editable ? (
            <button type="button" className="btn btn-dark" onClick={onEdit}>
              <PencilIcon className="size-4" />
              Edit
            </button>
          ) : null}
        </>
      }
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {kind === "gone" && guest.status === "EXPECTED" ? <MissedBadge /> : <StatusBadge status={guest.status} />}
          {kind === "late" ? <span className="badge bg-signal-soft text-signal-deep">Late</span> : null}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs font-semibold text-muted">Expected</dt>
            <dd className="mt-0.5 font-medium">{guest.expectedLabel ?? "Any time"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted">Arrived</dt>
            <dd className={`mt-0.5 font-medium ${kind === "in" ? "text-cleared" : "text-muted"}`}>
              {kind === "in" ? (guest.checkedInLabel ?? "Yes") : "Not yet"}
            </dd>
          </div>
          {showHost || guest.invited ? (
            <div className="col-span-2">
              <dt className="text-xs font-semibold text-muted">Host</dt>
              <dd className="mt-0.5 font-medium">
                {guest.hostName}
                {guest.invited ? <span className="font-normal text-muted"> · you were invited</span> : null}
              </dd>
            </div>
          ) : null}
          {guest.notifyUsers.length ? (
            <div className="col-span-2">
              <dt className="text-xs font-semibold text-muted">Also notifying</dt>
              <dd className="mt-0.5 font-medium">{guest.notifyUsers.map((u) => u.name).join(", ")}</dd>
            </div>
          ) : null}
        </dl>
        {hasCar(guest) ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel-2 px-3 py-2.5 text-sm">
            <CarIcon className="size-4 text-muted" />
            {guest.licensePlate ? <PlateTag plate={guest.licensePlate} /> : null}
            {guest.vehicle ? <span className="font-medium">{guest.vehicle}</span> : null}
          </div>
        ) : null}
        {guest.notes ? (
          <p className="flex items-start gap-1.5 text-sm text-muted">
            <NoteIcon className="mt-0.5 size-4 shrink-0" />
            <span className="break-words">{guest.notes}</span>
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
