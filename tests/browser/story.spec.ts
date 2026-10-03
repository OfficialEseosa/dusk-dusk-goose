import { test, expect, type Page } from "@playwright/test";

async function phase(page: Page, value: string) {
  await expect(page.locator("#app")).toHaveAttribute("data-phase", value);
}
async function litReach(guide: Page, actor: Page, target: string) {
  await guide.getByTestId(`aim-${target}`).click();
  await actor.waitForTimeout(90); // bounded beam emission must arrive before authoritative interaction
  await actor.getByTestId(`target-${target}`).click();
}

for (const [seed, disclosure] of [
  [0, "tell"],
  [1, "defer"],
] as const) {
  test(`two independent browsers finish seed ${seed}, ${disclosure}, recovery and replay`, async ({
    browser,
    request,
  }, testInfo) => {
    const aContext = await browser.newContext({
      viewport: { width: 1440, height: 960 },
    });
    const sContext = await browser.newContext({
      viewport: { width: 1440, height: 960 },
    });
    const alex = await aContext.newPage(),
      sam = await sContext.newPage();
    const errors: string[] = [];
    for (const page of [alex, sam]) {
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      page.on("requestfailed", (req) => {
        if (!req.url().includes("socket.io"))
          errors.push(`${req.url()}: ${req.failure()?.errorText}`);
      });
    }
    try {
      await alex.goto("/");
      await sam.goto("/");
      await alex.locator("#create-name").fill("First friend");
      await alex.getByTestId("create").click();
      const code = (await alex.getByTestId("room-code").textContent())!.trim();
      await sam.locator("#create-name").fill("Second friend");
      await sam.locator("#join-code").fill(code);
      await sam.getByTestId("join").click();
      await phase(sam, "lobby");
      const reset = await request.post(`/api/dev/rooms/${code}`, {
        data: { seed },
      });
      expect(reset.ok()).toBeTruthy();
      await alex.getByTestId("claim-alex").click();
      await sam.getByTestId("claim-sam").click();
      await expect(sam.getByTestId("claim-alex")).toBeDisabled();
      await alex.getByTestId("ready").click();
      await sam.getByTestId("ready").click();
      await phase(alex, "opening");
      await phase(sam, "opening");
      await phase(alex, "flashlights");
      await phase(sam, "flashlights");
      await alex.getByTestId("target-flashlight-alex").click();
      await sam.getByTestId("target-flashlight-sam").click();
      await phase(sam, "shelf");
      await sam.locator("[data-radio]").first().click();
      await expect(alex.locator(".messages")).toContainText(
        /Light (the|shelf)/,
      );
      const remoteBefore = await sam
        .locator("#partner-light")
        .getAttribute("cx");
      // Observe the shelf contents only after the partner illuminates them.
      const tin = sam
        .locator("button[data-aim]")
        .filter({ hasText: "Tin box" });
      for (let index = 0; index < 3; index++) {
        await alex.getByTestId(`aim-shelf-${index}`).click();
        await sam.waitForTimeout(150);
        if (await tin.count()) break;
      }
      const shelfId = await tin.getAttribute("data-aim");
      expect(shelfId).toBeTruthy();
      await alex.getByTestId(`aim-${shelfId}`).click();
      await expect
        .poll(() => sam.locator("#partner-light").getAttribute("opacity"))
        .toBe("1");
      await expect
        .poll(() => sam.locator("#partner-light").getAttribute("cx"))
        .not.toBe(remoteBefore);
      await sam.screenshot({
        path: testInfo.outputPath("shared-light-desktop.png"),
      });
      if (seed === 1) {
        await sam.setViewportSize({ width: 390, height: 844 });
        await sam.locator("#radio-text").fill("<b>Still here</b>");
        await sam.locator("#radio-text").focus();
        await expect(sam.locator("#radio-text")).toBeFocused();
        expect(
          await sam.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBeTruthy();
        await sam
          .locator("#radio-form")
          .getByRole("button", { name: "Send", exact: true })
          .click();
        await expect(alex.locator(".messages")).toContainText(
          "<b>Still here</b>",
        );
        await expect(alex.locator(".messages b")).toHaveCount(0);
        await sam.getByTestId(`target-${shelfId}`).scrollIntoViewIfNeeded();
        await expect(sam.getByTestId(`target-${shelfId}`)).toBeInViewport();
        await sam.screenshot({
          path: testInfo.outputPath("shared-light-portrait.png"),
          fullPage: true,
        });
        await sam.setViewportSize({ width: 1440, height: 960 });
      }
      await sam.getByTestId(`target-${shelfId}`).click();
      await phase(alex, "key");

      if (seed === 0) {
        await sam.reload();
        await phase(sam, "key");
        await expect(sam.locator("#app")).toHaveAttribute("data-role", "sam");
        await sContext.setOffline(true);
        await expect(alex.locator(".pause-overlay")).toBeVisible({
          timeout: 20_000,
        });
        await sContext.setOffline(false);
        await expect(alex.locator(".pause-overlay")).toHaveCount(0, {
          timeout: 20_000,
        });
        await phase(sam, "key");
        // Exercise the actual visibility handler and real wall-clock absence. Headless browsers
        // do not reliably background separate contexts, so visibility state is emulated explicitly.
        await sam.evaluate(() => {
          Object.defineProperty(document, "hidden", {
            configurable: true,
            get: () => true,
          });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await expect(alex.locator(".pause-overlay")).toBeVisible();
        await sam.waitForTimeout(30_000);
        await phase(alex, "key");
        await sam.evaluate(() => {
          Object.defineProperty(document, "hidden", {
            configurable: true,
            get: () => false,
          });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await expect(alex.locator(".pause-overlay")).toHaveCount(0);
      }
      await litReach(sam, alex, "key");
      await phase(alex, "passage");
      for (let i = 0; i < 3; i++) {
        const safe = sam
          .locator("button[data-aim]")
          .filter({ hasText: "Safe stepping point" });
        const id = await safe.getAttribute("data-aim");
        await litReach(sam, alex, id!);
        if (i < 2)
          await expect(alex.locator(".objective h2")).toContainText(
            `${i + 2}/3`,
          );
      }
      await phase(sam, "latch");
      await litReach(alex, sam, "latch");
      await phase(sam, "disclosure");
      await sam.getByTestId(`choice-${disclosure}`).click();
      if (disclosure === "tell")
        await alex.getByTestId("choice-understand").click();
      await phase(alex, "route");
      await phase(sam, "route");
      const card = await alex.locator(".private-note").textContent();
      const shapes = card!.match(/triangle|circle|star/g)!;
      expect(shapes).toHaveLength(3);
      for (let i = 0; i < shapes.length; i++) {
        const landmark = sam
          .locator("button[data-aim]")
          .filter({ hasText: `${shapes[i]} landmark` });
        const id = await landmark.getAttribute("data-aim");
        await sam.getByTestId(`target-${id}`).click();
        if (i < 2)
          await expect(sam.locator(".objective h2")).toContainText(
            `${i + 2}/3`,
          );
      }
      await phase(alex, "marker");
      await litReach(sam, alex, "marker");
      await phase(alex, "capsule");
      for (const [actor, guide, role] of [
        [alex, sam, "alex"],
        [sam, alex, "sam"],
        [alex, sam, "alex"],
        [sam, alex, "sam"],
      ] as const) {
        await litReach(guide, actor, `capsule-${role}`);
      }
      await phase(alex, "keepsakes");
      await alex.getByTestId("choice-understand").click();
      await sam.getByTestId("choice-continue").click();
      await phase(alex, "goodbye");
      await phase(sam, "goodbye");
      await alex.getByTestId("signal-toggle").click();
      await expect(sam.locator(".signal-status")).toContainText("holding");
      if (seed === 1) {
        await sam.locator("#signal-hold").focus();
        await sam.keyboard.down("Space");
      } else {
        await sam.getByTestId("signal-toggle").click();
      }
      await phase(alex, "ending");
      await phase(sam, "ending");
      if (seed === 1) {
        await sam.keyboard.up("Space");
        await sam.waitForTimeout(150);
        await expect(sam.locator(".toast")).toHaveCount(0);
      }
      await expect(alex.locator(".ending-card")).toContainText(
        disclosure === "tell" ? "difficult thing" : "under the water tower",
      );
      await alex.screenshot({
        path: testInfo.outputPath("ending-desktop.png"),
      });
      await alex.setViewportSize({ width: 390, height: 844 });
      await alex.screenshot({
        path: testInfo.outputPath("ending-portrait.png"),
        fullPage: true,
      });
      await expect(alex.getByTestId("replay")).toBeVisible();
      await alex.getByTestId("replay").click();
      await sam.getByTestId("replay").click();
      await phase(alex, "lobby");
      await phase(sam, "lobby");
      await expect(alex.locator("#app")).toHaveAttribute("data-role", "sam");
      await expect(sam.locator("#app")).toHaveAttribute("data-role", "alex");
      const inspected = await request.get(`/api/dev/rooms/${code}`);
      const inspection = await inspected.json();
      expect(inspection.variant).toBe(1 - seed);
      expect(inspection.inventory).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      await aContext.close();
      await sContext.close();
    }
  });
}
