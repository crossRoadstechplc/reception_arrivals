export const ROLES = ["RECEPTION", "FLOOR_STAFF", "SUPER_ADMIN"] as const;
export type Role = (typeof ROLES)[number];

/** Role a person has on one floor. A person can hold different roles on different floors. */
export const FLOOR_ROLES = ["ADMIN", "MEMBER"] as const;
export type FloorRole = (typeof FLOOR_ROLES)[number];

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
  FLOOR_STAFF: "Floor staff",
  SUPER_ADMIN: "Super admin",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  RECEPTION: "Sees every floor's guests and checks them in at the front desk.",
  FLOOR_STAFF: "Works on one or more floors, as a floor admin or a member.",
  SUPER_ADMIN: "Full access: board, every floor, people, and floors.",
};

export const FLOOR_ROLE_LABEL: Record<FloorRole, string> = {
  ADMIN: "Floor admin",
  MEMBER: "Member",
};

export const FLOOR_ROLE_DESCRIPTION: Record<FloorRole, string> = {
  ADMIN: "Sees every guest on the floor and manages the floor team.",
  MEMBER: "Adds and sees only their own guests.",
};

export const STATUS_LABEL: Record<GuestStatus, string> = {
  EXPECTED: "Expected",
  ARRIVED: "In lobby",
  CLEARED: "Cleared",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};

/** Sentinel value for "host has no account, type their name". */
export const OTHER_HOST = "__other__";
