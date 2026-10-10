"use client";

import { SessionProvider } from "next-auth/react";
import { useEffect, type ReactNode } from "react";
import { applyTheme, useSettingsStore } from "@/stores/useSettingsStore";

export function Providers({ children }: { children: ReactNode }): JSX.Element {
  const darkMode = useSettingsStore((s) => s.darkMode);

  useEffect(() => {
    applyTheme(darkMode);
  }, [darkMode]);

  return <SessionProvider>{children}</SessionProvider>;
}
