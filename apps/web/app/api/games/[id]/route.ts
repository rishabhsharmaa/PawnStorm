import { NextResponse } from "next/server";
import { prisma } from "@pawnstorm/db";

/** Finished-game record for the game viewer and review page fallback. */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const game = await prisma.game.findUnique({
    where: { id: params.id },
    include: {
      white: { select: { username: true } },
      black: { select: { username: true } },
    },
  });
  if (!game) return NextResponse.json({ error: "game not found" }, { status: 404 });
  return NextResponse.json({
    game: {
      id: game.id,
      pgn: game.pgn,
      result: game.result,
      termination: game.termination,
      timeControl: game.timeControl,
      startedAt: game.startedAt.toISOString(),
      endedAt: game.endedAt.toISOString(),
      white: {
        id: game.whiteId,
        username: game.white.username,
        ratingBefore: game.whiteRatingBefore,
        ratingAfter: game.whiteRatingAfter,
      },
      black: {
        id: game.blackId,
        username: game.black.username,
        ratingBefore: game.blackRatingBefore,
        ratingAfter: game.blackRatingAfter,
      },
    },
  });
}
