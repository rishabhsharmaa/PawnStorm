"use client";

interface GameOverModalProps {
  title: string;
  subtitle?: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function GameOverModal({
  title,
  subtitle,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: GameOverModalProps): JSX.Element {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="game-over-modal"
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-2xl dark:bg-stone-900">
        <h2 className="text-2xl font-bold">{title}</h2>
        {subtitle && <p className="mt-2 text-sm text-stone-500">{subtitle}</p>}
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            autoFocus
            onClick={onPrimary}
            className="rounded-md bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700"
          >
            {primaryLabel}
          </button>
          {secondaryLabel && onSecondary && (
            <button
              type="button"
              onClick={onSecondary}
              className="rounded-md border border-stone-300 px-4 py-2.5 font-semibold hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
