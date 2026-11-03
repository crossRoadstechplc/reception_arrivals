"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { formatOfficeDate, shiftISO } from "@/lib/dates";
import { STATUS_LABEL, type GuestStatus } from "@/lib/types";
import { AlertIcon, CheckIcon, ChevronLeft, ChevronRight, XIcon } from "@/components/icons";

/* ---------- Status badge ---------- */

const STATUS_TONE: Record<GuestStatus, string> = {
  EXPECTED: "bg-expected-soft text-expected",
  ARRIVED: "bg-arrived-soft text-arrived",
  CLEARED: "bg-cleared-soft text-cleared",
  CANCELLED: "bg-idle-soft text-idle",
  NO_SHOW: "bg-danger-soft text-danger",
};

const STATUS_DOT: Record<GuestStatus, string> = {
  EXPECTED: "bg-expected",
  ARRIVED: "bg-arrived",
  CLEARED: "bg-cleared",
  CANCELLED: "bg-idle",
  NO_SHOW: "bg-danger",
};

export function StatusBadge({ status }: { status: GuestStatus }) {
  return (
    <span className={`badge ${STATUS_TONE[status]}`}>
      <span className={`size-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/* ---------- Empty state ---------- */

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center border-dashed px-6 py-12 text-center">
      {icon ? (
        <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-paper text-muted">
          {icon}
        </div>
      ) : null}
      <h2 className="text-base font-semibold">{title}</h2>
      {body ? <p className="mt-1 max-w-sm text-sm text-muted">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* ---------- Inline alert ---------- */

export function Alert({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div
      role="alert"
      className="fade flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-sm text-danger"
    >
      <AlertIcon className="mt-0.5 size-4 shrink-0" />
      <p className="flex-1 font-medium">{children}</p>
      {onClose ? (
        <button type="button" onClick={onClose} aria-label="Dismiss" className="-m-1 rounded p-1 hover:bg-danger/10">
          <XIcon className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

/* ---------- Modal ---------- */

export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  size = "md",
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const titleId = useId();
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeRef.current();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, []);

  const width = size === "sm" ? "sm:max-w-sm" : size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg";

  return (
    <div
      className="fade fixed inset-0 z-40 flex items-end justify-center bg-ink/45 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`rise flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-panel shadow-2xl sm:rounded-2xl ${width}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
          </div>
          <button type="button" className="btn btn-ghost btn-icon btn-sm -mr-2" onClick={onClose} aria-label="Close">
            <XIcon className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-panel-2 px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------- Confirm dialog ---------- */

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  pending,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Keep
          </button>
          <button
            type="button"
            className={`btn ${danger ? "btn-danger" : "btn-dark"}`}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-muted">{body}</p>
    </Modal>
  );
}

/* ---------- Toast ---------- */

export type ToastState = {
  id: number;
  message: string;
  tone?: "success" | "error";
  action?: { label: string; onClick: () => void };
} | null;

export function useToast() {
  const [toast, setToast] = useState<ToastState>(null);
  const show = useCallback((next: Omit<NonNullable<ToastState>, "id">) => {
    setToast({ ...next, id: Date.now() });
  }, []);
  const dismiss = useCallback(() => setToast(null), []);
  return { toast, show, dismiss };
}

export function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDismiss, toast.action ? 6000 : 3500);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;
  const error = toast.tone === "error";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div
        key={toast.id}
        role="status"
        className="rise pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink py-2.5 pr-2.5 pl-4 text-sm text-white shadow-2xl"
      >
        <span
          className={`flex size-5 shrink-0 items-center justify-center rounded-full ${error ? "bg-danger" : "bg-cleared"}`}
        >
          {error ? <AlertIcon className="size-3.5" /> : <CheckIcon className="size-3.5" />}
        </span>
        <span className="flex-1 font-medium">{toast.message}</span>
        {toast.action ? (
          <button
            type="button"
            className="rounded-lg px-2.5 py-1.5 font-semibold text-signal hover:bg-white/10"
            onClick={() => {
              toast.action?.onClick();
              onDismiss();
            }}
          >
            {toast.action.label}
          </button>
        ) : (
          <button type="button" aria-label="Dismiss" className="rounded-lg p-1.5 text-white/60 hover:bg-white/10" onClick={onDismiss}>
            <XIcon className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Date navigation ---------- */

export function DateNav({
  date,
  today,
  onChange,
}: {
  date: string;
  today: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center rounded-xl border border-line-strong bg-panel">
        <button
          type="button"
          className="btn btn-ghost btn-icon rounded-r-none"
          aria-label="Previous day"
          onClick={() => onChange(shiftISO(date, -1))}
        >
          <ChevronLeft className="size-4" />
        </button>
        <input
          type="date"
          aria-label="Pick a date"
          value={date}
          onChange={(event) => event.target.value && onChange(event.target.value)}
          className="h-10 border-x border-line bg-transparent px-2 text-sm font-medium text-ink"
        />
        <button
          type="button"
          className="btn btn-ghost btn-icon rounded-l-none"
          aria-label="Next day"
          onClick={() => onChange(shiftISO(date, 1))}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={date === today}
        onClick={() => onChange(today)}
      >
        Today
      </button>
    </div>
  );
}

export function dayLabel(date: string, today: string) {
  if (date === today) return "Today";
  if (date === shiftISO(today, 1)) return "Tomorrow";
  if (date === shiftISO(today, -1)) return "Yesterday";
  return date < today ? "Past day" : "Upcoming";
}

export function DateHeading({ date, today, title }: { date: string; today: string; title?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold tracking-[0.14em] text-signal uppercase">
        {title ? `${title} · ` : ""}
        {dayLabel(date, today)}
      </p>
      <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-tight md:text-[1.75rem]">
        {formatOfficeDate(date)}
      </h1>
    </div>
  );
}

/* ---------- Stat tile ---------- */

export function StatTile({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: "expected" | "arrived" | "cleared" | "idle" | "ink" | "admin";
  active?: boolean;
  onClick?: () => void;
}) {
  const bar = {
    expected: "bg-expected",
    arrived: "bg-arrived",
    cleared: "bg-cleared",
    idle: "bg-idle",
    ink: "bg-ink",
    admin: "bg-admin",
  }[tone];
  const content = (
    <>
      <span className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${bar}`} />
      <span className="block text-xs font-semibold text-muted">{label}</span>
      <span className="mt-0.5 block font-mono text-2xl font-medium tabular-nums">{value}</span>
    </>
  );
  const base = "card relative overflow-hidden px-4 py-3 text-left";
  if (!onClick) return <div className={base}>{content}</div>;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`${base} transition-colors hover:border-line-strong ${active ? "border-ink ring-1 ring-ink" : ""}`}
    >
      {content}
    </button>
  );
}

export function initials(name: string | null | undefined, fallback = "?") {
  const source = (name ?? "").trim();
  if (!source) return fallback;
  const parts = source.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
