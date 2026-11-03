"use client";

import { RefreshButton } from "@/components/refresh-button";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTeamMember, removeTeamMember, resendTeamInvite, setTeamRole } from "@/lib/actions/team";
import { FLOOR_ROLE_LABEL, type FloorRole } from "@/lib/types";
import { Alert, ConfirmDialog, EmptyState, Modal, Toast, initials, useToast } from "@/components/ui";
import { PlusIcon, SearchIcon, UserIcon } from "@/components/icons";

type Member = {
  id: string;
  name: string | null;
  email: string | null;
  active: boolean;
  pending: boolean;
  role: FloorRole;
  otherFloors: string[];
};

type FloorInfo = { id: string; name: string; number: number };

export function TeamManager({
  floor,
  floors,
  members,
  currentUserId,
  isSuperAdmin,
}: {
  floor: FloorInfo;
  floors: FloorInfo[];
  members: Member[];
  currentUserId: string;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [removePending, startRemove] = useTransition();
  const [, startTransition] = useTransition();
  const { toast, show, dismiss } = useToast();

  const needle = query.trim().toLowerCase();
  const visible = members.filter((m) => `${m.name ?? ""} ${m.email ?? ""}`.toLowerCase().includes(needle));
  const memberCount = members.filter((m) => m.role === "MEMBER").length;

  function run(id: string, action: () => Promise<{ ok: boolean; error?: string; notice?: string }>, success?: string) {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await action();
      setPendingId(null);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
      const message = result.notice ?? success;
      if (message) show({ message });
    });
  }

  function remove() {
    if (!removing) return;
    const person = removing;
    startRemove(async () => {
      const result = await removeTeamMember({ floorId: floor.id, userId: person.id });
      setRemoving(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      show({ message: `${person.name || person.email} removed from ${floor.name}` });
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-3 py-5 md:px-5">
      <section className="flex flex-wrap items-end gap-3">
        <div className="mr-auto min-w-0">
          <p className="text-xs font-semibold tracking-[0.14em] text-signal uppercase">Floor team</p>
          <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-tight md:text-[1.75rem]">{floor.name}</h1>
          <p className="mt-1 text-sm text-muted">
            Members add and see only their own guests. They get an alert when their guest arrives.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {floors.length > 1 ? (
            <select
              aria-label="Floor"
              value={floor.id}
              onChange={(event) => router.push(`/floor/team?floor=${event.target.value}`)}
              className="field h-10 w-auto pr-8 font-medium"
            >
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.number} · {f.name}
                </option>
              ))}
            </select>
          ) : null}
          <RefreshButton />
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            <PlusIcon className="size-4" />
            Add member
          </button>
        </div>
      </section>

      {error ? <Alert onClose={() => setError(null)}>{error}</Alert> : null}

      {memberCount === 0 ? (
        <EmptyState
          icon={<UserIcon className="size-6" />}
          title="No members yet"
          body="Add the people on this floor who receive visitors. They'll get an email to set their password."
          action={
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
              <PlusIcon className="size-4" />
              Add the first member
            </button>
          }
        />
      ) : null}

      {members.length > 0 ? (
        <>
          {members.length > 6 ? (
            <label className="relative block sm:w-72">
              <span className="sr-only">Search team</span>
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input
                type="search"
                className="field pl-9"
                placeholder="Search name or email"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          ) : null}
          <ul className="card divide-y divide-line overflow-hidden">
            {visible.map((member) => {
              const isMe = member.id === currentUserId;
              const busy = pendingId === member.id;
              const canRemove = !isMe && (member.role === "MEMBER" || isSuperAdmin);
              return (
                <li key={member.id} className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center ${member.active ? "" : "bg-panel-2/60"}`}>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        !member.active
                          ? "bg-idle-soft text-idle"
                          : member.role === "ADMIN"
                            ? "bg-ink text-white"
                            : "bg-arrived text-white"
                      }`}
                    >
                      {initials(member.name, member.email?.[0]?.toUpperCase())}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate font-semibold">{member.name || "Unnamed"}</span>
                        {isMe ? <span className="badge bg-ink text-white">You</span> : null}
                        <span
                          className={`badge ${member.role === "ADMIN" ? "bg-signal-soft text-signal-deep" : "bg-arrived-soft text-arrived"}`}
                        >
                          {FLOOR_ROLE_LABEL[member.role]}
                        </span>
                        {member.pending ? <span className="badge bg-expected-soft text-expected">Invite pending</span> : null}
                        {!member.active ? <span className="badge bg-idle-soft text-idle">Turned off</span> : null}
                      </div>
                      <p className="truncate text-sm text-muted">
                        {member.email}
                        {member.otherFloors.length ? <span> · Also on {member.otherFloors.join(", ")}</span> : null}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5 pl-[3.25rem] sm:pl-0">
                    {member.pending ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={busy}
                        onClick={() => run(member.id, () => resendTeamInvite({ floorId: floor.id, userId: member.id }))}
                      >
                        Resend invite
                      </button>
                    ) : null}
                    {isSuperAdmin && !isMe ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={busy}
                        onClick={() =>
                          run(
                            member.id,
                            () =>
                              setTeamRole({
                                floorId: floor.id,
                                userId: member.id,
                                role: member.role === "ADMIN" ? "MEMBER" : "ADMIN",
                              }),
                            member.role === "ADMIN"
                              ? `${member.name || member.email} is now a member`
                              : `${member.name || member.email} is now a floor admin`,
                          )
                        }
                      >
                        {member.role === "ADMIN" ? "Make member" : "Make admin"}
                      </button>
                    ) : null}
                    {canRemove ? (
                      <button type="button" className="btn btn-ghost btn-sm text-danger hover:bg-danger-soft hover:text-danger" disabled={busy} onClick={() => setRemoving(member)}>
                        Remove
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {adding ? (
        <AddMemberModal
          floor={floor}
          onClose={() => setAdding(false)}
          onAdded={(notice) => {
            router.refresh();
            show({ message: notice });
          }}
        />
      ) : null}

      {removing ? (
        <ConfirmDialog
          title={`Remove ${removing.name || removing.email}?`}
          body={`They will no longer see or add guests on ${floor.name}.${
            removing.otherFloors.length ? ` They stay on ${removing.otherFloors.join(", ")}.` : ""
          } Their past guests stay on the list.`}
          confirmLabel="Remove from floor"
          danger
          pending={removePending}
          onConfirm={remove}
          onClose={() => setRemoving(null)}
        />
      ) : null}

      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}

function AddMemberModal({
  floor,
  onClose,
  onAdded,
}: {
  floor: FloorInfo;
  onClose: () => void;
  onAdded: (notice: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await addTeamMember({
        floorId: floor.id,
        email: String(formData.get("email") ?? ""),
        name: String(formData.get("name") ?? ""),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onAdded(result.notice ?? "Member added");
      onClose();
    });
  }

  return (
    <Modal
      title={`Add a member to ${floor.name}`}
      description="New people get an email to set their password. People who already have an account just join this floor."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost mr-auto" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="member-form" className="btn btn-primary" disabled={pending}>
            {pending ? "Adding…" : "Add member"}
          </button>
        </>
      }
    >
      <form id="member-form" action={onSubmit} className="grid gap-4">
        <label>
          <span className="label">Work email</span>
          <input className="field" name="email" type="email" required autoFocus placeholder="name@company.com" />
        </label>
        <label>
          <span className="label">Full name</span>
          <input className="field" name="name" placeholder="Needed if they're new to Arrival Desk" />
          <span className="hint block">Leave blank if they already use Arrival Desk on another floor.</span>
        </label>
        {error ? <Alert>{error}</Alert> : null}
      </form>
    </Modal>
  );
}
