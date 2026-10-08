import { test, expect } from "@playwright/test";
for (const [label, width, height] of [
  ["desktop", 1440, 900],
  ["phone", 390, 844],
  ["compact", 661, 712],
  ["landscape", 844, 390],
] as const) {
  test(`home is uncluttered and uses local fonts on ${label}`, async ({
    browser,
  }, info) => {
    const context = await browser.newContext({ viewport: { width, height } }),
      page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await page.goto("/");
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByTestId("explore-solo")).toBeInViewport();
      await expect(page.getByTestId("create")).toBeInViewport();
      await expect(page.getByTestId("join")).toBeInViewport();
      await expect(page.locator("#create-name")).toBeHidden();
      const text = await page.locator("body").innerText();
      expect(text).not.toMatch(
        /\u2014|GRAYBOX|TEMPORARY ART|Radio connected|No accounts|About 10/,
      );
      expect(
        await page.evaluate(
          () =>
            document.fonts.check('600 72px "Fraunces"') &&
            document.fonts.check('400 16px "DM Sans"'),
        ),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`home-${label}.png`),
        fullPage: true,
      });
      await page.getByTestId("explore-solo").click();
      await expect(page.getByTestId("house-canvas")).toBeVisible();
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
