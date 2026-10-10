"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function RegisterPage(): JSX.Element {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold">Create account</h1>
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          void fetch("/api/register", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ username, email, password }),
          })
            .then(async (res) => {
              if (!res.ok) {
                const data = (await res.json()) as { error?: string };
                throw new Error(data.error ?? "Registration failed");
              }
              const signin = await signIn("password", { email, password, redirect: false });
              if (!signin || signin.error) throw new Error("Account created — please log in.");
              router.push("/play/online");
            })
            .catch((err: Error) => {
              setError(err.message);
              setBusy(false);
            });
        }}
      >
        {error && (
          <p role="alert" className="rounded-md bg-red-100 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
            {error}
          </p>
        )}
        <label className="flex flex-col gap-1 text-sm font-medium">
          Username (3–16 chars, letters/numbers/_)
          <input
            type="text"
            required
            minLength={3}
            maxLength={16}
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="rounded-md border border-stone-300 bg-white px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
          />
        </label>
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
          Password (min 8 chars)
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
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
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-sm text-stone-500">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-emerald-700 hover:underline dark:text-emerald-500">
          Log in
        </Link>
        .
      </p>
    </div>
  );
}
