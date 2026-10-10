import jwt from "jsonwebtoken";
import { z } from "zod";

const claimsSchema = z.object({
  sub: z.string().min(1),
  username: z.string().min(1),
  rating: z.number().int(),
  isGuest: z.boolean(),
});

export interface SocketUser {
  id: string;
  username: string;
  rating: number;
  isGuest: boolean;
}

export class AuthError extends Error {}

/** Verify the short-lived JWT minted by the web app. Throws AuthError. */
export function verifySocketToken(token: string, secret: string): SocketUser {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, secret);
  } catch {
    throw new AuthError("invalid or expired token");
  }
  const parsed = claimsSchema.safeParse(decoded);
  if (!parsed.success) throw new AuthError("malformed token claims");
  return {
    id: parsed.data.sub,
    username: parsed.data.username,
    rating: parsed.data.rating,
    isGuest: parsed.data.isGuest,
  };
}

/** Mint a socket JWT (used by the web app flow, tests, and the load script). */
export function signSocketToken(
  user: SocketUser,
  secret: string,
  ttlSeconds: number,
): string {
  return jwt.sign(
    { sub: user.id, username: user.username, rating: user.rating, isGuest: user.isGuest },
    secret,
    { expiresIn: ttlSeconds },
  );
}
