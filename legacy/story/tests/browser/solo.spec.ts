import { test, expect } from "@playwright/test";
test("solo exploration opens without a friend, works offline, picks up flashlight, switches houses and exits", async ({
  page,
  context,
}, info) => {
  const errors: string[] = [];
  const creates: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("websocket", (ws) =>
    ws.on("framesent", (frame) => {
      if (String(frame.payload).includes('"create"'))
        creates.push(String(frame.payload));
    }),
  );
  await page.goto("/");
  await expect(page.getByTestId("explore-solo")).toBeVisible();
  await context.setOffline(true);
  await page.getByTestId("explore-solo").click();
  await expect(page.locator("#app")).toHaveAttribute("data-phase", "solo");
  const canvas = page.getByTestId("house-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.locator(".pause-overlay")).toHaveCount(0);
  await expect(page.locator(".solo-screen")).toContainText(
    "CORNER HOUSE / ALEX",
  );
  await canvas.focus();
  await page.keyboard.down("w");
  await page.waitForTimeout(650);
  await page.keyboard.up("w");
  await page.keyboard.down("a");
  await page.waitForTimeout(440);
  await page.keyboard.up("a");
  await expect(page.getByTestId("world-pickup")).toBeVisible();
  await page.keyboard.press("e");
  await expect(page.locator(".scene-objective")).toContainText(
    "Flashlight collected",
  );
  await expect(page.getByTestId("world-pickup")).toBeHidden();
  await page.screenshot({ path: info.outputPath("solo-exploration.png") });
  await page.getByTestId("solo-switch").click();
  await expect(page.locator(".solo-screen")).toContainText("BLUE HOUSE / SAM");
  await expect(page.locator(".scene-objective")).toContainText(
    "Find the flashlight",
  );
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator("#app")).toHaveAttribute("data-phase", "solo");
  await expect(page.locator(".solo-screen")).toContainText("BLUE HOUSE / SAM");
  await page.getByTestId("solo-exit").click();
  await expect(page.getByTestId("explore-solo")).toBeVisible();
  await expect(page.getByTestId("house-canvas")).toHaveCount(0);
  await page.getByTestId("create").click();
  await expect(page.getByTestId("room-code")).toBeVisible();
  expect(creates).toHaveLength(1);
  expect(errors).toEqual([]);
});
