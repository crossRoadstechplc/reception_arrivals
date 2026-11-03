"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteFloor, inviteUser, saveFloor, updateUser } from "@/lib/actions/admin";
import { PasswordInput, generatePassword } from "@/components/password-input";
import { ROLE_DESCRIPTION, ROLE_LABEL, ROLES, type Role } from "@/lib/types";
import { Alert, ConfirmDialog, EmptyState, Modal, StatTile, Toast, initials, useToast } from "@/components/ui";
import { BuildingIcon, PencilIcon, PlusIcon, SearchIcon, UserIcon } from "@/components/icons";

type FloorRow = {
  id: string;
  name: string;
  number: number;
  active: boolean;
  guestCount: number;
  adminCount: number;
};
type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: Role;
  active: boolean;
  floorIds: string[];
};

type Tab = "people" | "floors";

const ROLE_TONE: Record<Role, string> = {
  RECEPTION: "bg-arrived-soft text-arrived",
  FLOOR_ADMIN: "bg-expected-soft text-expected",
  SUPER_ADMIN: "bg-signal-soft text-signal-deep",
};

const AVATAR_TONE: Record<Role, string> = {
  RECEPTION: "bg-arrived text-white",
  FLOOR_ADMIN: "bg-expected text-white",
  SUPER_ADMIN: "bg-signal text-white",
};

export function AdminConsole({
  floors,
  users,
  currentUserId,
}: {
  floors: FloorRow[];
  users: UserRow[];
  currentUserId: string;
}) {
  const [tab, setTab] = useState<Tab>("people");
  const [personModal, setPersonModal] = useState<UserRow | "new" | null>(null);
  const [floorModal, setFloorModal] = useState<FloorRow | "new" | null>(null);
  const { toast, show, dismiss } = useToast();

  const stats = useMemo(
    () => ({
      people: users.filter((u) => u.active).length,
      reception: users.filter((u) => u.active && u.role === "RECEPTION").length,
      floorAdmins: users.filter((u) => u.active && u.role === "FLOOR_ADMIN").length,
      floors: floors.filter((f) => f.active).length,
    }),
    [users, floors],
  );

  const floorsWithoutAdmin = floors.filter((floor) => floor.active && floor.adminCount === 0);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-3 py-5 md:px-5">
      <section className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <p className="text-xs font-semibold tracking-[0.14em] text-signal uppercase">Admin</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight md:text-[1.75rem]">People and floors</h1>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => (tab === "people" ? setPersonModal("new") : setFloorModal("new"))}
        >
          <PlusIcon className="size-4" />
          {tab === "people" ? "Add person" : "Add floor"}
        </button>
      </section>

      <section className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <StatTile label="Active people" value={stats.people} tone="ink" />
        <StatTile label="Reception staff" value={stats.reception} tone="arrived" />
        <StatTile label="Floor admins" value={stats.floorAdmins} tone="expected" />
        <StatTile label="Active floors" value={stats.floors} tone="cleared" />
      </section>

      {floorsWithoutAdmin.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-expected/25 bg-expected-soft px-3.5 py-2.5 text-sm text-expected">
          <span className="font-semibold">
            {floorsWithoutAdmin.length === 1 ? "1 floor has" : `${floorsWithoutAdmin.length} floors have`} no floor admin:
          </span>
          <span>{floorsWithoutAdmin.map((f) => f.name).join(", ")}.</span>
          <span>Nobody can add guests there yet.</span>
        </div>
      ) : null}

      <div role="tablist" className="flex gap-1 border-b border-line">
        <TabButton active={tab === "people"} onClick={() => setTab("people")} count={users.length}>
          People
        </TabButton>
        <TabButton active={tab === "floors"} onClick={() => setTab("floors")} count={floors.length}>
          Floors
        </TabButton>
      </div>

      {tab === "people" ? (
        <PeopleTab
          users={users}
          floors={floors}
          currentUserId={currentUserId}
          onAdd={() => setPersonModal("new")}
          onEdit={(person) => setPersonModal(person)}
        />
      ) : (
        <FloorsTab floors={floors} onAdd={() => setFloorModal("new")} onEdit={(floor) => setFloorModal(floor)} />
      )}

      {personModal ? (
        <PersonModal
          person={personModal === "new" ? null : personModal}
          floors={floors}
          locked={personModal !== "new" && personModal.id === currentUserId}
          onClose={() => setPersonModal(null)}
          onSaved={(message) => show({ message })}
        />
      ) : null}

      {floorModal ? (
        <FloorModal
          floor={floorModal === "new" ? null : floorModal}
          onClose={() => setFloorModal(null)}
          onSaved={(message) => show({ message })}
        />
      ) : null}

      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}

function TabButton({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px inline-flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors ${
        active ? "border-signal text-ink" : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {children}
      <span className={`rounded-full px-1.5 font-mono text-[11px] ${active ? "bg-ink text-white" : "bg-idle-soft"}`}>
        {count}
      </span>
    </button>
  );
}

/* ---------------- People ---------------- */

function PeopleTab({
  users,
  floors,
  currentUserId,
  onAdd,
  onEdit,
}: {
  users: UserRow[];
  floors: FloorRow[];
  currentUserId: string;
  onAdd: () => void;
  onEdit: (person: UserRow) => void;
}) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role | "all">("all");
  const floorName = useMemo(() => new Map(floors.map((f) => [f.id, f.name])), [floors]);

  const needle = query.trim().toLowerCase();
  const visible = users.filter((person) => {
    if (role !== "all" && person.role !== role) return false;
    if (!needle) return true;
    return `${person.name ?? ""} ${person.email ?? ""}`.toLowerCase().includes(needle);
  });

  if (users.length === 0) {
    return (
      <EmptyState
        icon={<UserIcon className="size-6" />}
        title="No people yet"
        body="Add reception staff and floor admins so they can sign in."
        action={
          <button type="button" className="btn btn-primary" onClick={onAdd}>
            <PlusIcon className="size-4" />
            Add person
          </button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <label className="relative block sm:w-72">
          <span className="sr-only">Search people</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            className="field pl-9"
            placeholder="Search name or email"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
          <button type="button" className="chip" aria-pressed={role === "all"} onClick={() => setRole("all")}>
            All
          </button>
          {ROLES.map((item) => (
            <button key={item} type="button" className="chip" aria-pressed={role === item} onClick={() => setRole(item)}>
              {ROLE_LABEL[item]}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Nobody matches" body="Try another name or role." />
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {visible.map((person) => {
            const personFloors = person.floorIds.map((id) => floorName.get(id)).filter(Boolean) as string[];
            const isMe = person.id === currentUserId;
            return (
              <li key={person.id} className={`flex items-center gap-3 px-4 py-3 ${person.active ? "" : "bg-panel-2/60"}`}>
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    person.active ? AVATAR_TONE[person.role] : "bg-idle-soft text-idle"
                  }`}
                >
                  {initials(person.name, person.email?.[0]?.toUpperCase())}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={`truncate font-semibold ${person.active ? "" : "text-muted"}`}>
                      {person.name || "Unnamed"}
                    </span>
                    {isMe ? <span className="badge bg-ink text-white">You</span> : null}
                    <span className={`badge ${ROLE_TONE[person.role]}`}>{ROLE_LABEL[person.role]}</span>
                    {!person.active ? <span className="badge bg-idle-soft text-idle">Can&apos;t sign in</span> : null}
                  </div>
                  <p className="truncate text-sm text-muted">
                    {person.email}
                    {person.role === "FLOOR_ADMIN" ? (
                      personFloors.length ? (
                        <span> · {personFloors.join(", ")}</span>
                      ) : (
                        <span className="font-semibold text-danger"> · No floor assigned</span>
                      )
                    ) : null}
                  </p>
                </div>
                <button type="button" className="btn btn-secondary btn-sm shrink-0" onClick={() => onEdit(person)}>
                  <PencilIcon className="size-3.5" />
                  <span className="hidden sm:inline">Edit</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PersonModal({
  person,
  floors,
  locked,
  onClose,
  onSaved,
}: {
  person: UserRow | null;
  floors: FloorRow[];
  locked: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const router = useRouter();
  const isNew = !person;
  const [role, setRole] = useState<Role>(person?.role ?? "RECEPTION");
  const [selectedFloors, setSelectedFloors] = useState<string[]>(person?.floorIds ?? []);
  const [active, setActive] = useState(person?.active ?? true);
  const [password, setPassword] = useState("");
  const [revealKey, setRevealKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleFloor(id: string) {
    setSelectedFloors((current) => (current.includes(id) ? current.filter((f) => f !== id) : [...current, id]));
  }

  function onSubmit(formData: FormData) {
    setError(null);
    const name = String(formData.get("name") ?? "");
    startTransition(async () => {
      const result = isNew
        ? await inviteUser({
            email: String(formData.get("email") ?? ""),
            name,
            password,
            role,
            floorIds: selectedFloors,
          })
        : await updateUser({
            userId: person.id,
            name,
            role: locked ? "SUPER_ADMIN" : role,
            active: locked ? true : active,
            floorIds: selectedFloors,
            password,
          });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onSaved(result.notice ?? (isNew ? `${name} added` : `${name} updated`));
      onClose();
    });
  }

  return (
    <Modal
      title={isNew ? "Add person" : `Edit ${person.name || person.email}`}
      description={isNew ? "They sign in with this email and the password you set." : person.email ?? undefined}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost mr-auto" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="person-form" className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : isNew ? "Add person" : "Save changes"}
          </button>
        </>
      }
    >
      <form id="person-form" action={onSubmit} className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="label">Full name</span>
            <input className="field" name="name" defaultValue={person?.name ?? ""} required minLength={2} autoFocus={isNew} />
          </label>
          <label>
            <span className="label">Work email</span>
            {isNew ? (
              <input className="field" name="email" type="email" required placeholder="name@company.com" />
            ) : (
              <input className="field" value={person.email ?? ""} disabled readOnly />
            )}
          </label>
        </div>

        <fieldset>
          <legend className="label">Role</legend>
          {locked ? <p className="hint mb-2">You can&apos;t change your own role.</p> : null}
          <div className="grid gap-2 sm:grid-cols-3">
            {ROLES.map((item) => {
              const checked = role === item;
              return (
                <label
                  key={item}
                  className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition-colors ${
                    checked ? "border-signal bg-signal-soft/50 ring-1 ring-signal" : "border-line-strong hover:border-muted"
                  } ${locked ? "pointer-events-none opacity-60" : ""}`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="role"
                      value={item}
                      checked={checked}
                      disabled={locked}
                      onChange={() => setRole(item)}
                    />
                    <span className="text-sm font-semibold">{ROLE_LABEL[item]}</span>
                  </span>
                  <span className="text-xs leading-snug text-muted">{ROLE_DESCRIPTION[item]}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {role === "FLOOR_ADMIN" ? (
          <fieldset>
            <legend className="label">Floors they manage</legend>
            {floors.length === 0 ? (
              <p className="hint">Add a floor first, then assign it here.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {floors.map((floor) => (
                  <button
                    key={floor.id}
                    type="button"
                    className="chip"
                    aria-pressed={selectedFloors.includes(floor.id)}
                    onClick={() => toggleFloor(floor.id)}
                  >
                    <span className="font-mono text-[11px] opacity-70">{floor.number}</span>
                    {floor.name}
                    {!floor.active ? <span className="text-[11px] opacity-70">(off)</span> : null}
                  </button>
                ))}
              </div>
            )}
            {selectedFloors.length === 0 && floors.length > 0 ? (
              <p className="hint">Pick at least one floor.</p>
            ) : null}
          </fieldset>
        ) : null}

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="label mb-0">{isNew ? "Password" : "New password"}</span>
            <button
              type="button"
              className="text-xs font-semibold text-signal hover:underline"
              onClick={() => {
                setPassword(generatePassword());
                setRevealKey((key) => key + 1);
              }}
            >
              Generate one
            </button>
          </div>
          <PasswordInput
            key={revealKey}
            initiallyVisible={revealKey > 0}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            required={isNew}
            placeholder={isNew ? "At least 8 characters" : "Leave blank to keep the current one"}
          />
          <p className="hint">Share it with them privately. They can change it with &ldquo;Forgot password&rdquo;.</p>
        </div>

        {!isNew ? (
          <label className={`flex items-center justify-between gap-3 rounded-xl border border-line p-3 ${locked ? "opacity-60" : ""}`}>
            <span>
              <span className="block text-sm font-semibold">Can sign in</span>
              <span className="block text-xs text-muted">Turn off to block access without deleting the account.</span>
            </span>
            <Switch checked={locked ? true : active} disabled={locked} onChange={setActive} />
          </label>
        ) : null}

        {error ? <Alert>{error}</Alert> : null}
      </form>
    </Modal>
  );
}

/* ---------------- Floors ---------------- */

function FloorsTab({
  floors,
  onAdd,
  onEdit,
}: {
  floors: FloorRow[];
  onAdd: () => void;
  onEdit: (floor: FloorRow) => void;
}) {
  if (floors.length === 0) {
    return (
      <EmptyState
        icon={<BuildingIcon className="size-6" />}
        title="No floors yet"
        body="Add each floor that receives visitors. Floor admins are then assigned to them."
        action={
          <button type="button" className="btn btn-primary" onClick={onAdd}>
            <PlusIcon className="size-4" />
            Add floor
          </button>
        }
      />
    );
  }

  return (
    <ul className="card divide-y divide-line overflow-hidden">
      {floors.map((floor) => (
        <li key={floor.id} className={`flex items-center gap-3 px-4 py-3 ${floor.active ? "" : "bg-panel-2/60"}`}>
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-medium ${
              floor.active ? "bg-ink text-white" : "bg-idle-soft text-idle"
            }`}
          >
            {floor.number}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`truncate font-semibold ${floor.active ? "" : "text-muted"}`}>{floor.name}</span>
              {floor.active ? (
                <span className="badge bg-cleared-soft text-cleared">Active</span>
              ) : (
                <span className="badge bg-idle-soft text-idle">Off</span>
              )}
            </div>
            <p className="text-sm text-muted">
              {floor.adminCount === 0 ? (
                <span className="font-semibold text-expected">No floor admin</span>
              ) : (
                `${floor.adminCount} floor admin${floor.adminCount === 1 ? "" : "s"}`
              )}
              {" · "}
              {floor.guestCount} guest{floor.guestCount === 1 ? "" : "s"} all time
            </p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm shrink-0" onClick={() => onEdit(floor)}>
            <PencilIcon className="size-3.5" />
            <span className="hidden sm:inline">Edit</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function FloorModal({
  floor,
  onClose,
  onSaved,
}: {
  floor: FloorRow | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const router = useRouter();
  const isNew = !floor;
  const [active, setActive] = useState(floor?.active ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    const name = String(formData.get("name") ?? "");
    startTransition(async () => {
      const result = await saveFloor({
        id: floor?.id,
        name,
        number: Number(formData.get("number")),
        active: isNew ? undefined : active,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onSaved(isNew ? `${name} added` : `${name} saved`);
      onClose();
    });
  }

  function remove() {
    if (!floor) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteFloor(floor.id);
      if (!result.ok) {
        setConfirmDelete(false);
        setError(result.error);
        return;
      }
      router.refresh();
      onSaved(`${floor.name} deleted`);
      onClose();
    });
  }

  if (confirmDelete && floor) {
    return (
      <ConfirmDialog
        title={`Delete ${floor.name}?`}
        body="This removes the floor for good. Floor admins assigned to it will lose access to it."
        confirmLabel="Delete floor"
        danger
        pending={pending}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
    );
  }

  return (
    <Modal
      title={isNew ? "Add floor" : `Edit ${floor.name}`}
      onClose={onClose}
      footer={
        <>
          {!isNew ? (
            <button
              type="button"
              className="btn btn-ghost mr-auto text-danger hover:bg-danger-soft hover:text-danger"
              disabled={pending || floor.guestCount > 0}
              title={floor.guestCount > 0 ? "This floor has guests. Turn it off instead." : undefined}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </button>
          ) : (
            <button type="button" className="btn btn-ghost mr-auto" onClick={onClose}>
              Cancel
            </button>
          )}
          <button type="submit" form="floor-form" className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : isNew ? "Add floor" : "Save changes"}
          </button>
        </>
      }
    >
      <form id="floor-form" action={onSubmit} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-[7rem_1fr]">
          <label>
            <span className="label">Number</span>
            <input
              className="field font-mono"
              name="number"
              type="number"
              min={0}
              max={200}
              defaultValue={floor?.number}
              required
              autoFocus={isNew}
            />
          </label>
          <label>
            <span className="label">Name</span>
            <input className="field" name="name" defaultValue={floor?.name ?? ""} placeholder="e.g. 6th floor – Finance" required minLength={2} />
          </label>
        </div>

        {!isNew ? (
          <label className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
            <span>
              <span className="block text-sm font-semibold">Active</span>
              <span className="block text-xs text-muted">Off hides the floor from reception and floor admins.</span>
            </span>
            <Switch checked={active} onChange={setActive} />
          </label>
        ) : null}

        {!isNew && floor.guestCount > 0 ? (
          <p className="hint">This floor has guest history, so it can&apos;t be deleted. Turn it off instead.</p>
        ) : null}

        {error ? <Alert>{error}</Alert> : null}
      </form>
    </Modal>
  );
}

function Switch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-cleared" : "bg-line-strong"
      }`}
    >
      <span
        className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
