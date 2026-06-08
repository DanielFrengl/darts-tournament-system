import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/password";
import { LoginSchema } from "@/lib/validation";
import type { Role } from "@/lib/roles";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Required behind a reverse proxy (Railway, Fly, etc.) so NextAuth
  // honors X-Forwarded-Host / X-Forwarded-Proto.
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = LoginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const [u] = await db.select().from(users).where(eq(users.email, email));
        if (!u) return null;
        const ok = await verifyPassword(password, u.passwordHash);
        if (!ok) return null;
        return {
          id: u.id,
          email: u.email,
          name: u.username,
          image: u.avatarUrl,
          role: u.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role: Role }).role;
        return token;
      }
      // On subsequent requests, re-read the role from the DB so role
      // promotions/demotions take effect without forcing a re-login.
      if (token.id) {
        const [u] = await db
          .select({ role: users.role })
          .from(users)
          .where(eq(users.id, token.id as string));
        if (u) token.role = u.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }
  interface User {
    role: Role;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}
