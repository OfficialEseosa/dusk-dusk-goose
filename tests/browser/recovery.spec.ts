import { test, expect } from "@playwright/test";
import { createGameServer } from "../../server/index";
import type { AddressInfo } from "node:net";
import { createServer as createProxy, connect, type Socket } from "node:net";

for (const explicitResume of [false, true]) {
  test(`network switch recovers ${explicitResume ? "explicit Resume" : "automatically"} through the old connection`, async ({
    browser,
  }) => {
    const app = createGameServer();
    await new Promise<void>((resolve) =>
      app.http.listen(0, "127.0.0.1", resolve),
    );
    const backendPort = (app.http.address() as AddressInfo).port;
    const links: { client: Socket; upstream: Socket; ghost: boolean }[] = [];
    const proxy = createProxy((client) => {
      const upstream = connect(backendPort, "127.0.0.1");
      const link = { client, upstream, ghost: false };
      links.push(link);
      client.pipe(upstream);
      upstream.pipe(client);
      client.on("close", () => {
        if (!link.ghost) upstream.destroy();
      });
      client.on("error", () => {});
      upstream.on("error", () => client.destroy());
    });
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    const context = await browser.newContext();
    let page = await context.newPage();
    try {
      const url = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}/`;
      await page.goto(url);
      await page.getByTestId("create").click();
      const code = (await page.getByTestId("room-code").textContent())!.trim();
      await page.getByTestId("claim-alex").click();
      const before = app.rooms.get(code)!.players[0].id;
      // Cut the browser path while leaving the old backend TCP socket alive.
      // Rejoining must retry until Socket.IO's real heartbeat expires the ghost.
      for (const link of links) {
        link.ghost = true;
        link.client.unpipe(link.upstream);
        link.upstream.unpipe(link.client);
        link.upstream.on("data", () => {});
        link.client.destroy();
      }
      if (explicitResume) {
        await page.close();
        page = await context.newPage();
        await page.goto(url);
        await page.getByTestId("resume-night").click();
      }
      await expect(page.locator(".toast")).toContainText(
        "Rejoining your seat",
        {
          timeout: 10000,
        },
      );
      await expect(page.getByTestId("claim-alex")).toHaveClass(/selected/, {
        timeout: 30000,
      });
      await expect(page.locator(".connection")).toContainText(
        "Radio connected",
        {
          timeout: 30000,
        },
      );
      await expect(page.locator(".toast")).toHaveCount(0);
      await expect(page.getByTestId("claim-alex")).toHaveClass(/selected/);
      expect(app.rooms.get(code)!.players).toHaveLength(1);
      expect(app.rooms.get(code)!.players[0].id).toBe(before);
      await page.getByTestId("ready").click();
      await expect(page.getByTestId("ready")).toContainText("Ready");
    } finally {
      await context.close();
      for (const link of links) {
        link.client.destroy();
        link.upstream.destroy();
      }
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
      await app.close();
    }
  });
}

test("server room loss offers a fresh start instead of a stale lobby", async ({
  browser,
}) => {
  let app = createGameServer();
  await new Promise<void>((resolve) =>
    app.http.listen(0, "127.0.0.1", resolve),
  );
  const port = (app.http.address() as AddressInfo).port;
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.getByTestId("create").click();
    const oldCode = (await page.getByTestId("room-code").textContent())!.trim();
    await page.getByTestId("claim-alex").click();
    await app.close();
    app = createGameServer();
    await new Promise<void>((resolve) =>
      app.http.listen(port, "127.0.0.1", resolve),
    );
    await expect(page.locator(".toast")).toContainText(
      "room is no longer available",
      { timeout: 20000 },
    );
    await expect(page.getByTestId("create")).toBeVisible();
    await page.locator("#fresh").click();
    await page.getByTestId("create").click();
    await expect(page.getByTestId("room-code")).toBeVisible();
    expect(
      (await page.getByTestId("room-code").textContent())!.trim(),
    ).not.toBe(oldCode);
  } finally {
    await context.close();
    await app.close();
  }
});

test("radio Enter clears sent text and preserves drafts and keyboard focus through partner updates", async ({
  browser,
}) => {
  const aContext = await browser.newContext();
  const sContext = await browser.newContext();
  const alex = await aContext.newPage();
  const sam = await sContext.newPage();
  const errors: string[] = [];
  alex.on("pageerror", (e) => errors.push(e.message));
  try {
    await alex.addInitScript(() => {
      const Original = window.AudioContext;
      window.AudioContext = class extends Original {
        resume() {
          return Promise.reject(new Error("Audio unavailable"));
        }
      };
    });
    await alex.goto("/");
    await alex.getByTestId("create").click();
    const code = (await alex.getByTestId("room-code").textContent())!.trim();
    await sam.goto(`/?room=${code}`);
    await sam.getByTestId("join").click();
    await alex.getByTestId("claim-alex").click();
    await sam.getByTestId("claim-sam").click();
    await alex.getByTestId("ready").click();
    await sam.getByTestId("ready").click();
    await expect(alex.getByTestId("target-flashlight-alex")).toBeVisible();
    await alex.getByTestId("target-flashlight-alex").click();
    await sam.getByTestId("target-flashlight-sam").click();
    await alex.locator("#radio-text").fill("A single Enter transmission.");
    await alex.locator("#radio-text").press("Enter");
    await expect(alex.locator("#radio-text")).toHaveValue("");
    await expect(
      sam
        .locator(".message.player p")
        .filter({ hasText: "A single Enter transmission." }),
    ).toHaveCount(1);
    await alex.locator("#radio-text").press("Enter");
    await expect(
      sam
        .locator(".message.player p")
        .filter({ hasText: "A single Enter transmission." }),
    ).toHaveCount(1);
    await alex.locator("#radio-text").fill("Unfinished thought");
    await alex.locator("#hint").click();
    await expect(alex.locator("#radio-text")).toHaveValue("Unfinished thought");
    await alex.getByTestId("aim-shelf-0").focus();
    await sam.locator("[data-radio]").first().click();
    await expect(alex.locator(".messages")).toContainText("Light shelf");
    await expect(alex.getByTestId("aim-shelf-0")).toBeFocused();
    await expect(alex.locator("#radio-text")).toHaveValue("Unfinished thought");
    await alex.locator("#radio-toggle").click();
    await alex.locator("#radio-toggle").click();
    await expect(alex.locator("#radio-text")).toHaveValue("Unfinished thought");
    expect(errors).toEqual([]);
  } finally {
    await aContext.close();
    await sContext.close();
  }
});

test("explicit Resume forgets a room that no longer exists", async ({
  browser,
}) => {
  const app = createGameServer();
  await new Promise<void>((resolve) =>
    app.http.listen(0, "127.0.0.1", resolve),
  );
  const url = `http://127.0.0.1:${(app.http.address() as AddressInfo).port}/`;
  const context = await browser.newContext();
  let page = await context.newPage();
  try {
    await page.goto(url);
    await page.getByTestId("create").click();
    const code = (await page.getByTestId("room-code").textContent())!.trim();
    await page.close();
    app.rooms.delete(code); // Simulate an expired room, preserving the real transport.
    page = await context.newPage();
    await page.goto(url);
    await page.getByTestId("resume-night").click();
    await expect(page.locator(".toast")).toContainText(
      "room is no longer available",
    );
    await expect(page.getByTestId("resume-night")).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("create")).toBeVisible();
    await expect(page.getByTestId("resume-night")).toHaveCount(0);
  } finally {
    await context.close();
    await app.close();
  }
});
