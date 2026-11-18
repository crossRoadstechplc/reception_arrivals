import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { verifyLoginCode } from "@/lib/login-code";
import { verifyPassword } from "@/lib/password";
import type { Role } from "@/lib/types";

// A localhost AUTH_URL copied into Vercel would send people to localhost after
// sign-in. On Vercel, drop it so sign-in uses the address the visitor came from.
if (process.env.VERCEL) {
  for (const key of ["AUTH_URL", "NEXTAUTH_URL"] as const) {
    if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/i.test(process.env[key] ?? "")) {
      delete process.env[key];
    }
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  trustHost: true,
  session: {
    strategy: "jwt",
    // Renewed while in use (components/session-keep-alive.tsx), so this only ends after 6 months away.
    maxAge: 180 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    // Sign in with a 6-digit code sent by email.
    Credentials({
      id: "email-code",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Code", type: "text" },
      },
      async authorize(credentials) {
        const userId = await verifyLoginCode(String(credentials?.email ?? ""), String(credentials?.code ?? ""));
        if (!userId) return null;
        const user = await db.user.findUnique({ where: { id: userId } });
        if (!user?.active || !user.email) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await db.user.findUnique({ where: { email } });
        if (!user?.active || !user.passwordHash || !user.email) return null;

        const matches = await verifyPassword(password, user.passwordHash);
        if (!matches) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      const id = typeof token.id === "string" ? token.id : undefined;
      if (!id) return session;
      let dbUser;
      try {
        dbUser = await db.user.findUnique({ where: { id } });
      } catch (error) {
        // A database hiccup must not sign anyone out: an error here would clear their cookie.
        console.error("Session check could not reach the database", error);
        session.user.id = id;
        session.user.role = token.role as Role;
        return session;
      }
      if (!dbUser?.active || !dbUser.email) return session;
      session.user.id = dbUser.id;
      session.user.role = dbUser.role as Role;
      session.user.email = dbUser.email;
      session.user.name = dbUser.name;
      return session;
    },
  },
});
