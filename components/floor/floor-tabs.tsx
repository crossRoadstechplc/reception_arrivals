import Link from "next/link";
import { ListIcon, UserIcon } from "@/components/icons";

/** Guests / Team switcher, shown to floor admins. */
export function FloorTabs({
  floorId,
  current,
  multiFloor,
}: {
  floorId: string;
  current: "guests" | "team";
  multiFloor: boolean;
}) {
  const query = multiFloor ? `?floor=${floorId}` : "";
  const tabs = [
    { key: "guests", href: `/floor${query}`, label: "Guests", Icon: ListIcon },
    { key: "team", href: `/floor/team${query}`, label: "Team", Icon: UserIcon },
  ] as const;

  return (
    <div className="border-b border-line bg-panel">
      <nav className="mx-auto flex w-full max-w-5xl gap-1 px-3 md:px-5">
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
