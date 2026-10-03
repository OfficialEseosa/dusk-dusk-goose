import { test, expect } from "@playwright/test";

test("scene taps, compact landscape, game menu and reopened invite preserve both seats", async ({
  browser,
}, testInfo) => {
  const aContext = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });
  const sContext = await browser.newContext();
  let alex = await aContext.newPage();
  const sam = await sContext.newPage();
  const errors: string[] = [];
  const dialogs: string[] = [];
  sam.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  const observe = () => alex.on("pageerror", (e) => errors.push(e.message));
  observe();
  try {
    await alex.goto("/");
    await alex.locator(".player-name summary").click();
    await alex.locator("#create-name").fill("<svg onload=alert(1)>");
    await alex.getByTestId("create").tap();
    const invite = await alex.locator("#invite-link").inputValue();
    const code = (await alex.getByTestId("room-code").textContent())!.trim();
    await sam.goto(invite);
    await sam.getByTestId("join").click();
    await alex.getByTestId("claim-alex").tap();
    await sam.getByTestId("claim-sam").click();
    await alex.getByTestId("ready").tap();
    await sam.getByTestId("ready").click();
    await expect(alex.getByTestId("scene-flashlight-alex")).toBeVisible();
    await expect(alex.locator("#scene")).toBeInViewport({ ratio: 1 });
    await expect(alex.locator(".scene-objective")).toBeInViewport({ ratio: 1 });
    expect(
      await alex.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await alex.screenshot({
      path: testInfo.outputPath("landscape-objective.png"),
    });
    await alex.getByTestId("scene-flashlight-alex").tap();
    await sam.getByTestId("scene-flashlight-sam").click();
    await expect(alex.locator("#app")).toHaveAttribute("data-phase", "shelf");
    // Natural scene controls aim for the guide and interact for the actor.
    await expect(sam.getByTestId("scene-shelf-0")).toHaveAttribute(
      "aria-label",
      /needs your friend’s light/,
    );
    await alex.getByTestId("scene-shelf-0").tap();
    await expect(sam.getByTestId("scene-shelf-0")).not.toHaveAttribute(
      "aria-label",
      /needs your friend’s light/,
    );
    await alex.getByTestId("game-menu").tap();
    await expect(alex.getByTestId("resume-night")).toHaveText(
      `Continue night ${code}`,
    );
    await expect(sam.locator(".pause-overlay")).toBeVisible();
    await expect(sam.locator(".pause-overlay")).toContainText(
      "<svg onload=alert(1)> is disconnected",
    );
    await expect(sam.locator(".pause-overlay svg")).toHaveCount(0);
    expect(dialogs).toEqual([]);
    await alex.getByTestId("resume-night").tap();
    await expect(alex.locator("#app")).toHaveAttribute("data-phase", "shelf");
    await expect(sam.locator(".pause-overlay")).toHaveCount(0);
    await expect(alex.locator(".chapter")).toContainText("ALEX");
    await alex.close();
    await expect(sam.locator(".pause-overlay")).toBeVisible();
    alex = await aContext.newPage();
    observe();
    await alex.goto(invite);
    await alex.getByTestId("resume-night").tap();
    await expect(alex.locator("#app")).toHaveAttribute("data-phase", "shelf");
    await expect(sam.locator(".pause-overlay")).toHaveCount(0);
    await expect(alex.locator(".scene-caption")).toContainText(
      "flashlight alex",
    );
    await expect(alex.locator(".chapter")).toContainText("ALEX");
    expect(errors).toEqual([]);
  } finally {
    await aContext.close();
    await sContext.close();
  }
});
