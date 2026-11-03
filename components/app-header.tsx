import Link from "next/link";
import { signOut } from "@/lib/auth";
import { PERSON_KIND_LABEL, personKind, type FloorRole, type Role } from "@/lib/types";
import { ArrivalChime } from "@/components/arrival-chime";
import { BoardIcon, ListIcon, LogoMark, LogoutIcon, SettingsIcon } from "@/components/icons";

const NAV_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  "/reception": BoardIcon,
  "/floor": ListIcon,
  "/admin": SettingsIcon,
};

function initialsOf(name: string | null, email: string | null) {
  const source = (name || email || "?").trim();
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (name && parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function AppHeader({
  user,
  items,
}: {
  user: { name: string | null; email: string | null; role: Role; floorAssignments?: { role: FloorRole }[] };
  items: { href: string; label: string; active: boolean }[];
}) {
  const roleLabel = PERSON_KIND_LABEL[personKind(user.role, (user.floorAssignments ?? []).map((a) => a.role))];
  return (
    <header className="sticky top-0 z-30 bg-ink text-console-text shadow-[0_1px_0_rgba(255,255,255,0.06)]">
      <ArrivalChime />
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-3 md:px-5">
        <Link href={items[0]?.href ?? "/"} className="flex shrink-0 items-center gap-2.5">
          <LogoMark className="size-8" />
          <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">Arrival Desk</span>
        </Link>

        {items.length > 1 ? (
          <nav className="scrollbar-none -my-1 flex min-w-0 flex-1 gap-1 overflow-x-auto py-1 sm:ml-4">
            {items.map((item) => {
              const Icon = NAV_ICON[item.href];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={item.active ? "page" : undefined}
                  className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors ${
                    item.active
                      ? "bg-white/12 text-white"
                      : "text-console-muted hover:bg-white/6 hover:text-white"
                  }`}
                >
                  {Icon ? <Icon className="size-4" /> : null}
                  {item.label}
                </Link>
              );
            })}
          </nav>
        ) : (
          <div className="flex-1" />
        )}

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden text-right leading-tight md:block">
            <div className="max-w-44 truncate text-sm font-semibold text-white">{user.name || user.email}</div>
            <div className="text-xs text-console-muted">{roleLabel}</div>
          </div>
          <span
            className="flex size-9 items-center justify-center rounded-full bg-console-panel text-xs font-bold text-white ring-1 ring-console-line"
            title={`${user.name || user.email} · ${roleLabel}`}
          >
            {initialsOf(user.name, user.email)}
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="flex size-9 items-center justify-center rounded-lg text-console-muted transition-colors hover:bg-white/8 hover:text-white"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogoutIcon className="size-[18px]" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
