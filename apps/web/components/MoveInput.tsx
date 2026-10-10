"use client";

import { useState } from "react";

interface MoveInputProps {
  onSubmitMove: (text: string) => boolean;
  disabled?: boolean;
}

/** Keyboard move entry: accepts SAN ("Nf3", "O-O") or long algebraic ("e2e4"). */
export function MoveInput({ onSubmitMove, disabled }: MoveInputProps): JSX.Element {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      data-testid="move-form"
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        const ok = onSubmitMove(value);
        if (ok) {
          setValue("");
          setError(null);
        } else {
          setError(`Illegal move: ${value.trim()}`);
        }
      }}
    >
      <label htmlFor="move-input" className="sr-only">
        Enter a move in algebraic notation
      </label>
      <input
        id="move-input"
        data-testid="move-input"
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Move (e.g. Nf3)"
        autoComplete="off"
        spellCheck={false}
        className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
      />
      <button
        type="submit"
        disabled={disabled}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
      >
        Move
      </button>
      {error && (
        <span role="alert" className="self-center text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </form>
  );
}
