export const ROLES = ["RECEPTION", "FLOOR_ADMIN", "SUPER_ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const GUEST_STATUSES = [
  "EXPECTED",
  "ARRIVED",
  "CLEARED",
  "CANCELLED",
  "NO_SHOW",
] as const;
export type GuestStatus = (typeof GUEST_STATUSES)[number];

export type ActionResult =
  | { ok: true; notice?: string }
  | { ok: false; error: string };

export const ROLE_LABEL: Record<Role, string> = {
  RECEPTION: "Reception",
  FLOOR_ADMIN: "Floor admin",
  SUPER_ADMIN: "Super admin",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  RECEPTION: "Sees every floor's guests and clears them at the front desk.",
  FLOOR_ADMIN: "Adds and edits guests for the floors you assign.",
  SUPER_ADMIN: "Full access: board, every floor, people, and floors.",
};

export const STATUS_LABEL: Record<GuestStatus, string> = {
  EXPECTED: "Expected",
  ARRIVED: "In lobby",
  CLEARED: "Cleared",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};
