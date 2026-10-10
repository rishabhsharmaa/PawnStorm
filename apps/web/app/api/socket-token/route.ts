import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import jwt from "jsonwebtoken";
import { SOCKET_TOKEN_TTL_SECONDS } from "@pawnstorm/shared";
import { authOptions } from "@/lib/auth";

/** Mint the short-lived JWT the browser uses to authenticate the game socket. */
export async function GET(): Promise<Response> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const secret = process.env.GAME_SERVER_JWT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  const token = jwt.sign(
    {
      sub: session.user.id,
      username: session.user.name ?? "Guest",
      rating: session.user.rating ?? 1200,
      isGuest: session.user.isGuest ?? false,
    },
    secret,
    { expiresIn: SOCKET_TOKEN_TTL_SECONDS },
  );
  return NextResponse.json({ token });
}
