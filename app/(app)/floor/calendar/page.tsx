import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { FloorTabs } from "@/components/floor/floor-tabs";
import { GuestCalendar, type CalendarView } from "@/components/floor/guest-calendar";
import { db } from "@/lib/db";
import {
  dateParts,
  formatDateRange,
  formatOfficeDate,
  isISODate,
  mondayOf,
  officeMinutesNow,
  officeTodayISO,
  shiftISO,
  toDateOnly,
  weekdayOf,
} from "@/lib/dates";
import { byExpectedTime, guestScope, loadFloorContext, toFloorGuest } from "@/lib/floor-context";
import { requireRoles } from "@/lib/permissions";
import { navItems } from "@/lib/roles";

export const metadata: Metadata = { title: "Calendar" };

export default async function FloorCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; floor?: string; view?: string }>;
}) {
  const user = await requireRoles(["FLOOR_STAFF", "SUPER_ADMIN"]);
  const params = await searchParams;
  const today = officeTodayISO();
  const date = params.date && isISODate(params.date) ? params.date : today;
  const view: CalendarView = params.view === "day" ? "day" : "week";

  const { floors, floorId, myRole, isAdmin, hosts } = await loadFloorContext(user, params.floor);

  const first = view === "day" ? date : mondayOf(date);
  const last = view === "day" ? date : shiftISO(first, 6);

  const guests = floorId
    ? await db.guest.findMany({
        where: {
          floorId,
          visitDate: { gte: toDateOnly(first), lte: toDateOnly(last) },
          ...guestScope(user, isAdmin),
        },
        include: { hostUser: { select: { name: true, email: true } } },
      })
    : [];
  const items = guests.map(toFloorGuest).sort(byExpectedTime);

  // Week view: Monday to Friday, plus Saturday/Sunday only when something is on.
  const days: string[] = [];
  for (let i = 0; i <= (view === "day" ? 0 : 6); i++) {
    const iso = shiftISO(first, i);
    const weekend = weekdayOf(iso) === 0 || weekdayOf(iso) === 6;
    if (view === "day" || !weekend || iso === date || items.some((g) => g.visitDate === iso)) days.push(iso);
  }

  return (
    <main className="min-h-dvh bg-paper">
      <AppHeader user={user} items={navItems(user.role, "floor")} />
      {floorId ? (
        <FloorTabs
          floorId={floorId}
          current="calendar"
          multiFloor={floors.length > 1}
          showTeam={isAdmin}
          date={params.date}
          wide
        />
      ) : null}
      <GuestCalendar
        view={view}
        date={date}
        today={today}
        rangeLabel={view === "day" ? formatOfficeDate(date) : formatDateRange(days[0], days[days.length - 1])}
        days={days.map((iso) => ({ iso, label: formatOfficeDate(iso), ...dateParts(iso) }))}
        officeMinutes={officeMinutesNow()}
        floors={floors}
        floorId={floorId}
        myRole={myRole}
        currentUserId={user.id}
        hosts={hosts}
        guests={items}
      />
    </main>
  );
}
