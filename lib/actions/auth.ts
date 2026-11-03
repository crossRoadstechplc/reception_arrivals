"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/mail";
import { hashPassword, hashResetToken, newResetToken } from "@/lib/password";

export type LoginState = { error?: string } | null;
export type ResetRequestState = { error?: string; sent?: boolean } | null;
export type ResetState = { error?: string; done?: boolean } | null;

function isRedirect(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: unknown }).digest).includes("NEXT_REDIRECT")
  );
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) {
    return { error: "Enter your email and password." };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/",
    });
  } catch (error) {
    if (isRedirect(error)) throw error;
    if (error instanceof AuthError) {
      const cause = error.cause instanceof Error ? error.cause.message : "";
      if (/prepared statement|Can't reach database|ConnectorError|ECONNREFUSED/i.test(cause)) {
        return {
          error: "Could not reach the database. Check DATABASE_URL in .env, then restart the app.",
        };
      }
      return { error: "Email or password is wrong." };
    }
    console.error(error);
    return {
      error: "Could not reach the database. Check DATABASE_URL in .env, then try again.",
    };
  }

  return null;
}

export async function requestPasswordReset(
  _prev: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }

  try {
    const user = await db.user.findUnique({ where: { email } });
    // Also works for invited people who never set a password (lost invite email).
    if (user?.active) {
      const { token, tokenHash } = newResetToken();
      const expires = new Date(Date.now() + 60 * 60 * 1000);
      await db.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await db.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expires },
      });
      const base = process.env.AUTH_URL || "http://localhost:3000";
      await sendPasswordResetEmail(
        email,
        `${base}/reset-password?token=${encodeURIComponent(token)}`,
      );
    }
  } catch (error) {
    console.error(error);
    return {
      error: "Could not send the reset email. Check the SMTP settings and try again.",
    };
  }

  return { sent: true };
}

export async function resetPassword(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { error: "Use at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }
  if (!token) {
    return { error: "This reset link is invalid or expired." };
  }

  try {
    const row = await db.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(token) },
    });
    if (!row || row.expires < new Date()) {
      return { error: "This reset link is invalid or expired." };
    }

    await db.$transaction([
      db.user.update({
        where: { id: row.userId },
        data: { passwordHash: await hashPassword(password) },
      }),
      db.passwordResetToken.deleteMany({ where: { userId: row.userId } }),
    ]);
  } catch (error) {
    console.error(error);
    return { error: "Could not save the new password. Try again." };
  }

  return { done: true };
}
