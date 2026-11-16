import { createHash } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { NextResponse } from "next/server";
import { loadAppUser, type AppUser } from "@/lib/permissions";

/**
 * Sign-in for the Android app. The app sends email + password once and gets a
 * long-lived bearer token. The token stops working when the person is
 * deactivated, loses floor access, or changes their password.
 */

const TOKEN_DAYS = 90;

function secretKey() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set.");
  // A separate key from the website's session cookies.
  return createHash("sha256").update(`arrival-desk-mobile:${secret}`).digest();
}

/** Changes whenever the password changes, so old tokens stop working. */
function passwordVersion(passwordHash: string | null) {
  return createHash("sha256").update(passwordHash ?? "").digest("base64url").slice(0, 16);
}

/** The app is for floor staff (super admins act as floor admins everywhere). */
export function canUseApp(user: AppUser) {
  return user.role === "FLOOR_STAFF" || user.role === "SUPER_ADMIN";
}

export async function issueMobileToken(user: AppUser) {
  return new SignJWT({ pv: passwordVersion(user.passwordHash) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setAudience("arrival-desk-mobile")
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_DAYS}d`)
    .sign(secretKey());
}

/** The signed-in app user for this request, or null. */
export async function mobileUser(request: Request): Promise<AppUser | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { audience: "arrival-desk-mobile" });
    if (!payload.sub) return null;
    const user = await loadAppUser(payload.sub);
    if (!user || !canUseApp(user)) return null;
    if (payload.pv !== passwordVersion(user.passwordHash)) return null;
    return user;
  } catch {
    return null;
  }
}

export function unauthorized() {
  return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
}

/** Runs a handler with the app user, or answers 401. */
export async function withMobileUser(request: Request, handler: (user: AppUser) => Promise<Response>) {
  const user = await mobileUser(request);
  if (!user) return unauthorized();
  return handler(user);
}
