import Link from "next/link";
import { CalendarIcon, ListIcon, UserIcon } from "@/components/icons";

/** Guests / Calendar / Team switcher for the floor pages. Team is for floor admins only. */
export function FloorTabs({
  floorId,
  current,
  multiFloor,
  showTeam,
  date,
  wide = false,
}: {
  floorId: string;
  current: "guests" | "calendar" | "team";
  multiFloor: boolean;
  showTeam: boolean;
  /** Keep the chosen day when moving between Guests and Calendar. */
  date?: string;
  /** Match the calendar's wider page. */
  wide?: boolean;
}) {
  const query = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    if (multiFloor) params.set("floor", floorId);
    for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };
  const tabs = [
    { key: "guests", href: `/floor${query({ date })}`, label: "Guests", Icon: ListIcon },
    { key: "calendar", href: `/floor/calendar${query({ date })}`, label: "Calendar", Icon: CalendarIcon },
    ...(showTeam ? [{ key: "team", href: `/floor/team${query({})}`, label: "Team", Icon: UserIcon }] : []),
  ] as const;

  return (
    <div className="border-b border-line bg-panel">
      <nav className={`mx-auto flex w-full ${wide ? "max-w-7xl" : "max-w-5xl"} gap-1 px-3 md:px-5`}>
        {tabs.map(({ key, href, label, Icon }) => (
          <Link
            key={key}
            href={href}
            aria-current={current === key ? "page" : undefined}
            className={`-mb-px inline-flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors ${
              current === key ? "border-signal text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
