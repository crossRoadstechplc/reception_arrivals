"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveGuest } from "@/lib/actions/guests";
import { OTHER_HOST } from "@/lib/types";
import { Alert, Modal, PlateTag } from "@/components/ui";
import { TimeField } from "@/components/time-field";
import {
  BellIcon,
  CalendarIcon,
  CarIcon,
  CheckIcon,
  ClockIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  UserIcon,
  XIcon,
} from "@/components/icons";
import type { FloorGuest, HostOption } from "@/components/floor/guest-manager";

/* ---------- small date helpers (calendar dates, no time zones involved) ---------- */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function asDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function addDays(iso: string, n: number) {
  const d = asDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function longDate(iso: string) {
  const d = asDate(iso);
  return `${LONG_WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
function timeLabel(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const QUICK_TIMES = ["09:00", "10:00", "11:00", "14:00", "15:00"];

const STEPS = [
  { key: "guest", label: "Guest", question: "Who’s coming?" },
  { key: "when", label: "When", question: "When are they coming?" },
  { key: "host", label: "Host", question: "Who are they visiting?" },
  { key: "extras", label: "Extras", question: "Anything else for reception?" },
  { key: "review", label: "Review", question: "Ready to add?" },
] as const;
const REVIEW = 4;

/**
 * Add or edit a guest one question at a time: guest, when, host (+ "Also notify"),
 * extras, then review. Editing opens on the review step.
 */
export function GuestForm({
  date,
  today,
  floorId,
  floorName,
  isAdmin,
  currentUserId,
  hosts,
  people,
  recentCompanies = [],
  guest,
  onClose,
  onSaved,
  onShowDate,
}: {
  date: string;
  today: string;
  floorId: string;
  floorName: string;
  isAdmin: boolean;
  currentUserId: string;
  hosts: HostOption[];
  /** Everyone on the floor, for "Also notify". */
  people: HostOption[];
  recentCompanies?: string[];
  guest: FloorGuest | null;
  onClose: () => void;
  onSaved: (name: string, isNew: boolean) => void;
  /** Called on closing with the date of the last guest saved, so the page can show that day. */
  onShowDate?: (date: string) => void;
}) {
  const router = useRouter();
  const isNew = !guest;
  const [step, setStep] = useState(isNew ? 0 : REVIEW);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(0);
  const savedDate = useRef<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [guestName, setGuestName] = useState(guest?.guestName ?? "");
  const [company, setCompany] = useState(guest?.company ?? "");
  const [visitDate, setVisitDate] = useState(guest?.visitDate ?? date);
  const [time, setTime] = useState(guest?.expectedArrival ?? "");
  const [hostChoice, setHostChoice] = useState<string>(guest ? (guest.hostUserId ?? OTHER_HOST) : currentUserId);
  const [hostName, setHostName] = useState(guest && !guest.hostUserId ? guest.hostName : "");
  const [notify, setNotify] = useState<string[]>(guest?.notifyUsers.map((u) => u.id) ?? []);
  const [byCar, setByCar] = useState(Boolean(guest?.licensePlate || guest?.vehicle));
  const [plate, setPlate] = useState(guest?.licensePlate ?? "");
  const [vehicle, setVehicle] = useState(guest?.vehicle ?? "");
  const [notes, setNotes] = useState(guest?.notes ?? "");

  const hostId = isAdmin ? hostChoice : currentUserId;
  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of [...people, ...hosts, ...(guest?.notifyUsers ?? [])]) map.set(p.id, p.name);
    return (id: string) => map.get(id) ?? "Someone";
  }, [people, hosts, guest]);
  // The host is never also on the notify list.
  const notifyList = notify.filter((id) => id !== hostId);

  function close() {
    if (savedDate.current) onShowDate?.(savedDate.current);
    onClose();
  }

  function problem(at: number): string | null {
    if (at === 0 && guestName.trim().length < 2) return "Enter the guest’s name.";
    if (at === 1 && !/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) return "Choose a date.";
    if (at === 2 && isAdmin && hostChoice === OTHER_HOST && hostName.trim().length < 2) return "Enter the host’s name.";
    return null;
  }

  function next() {
    const issue = problem(step);
    if (issue) {
      setError(issue);
      return;
    }
    setError(null);
    setStep((s) => Math.min(REVIEW, s + 1));
  }

  function goTo(target: number) {
    // You can jump back freely; jumping forward checks the steps in between.
    for (let i = 0; i < target; i++) {
      const issue = problem(i);
      if (issue) {
        setStep(i);
        setError(issue);
        return;
      }
    }
    setError(null);
    setStep(target);
  }

  function save(another: boolean) {
    for (let i = 0; i < REVIEW; i++) {
      const issue = problem(i);
      if (issue) {
        setStep(i);
        setError(issue);
        return;
      }
    }
    setError(null);
    const name = guestName.trim();
    startTransition(async () => {
      const result = await saveGuest({
        id: guest?.id,
        floorId,
        visitDate,
        guestName: name,
        company,
        hostUserId: hostId,
        hostName,
        expectedArrival: time,
        notes,
        licensePlate: byCar ? plate : "",
        vehicle: byCar ? vehicle : "",
        notifyUserIds: notifyList,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      savedDate.current = visitDate;
      router.refresh();
      onSaved(name, isNew);
      if (another && isNew) {
        // Saved: open a new, empty form for the next guest.
        setGuestName("");
        setCompany("");
        setVisitDate(date);
        setHostChoice(currentUserId);
        setHostName("");
        setNotify([]);
        setTime("");
        setNotes("");
        setByCar(false);
        setPlate("");
        setVehicle("");
        setAdded((n) => n + 1);
        setStep(0);
        return;
      }
      close();
    });
  }

  const answers = [
    guestName.trim() ? `${guestName.trim()}${company.trim() ? ` · ${company.trim()}` : ""}` : "",
    `${visitDate === today ? "Today" : longDate(visitDate)} · ${time ? timeLabel(time) : "Any time"}`,
    `${hostId === currentUserId ? "You" : hostChoice === OTHER_HOST ? hostName.trim() || "Someone else" : nameOf(hostChoice)}${
      notifyList.length ? ` · +${notifyList.length} notified` : ""
    }`,
    byCar || notes.trim() ? [byCar ? "By car" : "", notes.trim() ? "Note" : ""].filter(Boolean).join(" · ") : "Nothing extra",
  ];

  return (
    <Modal
      title={isNew ? "Add guest" : "Edit guest"}
      description={added > 0 ? `${added} added so far.` : floorName}
      size="xl"
      onClose={close}
      footer={
        step === REVIEW ? (
          <>
            <button type="button" className="btn btn-ghost mr-auto" onClick={close}>
              {added > 0 ? "Done" : "Cancel"}
            </button>
            {isNew ? (
              <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => save(true)}>
                Save and Add more Guests
              </button>
            ) : null}
            <button type="button" className="btn btn-primary" disabled={pending} onClick={() => save(false)}>
              {pending ? "Saving…" : isNew ? "Save guest" : "Save changes"}
            </button>
          </>
        ) : (
          <>
            {step > 0 ? (
              <button type="button" className="btn btn-ghost mr-auto" onClick={() => goTo(step - 1)}>
                Back
              </button>
            ) : (
              <button type="button" className="btn btn-ghost mr-auto" onClick={close}>
                Cancel
              </button>
            )}
            <span className="hidden text-xs text-muted sm:inline">Enter ↵ to continue</span>
            {step === 3 ? (
              <button type="button" className="btn btn-ghost" onClick={() => goTo(REVIEW)}>
                Skip
              </button>
            ) : null}
            <button type="submit" form="guest-step" className="btn btn-primary">
              {step === 3 ? "Review" : "Next"}
            </button>
          </>
        )
      }
    >
      <div className="grid gap-5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6">
        {/* Steps */}
        <nav aria-label="Steps" className="hidden flex-col gap-1 sm:flex">
          {STEPS.map((s, i) => {
            const done = i < step || (!isNew && i < REVIEW);
            const current = i === step;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => goTo(i)}
                aria-current={current ? "step" : undefined}
                className={`flex items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                  current ? "bg-signal-soft" : "hover:bg-panel-2"
                }`}
              >
                <span
                  className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    current
                      ? "bg-signal text-white"
                      : done
                        ? "bg-cleared text-white"
                        : "border-2 border-line-strong text-muted"
                  }`}
                >
                  {done && !current ? <CheckIcon className="size-3.5" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold ${current || done ? "text-ink" : "text-muted"}`}>{s.label}</span>
                  {i < REVIEW && (done || current) && answers[i] ? (
                    <span className="block truncate text-xs text-muted">{answers[i]}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </nav>
        {/* Phone-width progress */}
        <div className="flex gap-1.5 sm:hidden" aria-hidden="true">
          {STEPS.slice(0, REVIEW).map((s, i) => (
            <span key={s.key} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-signal" : "bg-line"}`} />
          ))}
        </div>

        <form
          id="guest-step"
          className="grid min-h-[22rem] content-start gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            next();
          }}
        >
          <div>
            <h3 className="text-2xl font-semibold tracking-tight">{STEPS[step].question}</h3>
            {step === 0 ? <p className="mt-1 text-sm text-muted">Their name as reception will see it.</p> : null}
            {step === 3 ? <p className="mt-1 text-sm text-muted">All optional. Skip if not needed.</p> : null}
            {step === REVIEW ? <p className="mt-1 text-sm text-muted">Click the pencil to change anything.</p> : null}
          </div>

          {step === 0 ? (
            <>
              <label>
                <span className="label">Guest name</span>
                <input
                  className="field"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Full name"
                  autoFocus
                />
              </label>
              <label>
                <span className="label">
                  Company <span className="font-normal text-muted">(optional)</span>
                </span>
                <input className="field" value={company} onChange={(e) => setCompany(e.target.value)} />
              </label>
              {recentCompanies.length ? (
                <div>
                  <p className="mb-1.5 text-xs text-muted">Recent companies</p>
                  <div className="flex flex-wrap gap-2">
                    {recentCompanies.slice(0, 6).map((c) => (
                      <button key={c} type="button" className={chip(company === c)} onClick={() => setCompany(c)}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {step === 1 ? (
            <>
              <div>
                <p className="label">Date</p>
                <div className="grid grid-cols-4 gap-2">
                  {[0, 1, 2, 3].map((n) => {
                    const iso = addDays(today, n);
                    const on = iso === visitDate;
                    const d = asDate(iso);
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => setVisitDate(iso)}
                        aria-pressed={on}
                        className={`flex h-[4.5rem] flex-col items-center justify-center rounded-xl border transition-colors ${
                          on ? "border-ink bg-ink text-white" : "border-line-strong bg-panel hover:border-ink"
                        }`}
                      >
                        <span className="text-[11px] font-semibold tracking-wider uppercase opacity-80">{WEEKDAYS[d.getUTCDay()]}</span>
                        <span className="text-xl leading-tight font-semibold">{d.getUTCDate()}</span>
                        <span className="min-h-3.5 text-[11px] opacity-80">{n === 0 ? "Today" : n === 1 ? "Tomorrow" : ""}</span>
                      </button>
                    );
                  })}
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <CalendarIcon className="size-4 text-muted" />
                  <span className="text-muted">Another date</span>
                  <input
                    type="date"
                    className="field h-9 w-auto"
                    value={visitDate}
                    onChange={(e) => e.target.value && setVisitDate(e.target.value)}
                  />
                </label>
              </div>
              <div>
                <p className="label">Expected time</p>
                <TimeField value={time} onChange={setTime} size="lg" />
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button type="button" className={chip(!time)} onClick={() => setTime("")}>
                    Any time
                  </button>
                  {QUICK_TIMES.map((t) => (
                    <button key={t} type="button" className={chip(time === t)} onClick={() => setTime(t)}>
                      {timeLabel(t)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              {isAdmin ? (
                <div className="overflow-hidden rounded-xl border border-line">
                  {guest?.hostUserId && !hosts.some((h) => h.id === guest.hostUserId) ? (
                    <HostRadio id={guest.hostUserId} label={`${guest.hostName} (no longer on this floor)`} value={hostChoice} onChange={setHostChoice} />
                  ) : null}
                  {hosts.map((h) => (
                    <HostRadio
                      key={h.id}
                      id={h.id}
                      label={h.id === currentUserId ? `Me (${h.name})` : h.name}
                      value={hostChoice}
                      onChange={setHostChoice}
                    />
                  ))}
                  <HostRadio id={OTHER_HOST} label="Someone else (type a name)" value={hostChoice} onChange={setHostChoice} />
                  {hostChoice === OTHER_HOST ? (
                    <div className="border-t border-line p-3">
                      <input
                        className="field"
                        value={hostName}
                        onChange={(e) => setHostName(e.target.value)}
                        placeholder="Host’s name"
                        autoFocus
                      />
                      <p className="hint mt-1">They don’t have an account, so they won’t get alerts.</p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="rounded-xl bg-panel-2 px-3 py-2.5 text-sm text-muted">
                  You’re the host. You’ll get an alert when reception checks them in.
                </p>
              )}
              <NotifyPicker
                people={people.filter((p) => p.id !== hostId)}
                selected={notifyList}
                nameOf={nameOf}
                onChange={setNotify}
              />
            </>
          ) : null}

          {step === 3 ? (
            <>
              <div className="rounded-xl border border-line">
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                  <input type="checkbox" className="size-4 accent-[var(--ink)]" checked={byCar} onChange={(e) => setByCar(e.target.checked)} />
                  <CarIcon className="size-5 text-muted" />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">Coming by car</span>
                    <span className="block text-xs text-muted">Reception will arrange parking for them.</span>
                  </span>
                </label>
                {byCar ? (
                  <div className="grid gap-3 border-t border-line p-3 sm:grid-cols-[11rem_1fr]">
                    <label>
                      <span className="label">
                        License plate <span className="font-normal text-muted">(optional)</span>
                      </span>
                      <input
                        className="field font-mono uppercase"
                        value={plate}
                        onChange={(e) => setPlate(e.target.value)}
                        placeholder="e.g. AA 3-B12345"
                        maxLength={20}
                        autoComplete="off"
                      />
                    </label>
                    <label>
                      <span className="label">
                        Car <span className="font-normal text-muted">(optional)</span>
                      </span>
                      <input
                        className="field"
                        value={vehicle}
                        onChange={(e) => setVehicle(e.target.value)}
                        placeholder="e.g. White Toyota Corolla"
                        maxLength={80}
                      />
                    </label>
                  </div>
                ) : null}
              </div>
              <label>
                <span className="label">
                  Notes for reception <span className="font-normal text-muted">(optional)</span>
                </span>
                <textarea
                  className="field"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Bring to meeting room 3"
                  maxLength={500}
                />
              </label>
            </>
          ) : null}

          {step === REVIEW ? (
            <div className="grid gap-2.5">
              <ReviewCard icon={<UserIcon className="size-5" />} label="Guest" onEdit={() => goTo(0)}>
                <p className="font-medium">{guestName.trim()}</p>
                {company.trim() ? <p className="text-sm text-muted">{company.trim()}</p> : null}
              </ReviewCard>
              <ReviewCard icon={<ClockIcon className="size-5" />} label="When" onEdit={() => goTo(1)}>
                <p className="font-medium">
                  {visitDate === today ? "Today, " : ""}
                  {longDate(visitDate)}
                </p>
                <p className="text-sm text-muted">{time ? timeLabel(time) : "Any time"}</p>
              </ReviewCard>
              <ReviewCard icon={<BellIcon className="size-5" />} label="Host and alerts" onEdit={() => goTo(2)}>
                <p className="font-medium">
                  {hostId === currentUserId ? "You" : hostChoice === OTHER_HOST ? hostName.trim() : nameOf(hostChoice)}
                </p>
                <p className="text-sm text-muted">
                  {notifyList.length ? `Also notifying ${notifyList.map(nameOf).join(", ")}` : "No one else notified"}
                </p>
              </ReviewCard>
              <ReviewCard icon={<CarIcon className="size-5" />} label="Extras" onEdit={() => goTo(3)}>
                {byCar ? (
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {plate.trim() ? <PlateTag plate={plate.trim().toUpperCase()} /> : null}
                    {vehicle.trim() || (plate.trim() ? "" : "Coming by car")}
                  </p>
                ) : (
                  <p className="font-medium">Not coming by car</p>
                )}
                <p className="text-sm break-words text-muted">{notes.trim() || "No notes"}</p>
              </ReviewCard>
            </div>
          ) : null}

          {error ? <Alert>{error}</Alert> : null}
        </form>
      </div>
    </Modal>
  );
}

function chip(on: boolean) {
  return `inline-flex h-9 items-center rounded-full border px-3.5 text-sm transition-colors ${
    on ? "border-signal bg-signal-soft font-semibold text-signal-deep" : "border-line-strong bg-panel hover:border-ink"
  }`;
}

function HostRadio({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (id: string) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 border-t border-line px-3.5 py-2.5 first:border-t-0 hover:bg-panel-2">
      <input type="radio" name="host" className="size-4 accent-[var(--signal)]" checked={value === id} onChange={() => onChange(id)} />
      <span className="text-[15px]">{label}</span>
    </label>
  );
}

function ReviewCard({
  icon,
  label,
  onEdit,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-panel px-4 py-3">
      <span className="mt-0.5 text-muted">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold tracking-wider text-muted uppercase">{label}</p>
        {children}
      </div>
      <button type="button" className="btn btn-ghost btn-sm px-2 text-signal-deep" aria-label={`Change ${label.toLowerCase()}`} onClick={onEdit}>
        <PencilIcon className="size-4" />
      </button>
    </div>
  );
}

/** "Also notify": chips for chosen colleagues and a searchable list to add more. */
function NotifyPicker({
  people,
  selected,
  nameOf,
  onChange,
}: {
  people: HostOption[];
  selected: string[];
  nameOf: (id: string) => string;
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const needle = query.trim().toLowerCase();
  const options = people.filter((p) => !selected.includes(p.id) && (!needle || p.name.toLowerCase().includes(needle)));

  return (
    <div>
      <p className="flex items-center gap-2 text-[15px] font-semibold">
        <BellIcon className="size-4 text-muted" />
        Also notify <span className="text-xs font-normal text-muted">optional</span>
      </p>
      <p className="mt-0.5 mb-2.5 text-sm text-muted">They’ll see this guest and get an alert when they arrive.</p>
      <div className="flex flex-wrap items-center gap-2">
        {selected.map((id) => (
          <span key={id} className="inline-flex h-8 items-center gap-1 rounded-full border border-line-strong bg-panel pr-1 pl-3 text-sm">
            {nameOf(id)}
            <button
              type="button"
              aria-label={`Remove ${nameOf(id)}`}
              className="flex size-6 items-center justify-center rounded-full text-muted hover:bg-panel-2 hover:text-ink"
              onClick={() => onChange(selected.filter((x) => x !== id))}
            >
              <XIcon className="size-3.5" />
            </button>
          </span>
        ))}
        {people.length === selected.length ? null : (
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-line-strong px-3 text-sm font-semibold text-signal-deep hover:border-signal"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            <PlusIcon className="size-3.5" />
            Add people
          </button>
        )}
      </div>
      {open ? (
        <div className="mt-2.5 overflow-hidden rounded-xl border border-line bg-panel">
          <label className="flex items-center gap-2 border-b border-line px-3">
            <SearchIcon className="size-4 text-muted" />
            <input
              className="h-10 flex-1 bg-transparent text-sm outline-none"
              placeholder="Search people on this floor"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Enter picks the first match instead of moving to the next step.
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (options[0]) {
                    onChange([...selected, options[0].id]);
                    setQuery("");
                  }
                }
              }}
              autoFocus
            />
          </label>
          <ul className="max-h-48 overflow-y-auto">
            {options.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-muted">{people.length ? "No one else matches." : "No one else is on this floor yet."}</li>
            ) : (
              options.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-panel-2"
                    onClick={() => {
                      onChange([...selected, p.id]);
                      setQuery("");
                    }}
                  >
                    <span className="flex size-7 items-center justify-center rounded-full bg-idle-soft text-[11px] font-bold">
                      {p.name
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((w) => w[0]?.toUpperCase())
                        .join("")}
                    </span>
                    {p.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
