"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { TIME_CONTROLS, type TimeControlId } from "@pawnstorm/shared";
import { useOnlineGameStore } from "@/stores/useOnlineGameStore";

const ORDER: TimeControlId[] = ["1+0", "3+2", "5+3", "10+0", "15+10"];

export default function OnlinePage(): JSX.Element {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const [tc, setTc] = useState<TimeControlId>("5+3");
  const [connectError, setConnectError] = useState<string | null>(null);
  const store = useOnlineGameStore();

  useEffect(() => {
    if (!session) return;
    store.connect().catch((err: Error) => setConnectError(err.message));
  }, [session]);

  useEffect(() => {
    if (store.snapshot) router.push(`/game/${store.snapshot.gameId}`);
  }, [store.snapshot, router]);

  useEffect(() => {
    if (store.lastErrorCode === "ALREADY_IN_GAME" && store.errorGameId) {
      router.push(`/game/${store.errorGameId}`);
    }
  }, [store.lastErrorCode, store.errorGameId, router]);

  useEffect(
    () => () => {
      if (useOnlineGameStore.getState().status === "queuing") {
        useOnlineGameStore.getState().leaveQueue();
      }
    },
    [],
  );

  if (sessionStatus === "loading") {
    return <p className="text-stone-500">Loading…</p>;
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold">Play online</h1>
        <p className="mt-2 text-stone-600 dark:text-stone-300">
          Rated real-time games, matched by skill. Jump in as a guest or sign in
          to keep your rating and history.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => void signIn("guest", { callbackUrl: "/play/online" })}
            className="rounded-md bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700"
          >
            Continue as guest
          </button>
          <Link
            href="/login"
            className="rounded-md border border-stone-300 px-4 py-3 text-center font-semibold hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-md border border-stone-300 px-4 py-3 text-center font-semibold hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
          >
            Create account
          </Link>
        </div>
      </div>
    );
  }

  const queuing = store.status === "queuing";

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold">Play online</h1>
      <p className="mt-1 text-sm text-stone-500">
        Signed in as <span className="font-semibold">{session.user.name}</span> (
        {session.user.rating})
      </p>

      {(connectError || store.lastError) && (
        <div role="alert" className="mt-4 rounded-md bg-red-100 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
          {connectError ?? store.lastError}{" "}
          <button type="button" className="underline" onClick={() => { setConnectError(null); store.dismissError(); }}>
            Dismiss
          </button>
        </div>
      )}

      <fieldset className="mt-6" disabled={queuing}>
        <legend className="text-sm font-bold uppercase tracking-wide text-stone-500">
          Time control
        </legend>
        <div className="mt-2 grid grid-cols-1 gap-2" role="radiogroup" aria-label="Time control">
          {ORDER.map((id) => (
            <label
              key={id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 ${
                tc === id
                  ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950"
                  : "border-stone-300 dark:border-stone-700"
              }`}
            >
              <input
                type="radio"
                name="time-control"
                value={id}
                checked={tc === id}
                onChange={() => setTc(id)}
                className="h-4 w-4 accent-emerald-600"
              />
              <span className="font-semibold">{TIME_CONTROLS[id].label}</span>
              <span className="ml-auto text-sm text-stone-500">
                {id === "1+0" ? "Fast and frantic" : id.startsWith("3") || id.startsWith("5") ? "Blitz" : "Rapid"}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {queuing ? (
        <div className="mt-6 rounded-lg bg-white p-4 text-center dark:bg-stone-900">
          <p aria-live="polite" className="font-semibold">
            Finding an opponent… ({store.timeControl})
          </p>
          <p className="mt-1 text-sm text-stone-500">
            The rating window widens the longer you wait.
          </p>
          <button
            type="button"
            onClick={store.leaveQueue}
            className="mt-4 rounded-md border border-stone-300 px-6 py-2.5 font-semibold hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={!store.socket && !connectError}
          onClick={() => store.joinQueue(tc)}
          className="mt-6 w-full rounded-md bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          Find game
        </button>
      )}
    </div>
  );
}
