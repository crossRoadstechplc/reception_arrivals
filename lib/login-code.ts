import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { sendLoginCodeEmail, smtpConfigured } from "@/lib/mail";

/**
 * Sign in with a 6-digit code sent by email, on the website and the Android app.
 *
 * Codes live in the verification_tokens table, stored only as a keyed hash.
 * A code lasts 10 minutes, works once, and is cancelled after 5 wrong tries.
 */

const CODE_MINUTES = 10;
const MAX_TRIES = 5;
const MAX_SENDS = 5;
const SEND_WINDOW_MINUTES = 15;

const codeKey = (userId: string) => `login-code:${userId}`;
const tryKey = (userId: string) => `login-try:${userId}`;
const sendKey = (email: string) => `login-send:${email}`;

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60 * 1000);
const normalize = (email: string) => email.trim().toLowerCase();

function hashCode(userId: string, code: string) {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set.");
  return createHmac("sha256", secret).update(`${userId}:${code}`).digest("hex");
}

function sameHash(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type CodeRequestResult = { ok: true } | { ok: false; error: string };

/** Emails a code. Answers the same way whether or not the email has an account. */
export async function requestLoginCode(rawEmail: string): Promise<CodeRequestResult> {
  const email = normalize(rawEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (!smtpConfigured()) return { ok: false, error: "Email codes aren't available right now. Use your password instead." };

  const now = new Date();
  await db.verificationToken.deleteMany({ where: { identifier: { startsWith: "login-" }, expires: { lt: now } } });

  const sends = await db.verificationToken.count({ where: { identifier: sendKey(email) } });
  if (sends >= MAX_SENDS) return { ok: false, error: "Too many codes requested. Wait a few minutes and try again." };
  await db.verificationToken.create({
    data: { identifier: sendKey(email), token: randomBytes(16).toString("hex"), expires: minutesFromNow(SEND_WINDOW_MINUTES) },
  });

  const user = await db.user.findUnique({ where: { email } });
  if (!user?.active || !user.email) return { ok: true };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  // A new code replaces any earlier one and resets the wrong-try count.
  await db.verificationToken.deleteMany({ where: { identifier: { in: [codeKey(user.id), tryKey(user.id)] } } });
  await db.verificationToken.create({
    data: { identifier: codeKey(user.id), token: hashCode(user.id, code), expires: minutesFromNow(CODE_MINUTES) },
  });

  try {
    await sendLoginCodeEmail({ email: user.email, code, minutes: CODE_MINUTES });
  } catch (error) {
    console.error("Sign-in code email failed", error);
    await db.verificationToken.deleteMany({ where: { identifier: codeKey(user.id) } });
    return { ok: false, error: "Couldn't send the code. Try again, or use your password." };
  }
  return { ok: true };
}

/** Checks a code. Returns the user's id when it is right; the code then can't be used again. */
export async function verifyLoginCode(rawEmail: string, rawCode: string): Promise<string | null> {
  const code = rawCode.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return null;

  const user = await db.user.findUnique({ where: { email: normalize(rawEmail) } });
  if (!user?.active) return null;

  const stored = await db.verificationToken.findFirst({
    where: { identifier: codeKey(user.id), expires: { gt: new Date() } },
  });
  if (!stored) return null;

  // Count the try before checking, so guesses sent at the same moment can't get extra attempts.
  await db.verificationToken.create({
    data: { identifier: tryKey(user.id), token: randomBytes(16).toString("hex"), expires: stored.expires },
  });
  const tries = await db.verificationToken.count({ where: { identifier: tryKey(user.id) } });
  if (tries > MAX_TRIES) {
    await db.verificationToken.deleteMany({ where: { identifier: { in: [codeKey(user.id), tryKey(user.id)] } } });
    return null;
  }

  if (!sameHash(stored.token, hashCode(user.id, code))) return null;

  // Only one request can claim the code.
  const claimed = await db.verificationToken.deleteMany({ where: { identifier: codeKey(user.id), token: stored.token } });
  if (claimed.count !== 1) return null;
  await db.verificationToken.deleteMany({ where: { identifier: tryKey(user.id) } });
  // Marks an invited person as having joined.
  if (!user.emailVerified) await db.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
  return user.id;
}
