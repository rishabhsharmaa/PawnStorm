"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useSettingsStore } from "@/stores/useSettingsStore";

export function Header(): JSX.Element {
  const { data: session } = useSession();
  const { soundEnabled, darkMode, toggleSound, toggleDarkMode } = useSettingsStore();

  return (
    <header className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2" aria-label="Pawnstorm home">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-700 text-2xl text-white"
          >
            ♞
          </span>
          <span className="text-xl font-extrabold tracking-tight">Pawnstorm</span>
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1 text-sm font-medium">
          <Link
            href="/play/online"
            className="rounded-md px-3 py-2 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            Play online
          </Link>
          <Link
            href="/play/computer"
            className="rounded-md px-3 py-2 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            Computer
          </Link>
          <Link
            href="/leaderboard"
            className="rounded-md px-3 py-2 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            Leaderboard
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={soundEnabled}
            aria-label={soundEnabled ? "Mute sounds" : "Unmute sounds"}
            title={soundEnabled ? "Mute sounds" : "Unmute sounds"}
            className="rounded-md px-2 py-1.5 text-lg leading-none hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <span className={soundEnabled ? "" : "opacity-30"} aria-hidden="true">
              ♪
            </span>
          </button>
          <button
            type="button"
            onClick={toggleDarkMode}
            aria-pressed={darkMode}
            aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            title={darkMode ? "Light mode" : "Dark mode"}
            className="rounded-md px-2 py-1.5 text-lg leading-none hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <span aria-hidden="true">{darkMode ? "☀︎" : "☾"}</span>
          </button>
          {session?.user ? (
            <>
              <Link
                href={`/profile/${session.user.name}`}
                className="rounded-md px-3 py-2 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                {session.user.name}
              </Link>
              <button
                type="button"
                onClick={() => void signOut({ callbackUrl: "/" })}
                className="rounded-md px-3 py-2 text-sm font-medium text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-md px-3 py-2 text-sm font-medium hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
