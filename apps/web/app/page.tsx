import Link from "next/link";
import { prisma } from "@pawnstorm/db";
import { DemoBoard } from "@/components/DemoBoard";

export const dynamic = "force-dynamic";

async function getStats(): Promise<{ games: number; players: number }> {
  try {
    const [games, players] = await Promise.all([
      prisma.game.count(),
      prisma.user.count({ where: { isGuest: false } }),
    ]);
    return { games, players };
  } catch {
    return { games: 0, players: 0 };
  }
}

async function getTopPlayers(): Promise<{ username: string; rating: number }[]> {
  try {
    return await prisma.user.findMany({
      where: { isGuest: false },
      orderBy: { rating: "desc" },
      take: 5,
      select: { username: true, rating: true },
    });
  } catch {
    return [];
  }
}

export default async function HomePage(): Promise<JSX.Element> {
  const [stats, top] = await Promise.all([getStats(), getTopPlayers()]);

  return (
    <div className="flex flex-col gap-10">
      <section className="grid items-center gap-8 md:grid-cols-2">
        <div>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Real-time chess,
            <br />
            zero excuses.
          </h1>
          <p className="mt-4 max-w-md text-lg text-stone-600 dark:text-stone-300">
            Rated online games with server-side clocks, a tireless computer
            opponent, and engine analysis for every game. Play as a guest or
            create an account.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/play/online"
              className="rounded-md bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700"
            >
              Play online
            </Link>
            <Link
              href="/play/computer"
              className="rounded-md border border-stone-300 px-6 py-3 font-semibold hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
            >
              Vs computer
            </Link>
          </div>
          <dl className="mt-8 flex gap-8 text-sm">
            <div>
              <dt className="text-stone-500">Games played</dt>
              <dd className="text-2xl font-bold tabular-nums">{stats.games}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Registered players</dt>
              <dd className="text-2xl font-bold tabular-nums">{stats.players}</dd>
            </div>
          </dl>
        </div>
        <div className="mx-auto w-full max-w-md">
          <DemoBoard />
        </div>
      </section>

      <section aria-label="How it works">
        <h2 className="text-xl font-bold">How it works</h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            ["1", "Pick a game", "Bullet, blitz, or rapid — matched by rating. Guests welcome."],
            ["2", "Play live", "Every move validated server-side with authoritative clocks."],
            ["3", "Review", "Engine evals, blunder flags, and rating history after each game."],
          ].map(([n, title, body]) => (
            <li key={n} className="flex gap-3 rounded-lg bg-white p-4 dark:bg-stone-900">
              <span
                aria-hidden="true"
                className="text-3xl font-extrabold tabular-nums text-emerald-700 dark:text-emerald-500"
              >
                {n}
              </span>
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="block text-sm text-stone-600 dark:text-stone-400">{body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Top players" className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-bold">Top players</h2>
          {top.length === 0 ? (
            <p className="mt-2 text-sm text-stone-500">
              No rated games yet — be the first on the board.
            </p>
          ) : (
            <ol className="mt-2 divide-y divide-stone-200 rounded-lg bg-white dark:divide-stone-800 dark:bg-stone-900">
              {top.map((p, i) => (
                <li key={p.username} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="w-6 font-mono text-stone-500">{i + 1}.</span>
                  <Link
                    href={`/profile/${p.username}`}
                    className="font-semibold hover:underline"
                  >
                    {p.username}
                  </Link>
                  <span className="ml-auto font-mono tabular-nums">{p.rating}</span>
                </li>
              ))}
            </ol>
          )}
          <Link
            href="/leaderboard"
            className="mt-3 inline-block text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-500"
          >
            Full leaderboard →
          </Link>
        </div>
        <div className="rounded-lg bg-emerald-700 p-6 text-white">
          <h2 className="text-xl font-bold">New to the game?</h2>
          <p className="mt-2 text-sm text-emerald-100">
            Start against the computer on level 1, then take your rating online
            when you are ready. Your games are saved for review either way.
          </p>
          <Link
            href="/play/computer"
            className="mt-4 inline-block rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
          >
            Play the computer
          </Link>
        </div>
      </section>
    </div>
  );
}
