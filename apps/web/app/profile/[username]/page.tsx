import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@pawnstorm/db";
import { RatingChart } from "@/components/RatingChart";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { username: string };
}): Promise<Metadata> {
  const username = decodeURIComponent(params.username);
  return { title: `${username} — Pawnstorm`, description: `Rating, games, and history for ${username}.` };
}

const TERMINATION_LABELS: Record<string, string> = {
  CHECKMATE: "checkmate",
  RESIGN: "resignation",
  TIMEOUT: "time",
  STALEMATE: "stalemate",
  AGREEMENT: "agreement",
  INSUFFICIENT_MATERIAL: "material",
  THREEFOLD: "repetition",
  FIFTY_MOVE: "50 moves",
  ABANDONED: "abandoned",
};

export default async function ProfilePage({
  params,
}: {
  params: { username: string };
}): Promise<JSX.Element> {
  const user = await prisma.user.findUnique({
    where: { username: decodeURIComponent(params.username) },
    select: { id: true, username: true, rating: true, isGuest: true, createdAt: true },
  });
  if (!user) notFound();

  const [games, history] = await Promise.all([
    prisma.game.findMany({
      where: { OR: [{ whiteId: user.id }, { blackId: user.id }] },
      orderBy: { endedAt: "desc" },
      take: 20,
      include: {
        white: { select: { username: true } },
        black: { select: { username: true } },
      },
    }),
    prisma.ratingHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: { ratingAfter: true, createdAt: true },
    }),
  ]);

  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const g of games) {
    if (g.result === "DRAW") draws++;
    else if ((g.result === "WHITE_WIN") === (g.whiteId === user.id)) wins++;
    else losses++;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <section className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{user.username}</h1>
          <p className="text-sm text-stone-500">
            {user.isGuest ? "Guest player" : `Member since ${formatDate(user.createdAt)}`}
          </p>
        </div>
        <dl className="ml-auto flex gap-6 text-sm">
          <div>
            <dt className="text-stone-500">Rating</dt>
            <dd className="text-2xl font-bold tabular-nums">{user.rating}</dd>
          </div>
          <div>
            <dt className="text-stone-500">W / L / D</dt>
            <dd className="text-2xl font-bold tabular-nums">
              {wins} / {losses} / {draws}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-label="Rating history" className="rounded-lg bg-white p-4 dark:bg-stone-900">
        <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">Rating</h2>
        <RatingChart
          points={history.map((h) => ({ ratingAfter: h.ratingAfter, createdAt: h.createdAt.toISOString() }))}
          current={user.rating}
        />
      </section>

      <section aria-label="Recent games">
        <h2 className="text-lg font-bold">Recent games</h2>
        {games.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">No games yet.</p>
        ) : (
          <ol className="mt-2 divide-y divide-stone-200 rounded-lg bg-white dark:divide-stone-800 dark:bg-stone-900">
            {games.map((g) => {
              const asWhite = g.whiteId === user.id;
              const opponent = asWhite ? g.black.username : g.white.username;
              const mine = asWhite ? "White" : "Black";
              const outcome =
                g.result === "DRAW" ? "½–½" : (g.result === "WHITE_WIN") === asWhite ? "1–0" : "0–1";
              const delta = asWhite
                ? g.whiteRatingAfter - g.whiteRatingBefore
                : g.blackRatingAfter - g.blackRatingBefore;
              return (
                <li key={g.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span
                    className={`w-10 text-center font-mono font-bold ${
                      outcome === "½–½"
                        ? "text-stone-500"
                        : outcome === "1–0"
                          ? "text-emerald-600"
                          : "text-red-500"
                    }`}
                  >
                    {outcome}
                  </span>
                  <span className="min-w-0">
                    <Link
                      href={`/profile/${opponent}`}
                      className="font-semibold hover:underline"
                    >
                      {opponent}
                    </Link>
                    <span className="text-stone-500">
                      {" "}
                      · {mine} · {TERMINATION_LABELS[g.termination] ?? g.termination} ·{" "}
                      {g.timeControl}
                    </span>
                  </span>
                  <span className="ml-auto flex items-center gap-3">
                    <span
                      className={`font-mono tabular-nums ${delta >= 0 ? "text-emerald-600" : "text-red-500"}`}
                    >
                      {delta >= 0 ? `+${delta}` : delta}
                    </span>
                    <span className="hidden text-stone-500 sm:inline">
                      {formatDate(g.endedAt)}
                    </span>
                    <Link
                      href={`/review/${g.id}`}
                      className="font-semibold text-emerald-700 hover:underline dark:text-emerald-500"
                    >
                      Review
                    </Link>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
