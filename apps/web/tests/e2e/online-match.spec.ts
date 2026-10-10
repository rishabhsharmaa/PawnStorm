import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Two browser contexts sign in as guests, matchmake, and play fool's mate.
 * Moves go through the keyboard input for determinism.
 */
async function guestToLobby(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto("/play/online");
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await expect(page.getByRole("button", { name: "Find game" })).toBeVisible({ timeout: 30_000 });
  return page;
}

async function submitMove(page: Page, text: string): Promise<void> {
  await page.getByTestId("move-input").fill(text);
  await page.getByTestId("move-input").press("Enter");
}

async function moveAppears(page: Page, san: string): Promise<boolean> {
  try {
    await expect(page.getByRole("log", { name: "Moves" }).getByText(san, { exact: true })).toBeVisible({
      timeout: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

test("two guests matchmake and play fool's mate", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  try {
    const pageA = await guestToLobby(ctxA);
    const pageB = await guestToLobby(ctxB);

    await pageA.getByRole("button", { name: "Find game" }).click();
    await pageB.getByRole("button", { name: "Find game" }).click();

    await pageA.waitForURL(/\/game\/[0-9a-f-]+/, { timeout: 30_000 });
    await pageB.waitForURL(/\/game\/[0-9a-f-]+/, { timeout: 30_000 });
    expect(pageA.url()).toBe(pageB.url());

    // Determine colors: whoever can play f3 is White.
    await submitMove(pageA, "f3");
    const aIsWhite = await moveAppears(pageA, "f3");
    const white = aIsWhite ? pageA : pageB;
    const black = aIsWhite ? pageB : pageA;
    if (!aIsWhite) {
      await submitMove(white, "f3");
      expect(await moveAppears(white, "f3")).toBe(true);
    }

    await submitMove(black, "e5");
    expect(await moveAppears(black, "e5")).toBe(true);
    await submitMove(white, "g4");
    expect(await moveAppears(white, "g4")).toBe(true);
    await submitMove(black, "Qh4");
    await expect(black.getByTestId("game-over-modal")).toBeVisible({ timeout: 15_000 });
    await expect(white.getByTestId("game-over-modal")).toBeVisible({ timeout: 15_000 });
    await expect(black.getByTestId("game-over-modal")).toContainText("You win!");
    await expect(white.getByTestId("game-over-modal")).toContainText("You lose");
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
