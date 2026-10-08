import { test, expect } from "@playwright/test";

test("invite copy writes the system clipboard and supports modern-only browsers", async ({
  browser,
}) => {
  const context = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  const friendContext = await browser.newContext();
  try {
    await page.goto("/");
    await page.getByTestId("create").click();
    const link = await page.locator("#invite-link").inputValue();
    await page.getByTestId("copy-invite").click();
    await expect(page.locator("#invite-status")).toContainText(
      "Copy requested",
    );
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      link,
    );
    await page.evaluate(() => {
      document.execCommand = () => false;
    });
    await page.getByTestId("copy-invite").click();
    await expect(page.locator("#invite-status")).toContainText(
      "Copy requested",
    );
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      link,
    );
    await page.reload();
    await expect(page.getByTestId("room-code")).toBeVisible();
    await page.evaluate(async () => {
      await navigator.clipboard.writeText("maple-test-sentinel");
      Object.defineProperty(navigator.clipboard, "writeText", {
        configurable: true,
        value: () =>
          Promise.reject(new DOMException("Blocked", "NotAllowedError")),
      });
    });
    await page.getByTestId("copy-invite").click();
    await expect(page.locator("#invite-status")).toContainText(
      "Copy requested",
    );
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      link,
    );
  } finally {
    await context.close();
    await friendContext.close();
  }
});

test("blocked clipboard gives a selected usable invitation instead of claiming success", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 661, height: 712 },
  });
  const page = await context.newPage();
  const friendContext = await browser.newContext();
  try {
    await page.goto("/");
    await page.getByTestId("create").click();
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: () =>
            Promise.reject(new DOMException("Blocked", "NotAllowedError")),
        },
      });
      document.execCommand = () => false;
    });
    await page.getByTestId("copy-invite").click();
    await expect(page.locator("#invite-status")).toContainText(
      "Clipboard access is blocked",
    );
    await expect(page.getByTestId("copy-invite")).toHaveText(
      "Copy invite link",
    );
    await expect(page.locator("#invite-link")).toBeFocused();
    expect(
      await page
        .locator("#invite-link")
        .evaluate(
          (el: HTMLInputElement) => el.selectionEnd! - el.selectionStart!,
        ),
    ).toBe((await page.locator("#invite-link").inputValue()).length);
    await page.screenshot({
      path: "test-results/invite-fallback.png",
      fullPage: true,
    });
    const invite = await page.locator("#invite-link").inputValue();
    const friend = await friendContext.newPage();
    await friend.goto(invite);
    await expect(friend.locator("#join-code")).toHaveValue(
      (await page.getByTestId("room-code").textContent())!.trim(),
    );
    await friend.getByTestId("join").click();
    await expect(friend.getByTestId("room-code")).toBeVisible();
  } finally {
    await context.close();
    await friendContext.close();
  }
});
