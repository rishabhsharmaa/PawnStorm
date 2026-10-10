import { expect, test } from "@playwright/test";

/**
 * The computer must answer moves. Regression test for a stuck-"thinking" bug
 * where the search effect's own cleanup cancelled the in-flight engine reply.
 * Needs CDN access (Stockfish loads from jsDelivr on first use).
 */
test("computer replies to e4", async ({ page }) => {
  await page.goto("/play/computer");
  await page.getByTestId("move-input").fill("e4");
  await page.getByTestId("move-input").press("Enter");
  const moves = page.getByRole("log", { name: "Moves" });
  await expect(moves.getByText("e4", { exact: true })).toBeVisible({ timeout: 10_000 });
  // Engine reply = second half-move (generous budget for cold engine load).
  await expect(moves.getByRole("button")).toHaveCount(2, { timeout: 45_000 });
});
