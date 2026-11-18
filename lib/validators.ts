import { z } from "zod";

const time = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:30");

export const guestInputSchema = z.object({
  floorId: z.string().min(1, "Choose a floor"),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  guestName: z.string().trim().min(2, "Enter the guest name").max(120),
  company: z.string().trim().max(120).optional().or(z.literal("")),
  hostUserId: z.string().optional().or(z.literal("")),
  hostName: z.string().trim().max(120).optional().or(z.literal("")),
  expectedArrival: time.optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  licensePlate: z.string().trim().max(20, "That plate number is too long").optional().or(z.literal("")),
  vehicle: z.string().trim().max(80).optional().or(z.literal("")),
  /** "Also notify": colleagues on the floor told about the visit. */
  notifyUserIds: z.array(z.string().min(1).max(64)).max(25, "That's too many people to notify").optional(),
  /** Meeting room: details to book, null for no room, left out to keep any booking in step with the visit. */
  booking: z
    .object({
      roomId: z.string().uuid("Choose a meeting room"),
      minutes: z.number().int().min(15, "Choose a meeting length").max(480, "Choose a shorter meeting"),
    })
    .nullable()
    .optional(),
});

export const floorInputSchema = z.object({
  name: z.string().trim().min(2, "Enter a floor name").max(80),
  company: z.string().trim().max(120).optional().or(z.literal("")),
  number: z.coerce.number().int().min(0).max(200),
  active: z.boolean().optional(),
});

const passwordSchema = z.string().min(8, "Use at least 8 characters").max(200);

export const optionalPasswordSchema = z.union([z.literal(""), passwordSchema]);

const floorMembership = z.object({
  floorId: z.string().min(1),
  role: z.enum(["ADMIN", "MEMBER"]),
});

/** A person's User ID: a UUID, or an ID from another system. */
export const externalIdSchema = z
  .string()
  .trim()
  .min(1, "Enter a User ID")
  .max(100, "Keep the User ID under 100 characters")
  .regex(/^[A-Za-z0-9._:-]+$/, "User IDs can use letters, numbers, dashes, dots, colons and underscores");

export const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  name: z.string().trim().min(2, "Enter a name").max(80),
  /** Blank means "email them an invite link to set their own password". */
  password: optionalPasswordSchema,
  role: z.enum(["RECEPTION", "FLOOR_STAFF", "SUPER_ADMIN"]),
  floors: z.array(floorMembership).default([]),
  /** Blank means a UUID is created automatically. */
  externalId: z.union([z.literal(""), externalIdSchema]).optional(),
});

export const teamMemberSchema = z.object({
  floorId: z.string().min(1),
  email: z.string().trim().email("Enter a valid email"),
  name: z.string().trim().max(80).optional().or(z.literal("")),
});

export function blankToNull(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
