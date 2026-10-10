import type { DefaultSession, NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@pawnstorm/db";

declare module "next-auth" {
  interface Session {
    user: { id: string; rating: number; isGuest: boolean } & DefaultSession["user"];
  }
  interface User {
    rating: number;
    isGuest: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    username: string;
    rating: number;
    isGuest: boolean;
  }
}

const passwordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function randomGuestName(): string {
  return `Guest-${Math.random().toString(36).slice(2, 8)}`;
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  providers: [
    CredentialsProvider({
      id: "password",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = passwordSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (!user || !user.passwordHash) return null;
        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          name: user.username,
          email: user.email,
          rating: user.rating,
          isGuest: user.isGuest,
        };
      },
    }),
    CredentialsProvider({
      id: "guest",
      name: "Guest",
      credentials: {},
      async authorize() {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const user = await prisma.user.create({
              data: { username: randomGuestName(), isGuest: true },
            });
            return { id: user.id, name: user.username, rating: user.rating, isGuest: true };
          } catch {
            // Likely a username collision; retry with a fresh name.
          }
        }
        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.username = user.name ?? "";
        token.rating = user.rating;
        token.isGuest = user.isGuest;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid ?? "";
        session.user.name = token.username ?? session.user.name;
        session.user.rating = token.rating ?? 1200;
        session.user.isGuest = token.isGuest ?? false;
      }
      return session;
    },
  },
};
