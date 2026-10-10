"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function LoginPage(): JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold">Log in</h1>
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          void signIn("password", { email, password, redirect: false }).then((res) => {
            setBusy(false);
            if (!res || res.error) {
              setError("Invalid email or password.");
            } else {
              router.push("/play/online");
            }
          });
        }}
      >
        {error && (
          <p role="alert" className="rounded-md bg-red-100 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
            {error}
          </p>
        )}
        <label className="flex flex-col gap-1 text-sm font-medium">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-stone-300 bg-white px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-stone-300 bg-white px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="mt-4 text-sm text-stone-500">
        No account?{" "}
        <Link href="/register" className="font-semibold text-emerald-700 hover:underline dark:text-emerald-500">
          Sign up
        </Link>{" "}
        or{" "}
        <button
          type="button"
          className="font-semibold text-emerald-700 hover:underline dark:text-emerald-500"
          onClick={() => void signIn("guest", { callbackUrl: "/play/online" })}
        >
          continue as guest
        </button>
        .
      </p>
    </div>
  );
}
