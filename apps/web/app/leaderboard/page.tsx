import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@pawnstorm/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leaderboard — Pawnstorm",
  description: "Top rated Pawnstorm players.",
};

export default async function LeaderboardPage(): Promise<JSX.Element> {
  const players = await prisma.user.findMany({
    where: { isGuest: false },
    orderBy: { rating: "desc" },
    take: 50,
    select: {
      username: true,
      rating: true,
      _count: { select: { gamesAsWhite: true, gamesAsBlack: true } },
    },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Leaderboard</h1>
      <p className="mt-1 text-sm text-stone-500">
        Top rated players. Guests are rated for fair matchmaking but not ranked here.
      </p>
      {players.length === 0 ? (
        <p className="mt-6 text-stone-500">No ranked players yet.</p>
      ) : (
        <ol className="mt-4 divide-y divide-stone-200 rounded-lg bg-white dark:divide-stone-800 dark:bg-stone-900">
          {players.map((p, i) => (
            <li key={p.username} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-8 font-mono text-sm text-stone-500">{i + 1}.</span>
              <Link href={`/profile/${p.username}`} className="font-semibold hover:underline">
                {p.username}
              </Link>
              <span className="ml-auto text-sm text-stone-500">
                {p._count.gamesAsWhite + p._count.gamesAsBlack} games
              </span>
              <span className="w-14 text-right font-mono font-bold tabular-nums">{p.rating}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
