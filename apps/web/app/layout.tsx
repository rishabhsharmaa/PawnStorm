import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pawnstorm — Play chess online",
  description: "Play chess against the computer or humans in real time. Rated games, analysis, and leaderboards.",
};

const THEME_INIT = `(function(){try{var s=JSON.parse(localStorage.getItem('pawnstorm-settings')||'{}');var d=s.state&&typeof s.state.darkMode==='boolean'?s.state.darkMode:true;document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-screen">
        <Providers>
          <a
            href="#content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-30 focus:rounded-md focus:bg-emerald-600 focus:px-4 focus:py-2 focus:text-white"
          >
            Skip to content
          </a>
          <Header />
          <main id="content" className="mx-auto max-w-6xl px-4 py-6">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 pb-8 pt-4 text-sm text-stone-500">
            Pawnstorm — a mini chess platform. Computer play is casual and unrated.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
