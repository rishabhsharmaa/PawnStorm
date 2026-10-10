"use client";

import { useMemo } from "react";
import { Chess } from "chess.js";
import { ChessBoardView } from "./ChessBoardView";
import { useSettingsStore } from "@/stores/useSettingsStore";

/** Static preview board for the landing page. */
export function DemoBoard(): JSX.Element {
  const chess = useMemo(() => {
    const c = new Chess();
    c.move("e4");
    c.move("e5");
    c.move("Nf3");
    c.move("Nc6");
    return c;
  }, []);
  const showCoordinates = useSettingsStore((s) => s.showCoordinates);
  return (
    <ChessBoardView
      chess={chess}
      orientation="white"
      movableColor={null}
      lastMove={{ from: "b8", to: "c6" }}
      onMove={() => undefined}
      boardId="demo"
      showCoordinates={showCoordinates}
    />
  );
}
