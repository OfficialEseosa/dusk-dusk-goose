import { test, expect, type Page } from "@playwright/test";

async function phase(page: Page, value: string) {
  await expect(page.locator("#app")).toHaveAttribute("data-phase", value);
}

async function transmissions(sender: Page, receiver: Page, count = 3) {
  const quick = sender.locator("[data-radio]").first();
  const text = (await quick.getAttribute("data-radio"))!;
  const messages = receiver.locator(".message p").filter({ hasText: text });
  const before = await messages.count();
  for (let index = 0; index < count; index++) {
    await quick.click();
    await expect(messages).toHaveCount(before + index + 1);
  }
}

test("repeated entry taps while offline queue one room request", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto("/");
    await context.setOffline(true);
    await expect(page.locator("#app")).toHaveAttribute(
      "data-connection",
      "offline",
      {
        timeout: 15000,
      },
    );
    await page.locator(".player-name summary").click();
    await page.locator("#create-name").fill("Offline friend");
    for (let index = 0; index < 3; index++)
      await page.getByTestId("create").click();
    await context.setOffline(false);
    await phase(page, "lobby");
    await page.getByTestId("claim-alex").click();
    await expect(page.getByTestId("claim-alex")).toHaveClass(/selected/);
    await expect(page.locator(".toast")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("invalid join keeps both title fields and their DOM nodes", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".player-name summary").click();
  await page.locator("#create-name").fill("Maple friend");
  await page.locator("#join-code").fill("ZZZZZ");
  const name = await page.locator("#create-name").elementHandle();
  const code = await page.locator("#join-code").elementHandle();
  await page.getByTestId("join").click();
  await expect(page.locator(".toast")).toContainText(
    "room is no longer available",
  );
  await expect(page.locator("#create-name")).toHaveValue("Maple friend");
  await expect(page.locator("#join-code")).toHaveValue("ZZZZZ");
  expect(
    await name!.evaluate(
      (node) => node === document.querySelector("#create-name"),
    ),
  ).toBe(true);
  expect(
    await code!.evaluate(
      (node) => node === document.querySelector("#join-code"),
    ),
  ).toBe(true);
});

test("partner snapshots preserve opening, radio composition and a pressed scene interaction", async ({
  browser,
}) => {
  const aContext = await browser.newContext();
  const sContext = await browser.newContext();
  const alex = await aContext.newPage();
  const sam = await sContext.newPage();
  const errors: string[] = [];
  for (const page of [alex, sam])
    page.on("pageerror", (error) => errors.push(error.message));
  try {
    await alex.goto("/");
    await alex.getByTestId("create").click();
    const invite = await alex.locator("#invite-link").inputValue();
    await sam.goto(invite);
    await sam.getByTestId("join").click();
    await alex.getByTestId("claim-alex").click();
    await sam.getByTestId("claim-sam").click();
    await alex.getByTestId("ready").click();
    await sam.getByTestId("ready").click();
    await phase(alex, "opening");
    const dateCard = await alex.locator(".date-card").elementHandle();
    const animationBefore = await dateCard!.evaluate((node) =>
      node.getAnimations().map((animation) => animation.startTime),
    );
    await sam.locator("#hint").click();
    await expect(sam.locator(".hint-row p")).toBeVisible();
    await expect(alex.locator(".date-card")).toBeVisible();
    expect(
      await dateCard!.evaluate(
        (node) => node === document.querySelector(".date-card"),
      ),
    ).toBe(true);
    expect(
      await dateCard!.evaluate((node) =>
        node.getAnimations().map((animation) => animation.startTime),
      ),
    ).toEqual(animationBefore);
    await phase(alex, "flashlights");
    await phase(sam, "flashlights");

    const radio = alex.locator("#radio-text");
    await radio.fill("Half a message: 夏");
    await radio.focus();
    await radio.evaluate((input) =>
      (input as HTMLInputElement).setSelectionRange(5, 9),
    );
    const originalInput = await radio.elementHandle();
    await radio.dispatchEvent("compositionstart", { data: "夏" });
    await transmissions(sam, alex);
    expect(
      await originalInput!.evaluate(
        (node) => node === document.querySelector("#radio-text"),
      ),
    ).toBe(true);
    await expect(radio).toBeFocused();
    await expect(radio).toHaveValue("Half a message: 夏");
    expect(
      await radio.evaluate((input) => [
        (input as HTMLInputElement).selectionStart,
        (input as HTMLInputElement).selectionEnd,
      ]),
    ).toEqual([5, 9]);
    await radio.dispatchEvent("compositionend", { data: "夏" });

    await sam.getByTestId("scene-flashlight-sam").click();
    const flashlight = alex.getByTestId("scene-flashlight-alex");
    await flashlight.scrollIntoViewIfNeeded();
    const originalButton = await flashlight.elementHandle();
    const bounds = (await flashlight.boundingBox())!;
    await alex.mouse.move(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    await alex.mouse.down();
    await transmissions(sam, alex);
    expect(
      await originalButton!.evaluate(
        (node) =>
          node ===
          document.querySelector('[data-testid="scene-flashlight-alex"]'),
      ),
    ).toBe(true);
    await alex.mouse.up();
    await phase(alex, "shelf");
    await phase(sam, "shelf");
    expect(errors).toEqual([]);
  } finally {
    await aContext.close();
    await sContext.close();
  }
});

test("same browser tabs join separate seats and explicit Resume transfers only its remembered seat", async ({
  browser,
  request,
}) => {
  const context = await browser.newContext();
  const alex = await context.newPage();
  const sam = await context.newPage();
  try {
    await alex.goto("/");
    await alex.locator(".player-name summary").click();
    await alex.locator("#create-name").fill("Same browser Alex");
    await alex.getByTestId("create").click();
    const code = (await alex.getByTestId("room-code").textContent())!.trim();
    await sam.goto("/");
    await sam.locator(".player-name summary").click();
    await sam.locator("#create-name").fill("Same browser Sam");
    await sam.locator("#join-code").fill(code);
    await sam.getByTestId("join").click();
    await phase(sam, "lobby");
    await alex.getByTestId("claim-alex").click();
    await sam.getByTestId("claim-sam").click();
    await expect(alex.getByTestId("claim-alex")).toHaveClass(/selected/);
    await expect(sam.getByTestId("claim-sam")).toHaveClass(/selected/);
    const inspection = await (
      await request.get(`/api/dev/rooms/${code}`)
    ).json();
    expect(inspection.players).toHaveLength(2);
    expect(
      new Set(inspection.players.map((player: { id: string }) => player.id))
        .size,
    ).toBe(2);

    const resumed = await context.newPage();
    await resumed.goto(`/?room=${code}`);
    await expect(resumed.getByTestId("join")).toBeVisible();
    await resumed.getByTestId("resume-night").click();
    await phase(resumed, "lobby");
    await expect(resumed.getByTestId("claim-sam")).toHaveClass(/selected/);
    await phase(sam, "title");
    await expect(sam.locator(".toast")).toContainText(
      "continued in another tab",
    );
    // Allow several reconnect cycles: the replaced tab must not reclaim the seat.
    await sam.waitForTimeout(3500);
    await phase(sam, "title");
    await phase(resumed, "lobby");
    await expect(alex.getByTestId("claim-alex")).toHaveClass(/selected/);
    const after = await (await request.get(`/api/dev/rooms/${code}`)).json();
    expect(
      after.players.map((player: { id: string }) => player.id).sort(),
    ).toEqual(
      inspection.players.map((player: { id: string }) => player.id).sort(),
    );
    await resumed.close();
    const byCode = await context.newPage();
    await byCode.goto("/");
    await byCode.locator("#join-code").fill(code);
    await byCode.getByTestId("join").click();
    await phase(byCode, "lobby");
    await expect(byCode.getByTestId("claim-sam")).toHaveClass(/selected/);
  } finally {
    await context.close();
  }
});

test("a disconnected partner can be left without automatic rejoin", async ({
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
    await sam.goto(`/?room=${code}`);
    await sam.getByTestId("join").click();
    await alex.getByTestId("claim-alex").click();
    await sam.getByTestId("claim-sam").click();
    await alex.getByTestId("ready").click();
    await sam.getByTestId("ready").click();
    await phase(alex, "flashlights");
    await sam.close();
    await expect(alex.locator(".pause-overlay")).toBeVisible();
    await alex.getByTestId("leave-night").click();
    await phase(alex, "title");
    await expect(alex.getByTestId("resume-night")).toHaveCount(0);
    await alex.reload();
    await phase(alex, "title");
    await expect(alex.getByTestId("resume-night")).toHaveCount(0);
    await alex.getByTestId("create").click();
    expect(
      (await alex.getByTestId("room-code").textContent())!.trim(),
    ).not.toBe(code);
  } finally {
    await aContext.close();
    await sContext.close();
  }
});

test("Resume on an older invitation chooses that room rather than the most recent one", async ({
  browser,
}) => {
  const context = await browser.newContext();
  try {
    const first = await context.newPage();
    await first.goto("/");
    await first.getByTestId("create").click();
    const older = (await first.getByTestId("room-code").textContent())!.trim();
    const second = await context.newPage();
    await second.goto("/");
    await second.getByTestId("create").click();
    const newer = (await second.getByTestId("room-code").textContent())!.trim();
    const returned = await context.newPage();
    await returned.goto(`/?room=${older}`);
    await expect(returned.getByTestId("resume-night")).toContainText(older);
    await returned.getByTestId("resume-night").click();
    await expect(returned.getByTestId("room-code")).toHaveText(older);
    await expect(second.getByTestId("room-code")).toHaveText(newer);
    await phase(first, "title");
  } finally {
    await context.close();
  }
});
