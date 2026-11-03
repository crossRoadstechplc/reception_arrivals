import type { Role } from "@/lib/types";

export function homePath(role: Role) {
  if (role === "SUPER_ADMIN") return "/admin";
  if (role === "FLOOR_STAFF") return "/floor";
  return "/reception";
}

export function navItems(role: Role, current: "reception" | "floor" | "admin") {
  const items: { href: string; label: string; active: boolean }[] = [];
  if (role === "RECEPTION" || role === "SUPER_ADMIN") {
    items.push({ href: "/reception", label: "Reception", active: current === "reception" });
  }
  if (role === "FLOOR_STAFF" || role === "SUPER_ADMIN") {
    items.push({ href: "/floor", label: "Floor guests", active: current === "floor" });
  }
  if (role === "SUPER_ADMIN") {
    items.push({ href: "/admin", label: "Admin", active: current === "admin" });
  }
  return items;
}
