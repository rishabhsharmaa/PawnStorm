import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@pawnstorm/db";
import { ReviewClient } from "@/components/ReviewClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Analyze game — Pawnstorm",
  description: "Engine analysis with eval graph and blunder flags.",
};

export default async function ReviewPage({ params }: { params: { id: string } }): Promise<JSX.Element> {
  const game = await prisma.game.findUnique({
    where: { id: params.id },
    include: {
      white: { select: { username: true } },
      black: { select: { username: true } },
    },
  });
  if (!game) notFound();

  return (
    <ReviewClient
      game={{
        id: game.id,
        pgn: game.pgn,
        result: game.result,
        termination: game.termination,
        timeControl: game.timeControl,
        white: {
          username: game.white.username,
          ratingBefore: game.whiteRatingBefore,
          ratingAfter: game.whiteRatingAfter,
        },
        black: {
          username: game.black.username,
          ratingBefore: game.blackRatingBefore,
          ratingAfter: game.blackRatingAfter,
        },
      }}
    />
  );
}
