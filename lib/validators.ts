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
});

export const floorInputSchema = z.object({
  name: z.string().trim().min(2, "Enter a floor name").max(80),
  number: z.coerce.number().int().min(0).max(200),
  active: z.boolean().optional(),
});

const passwordSchema = z.string().min(8, "Use at least 8 characters").max(200);

export const optionalPasswordSchema = z.union([z.literal(""), passwordSchema]);

const floorMembership = z.object({
  floorId: z.string().min(1),
  role: z.enum(["ADMIN", "MEMBER"]),
});

export const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  name: z.string().trim().min(2, "Enter a name").max(80),
  /** Blank means "email them an invite link to set their own password". */
  password: optionalPasswordSchema,
  role: z.enum(["RECEPTION", "FLOOR_STAFF", "SUPER_ADMIN"]),
  floors: z.array(floorMembership).default([]),
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
