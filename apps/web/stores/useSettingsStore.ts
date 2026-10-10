"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  soundEnabled: boolean;
  darkMode: boolean;
  showCoordinates: boolean;
  toggleSound: () => void;
  toggleDarkMode: () => void;
  toggleCoordinates: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      soundEnabled: true,
      darkMode: true,
      showCoordinates: true,
      toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),
      toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
      toggleCoordinates: () => set((s) => ({ showCoordinates: !s.showCoordinates })),
    }),
    { name: "pawnstorm-settings" },
  ),
);

/** Sync the persisted theme with the <html> class (runs once in the header). */
export function applyTheme(darkMode: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", darkMode);
  document.documentElement.style.colorScheme = darkMode ? "dark" : "light";
}
