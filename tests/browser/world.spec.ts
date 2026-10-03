import { test, expect } from "@playwright/test";
test("two independent 3D houses share movement, collide, resume and pick up real story objects", async ({
  browser,
}, info) => {
  const ac = await browser.newContext(),
    sc = await browser.newContext();
  const a = await ac.newPage(),
    s = await sc.newPage();
  const errors: string[] = [];
  a.on("pageerror", (e) => errors.push(e.message));
  s.on("pageerror", (e) => errors.push(e.message));
  try {
    await a.goto("/");
    await a.getByTestId("create").click();
    await s.goto(await a.locator("#invite-link").inputValue());
    await s.getByTestId("join").click();
    await a.getByTestId("claim-alex").click();
    await s.getByTestId("claim-sam").click();
    await a.getByTestId("ready").click();
    await s.getByTestId("ready").click();
    await expect(a.locator("#app")).toHaveAttribute(
      "data-phase",
      "flashlights",
    );
    await expect(a.getByTestId("house-canvas")).toBeVisible();
    await expect(s.getByTestId("house-canvas")).toBeVisible();
    const canvas = a.getByTestId("house-canvas");
    const originalCanvas = await canvas.elementHandle();
    await s.locator("#hint").click();
    expect(
      await originalCanvas!.evaluate(
        (node) =>
          node === document.querySelector('[data-testid="house-canvas"]'),
      ),
    ).toBe(true);
    await ac.setOffline(true);
    await expect(a.locator(".pause-overlay")).toBeVisible();
    const frozenZ = await a.locator("#house-world").getAttribute("data-z");
    await canvas.focus();
    await a.keyboard.down("w");
    await a.waitForTimeout(500);
    await a.keyboard.up("w");
    expect(await a.locator("#house-world").getAttribute("data-z")).toBe(
      frozenZ,
    );
    await ac.setOffline(false);
    await expect(a.locator(".pause-overlay")).toHaveCount(0);
    await canvas.focus();
    await a.keyboard.down("w");
    await a.waitForTimeout(650);
    await a.keyboard.up("w");
    await a.keyboard.down("a");
    await a.waitForTimeout(440);
    await a.keyboard.up("a");
    await expect(a.getByTestId("world-pickup")).toBeVisible();
    await expect
      .poll(async () =>
        Number(await s.locator("#house-world").getAttribute("data-friend-x")),
      )
      .toBeLessThan(-0.7);
    const x = Number(await a.locator("#house-world").getAttribute("data-x"));
    await a.reload();
    await expect(a.getByTestId("house-canvas")).toBeVisible();
    await expect
      .poll(async () =>
        Number(await a.locator("#house-world").getAttribute("data-x")),
      )
      .toBeCloseTo(x, 1);
    await a.getByTestId("house-canvas").focus();
    await a.keyboard.down("w");
    await a.waitForTimeout(2200);
    await a.keyboard.up("w");
    const z = Number(await a.locator("#house-world").getAttribute("data-z"));
    expect(z).toBeGreaterThanOrEqual(-2.71);
    await a.screenshot({ path: info.outputPath("house-3d.png") });
    // Back toward bedside table. Collision allows sliding beside it.
    await a.keyboard.down("s");
    await a.waitForTimeout(560);
    await a.keyboard.up("s");
    await expect(a.getByTestId("world-pickup")).toBeVisible();
    await a.keyboard.press("e");
    await expect(a.locator(".scene-caption")).toContainText("flashlight alex");
    await s.getByTestId("house-canvas").focus();
    await s.keyboard.down("w");
    await s.waitForTimeout(650);
    await s.keyboard.up("w");
    await s.keyboard.down("a");
    await s.waitForTimeout(440);
    await s.keyboard.up("a");
    await expect(s.getByTestId("world-pickup")).toBeVisible();
    await s.getByTestId("world-pickup").click();
    await expect(a.locator("#app")).toHaveAttribute("data-phase", "shelf");
    await expect(a.getByTestId("house-canvas")).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await ac.close();
    await sc.close();
  }
});
