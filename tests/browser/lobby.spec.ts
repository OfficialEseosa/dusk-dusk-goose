import { test, expect } from "@playwright/test";

test("leave lobby returns to title, frees a ready seat, and permits a fresh night", async ({
  browser,
  request,
}) => {
  const firstContext = await browser.newContext({
    viewport: { width: 661, height: 712 },
  });
  const friendContext = await browser.newContext();
  const replacementContext = await browser.newContext();
  const first = await firstContext.newPage();
  const friend = await friendContext.newPage();
  const replacement = await replacementContext.newPage();
  const errors: string[] = [];
  first.on("pageerror", (e) => errors.push(e.message));
  try {
    await first.goto("/");
    await first.getByTestId("create").click();
    const code = (await first.getByTestId("room-code").textContent())!.trim();
    await friend.goto(`/?room=${code}`);
    await friend.getByTestId("join").click();
    await first.getByTestId("claim-alex").click();
    await friend.getByTestId("claim-sam").click();
    await first.getByTestId("ready").click();
    await first.getByTestId("leave-lobby").click();
    await expect(first.getByTestId("create")).toBeVisible();
    await expect(first).toHaveURL(/\/$/);
    await expect(friend.getByTestId("claim-alex")).toBeEnabled();
    const inspection = await (
      await request.get(`/api/dev/rooms/${code}`)
    ).json();
    expect(inspection.players).toHaveLength(1);
    expect(inspection.players[0].ready).toBe(false);
    await first.reload();
    await expect(first.getByTestId("create")).toBeVisible();
    await replacement.goto(`/?room=${code}`);
    await replacement.getByTestId("join").click();
    await replacement.getByTestId("claim-alex").click();
    await expect(replacement.getByTestId("claim-alex")).toHaveClass(/selected/);
    await first.getByTestId("create").click();
    const freshCode = (await first
      .getByTestId("room-code")
      .textContent())!.trim();
    expect(freshCode).not.toBe(code);
    await first.locator(".wordmark").click();
    await expect(first.getByTestId("create")).toBeVisible();
    expect((await request.get(`/api/dev/rooms/${freshCode}`)).status()).toBe(
      404,
    );
    expect(errors).toEqual([]);
  } finally {
    await firstContext.close();
    await friendContext.close();
    await replacementContext.close();
  }
});

test("hidden partner does not prevent ready, blackout or ordinary actions", async ({
  browser,
}) => {
  const aContext = await browser.newContext();
  const sContext = await browser.newContext();
  const alex = await aContext.newPage();
  const sam = await sContext.newPage();
  try {
    await alex.goto("/");
    await alex.getByTestId("create").click();
    const code = (await alex.getByTestId("room-code").textContent())!.trim();
    await sam.goto("/?room=" + code);
    await sam.getByTestId("join").click();
    await alex.getByTestId("claim-alex").click();
    await sam.getByTestId("claim-sam").click();
    await sam.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await alex.getByTestId("ready").click();
    await sam.getByTestId("ready").click();
    await expect(alex.locator("#app")).toHaveAttribute("data-phase", "opening");
    await expect(alex.locator(".pause-overlay")).toHaveCount(0);
    await expect(alex.locator("#app")).toHaveAttribute(
      "data-phase",
      "flashlights",
    );
    await alex.getByTestId("scene-flashlight-alex").click();
    await expect(alex.locator(".scene-caption")).toContainText(
      "flashlight alex",
    );
    await alex.locator("#radio-text").fill("Still here while you are away.");
    await alex.locator("#radio-text").press("Enter");
    await expect(sam.locator(".messages")).toContainText(
      "Still here while you are away.",
    );
    await sam.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => false,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await sam.getByTestId("scene-flashlight-sam").click();
    await expect(alex.locator("#app")).toHaveAttribute("data-phase", "shelf");
  } finally {
    await aContext.close();
    await sContext.close();
  }
});
