import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import {
  createServer as createTcpServer,
  connect as connectTcp,
  type Socket,
} from "node:net";
async function create(page: Page, name = "Alex") {
  await page.goto("/");
  await page.getByLabel("Your name").fill(name);
  await page
    .getByRole("button", { name: "Create a night", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Start the night", exact: true }),
  ).toBeEnabled();
  return (await page.getByTestId("room-code").innerText()).trim();
}
async function bounds(page: Page) {
  expect(
    await page.evaluate(() => ({
      x: document.documentElement.scrollWidth <= innerWidth,
      y: document.documentElement.scrollHeight <= innerHeight,
      buttons: [...document.querySelectorAll("button")].filter(b=>b.getClientRects().length>0).every((b) => {
        const r = b.getBoundingClientRect();
        return (
          r.height >= 44 &&
          r.top >= 0 &&
          r.bottom <= innerHeight &&
          r.left >= 0 &&
          r.right <= innerWidth
        );
      }),
    })),
  ).toEqual({ x: true, y: true, buttons: true });
}
test("two independent phone/laptop sessions: join, clipboard, start, refresh, leave", async ({
  browser,
}) => {
  const phone = await browser.newContext({
    viewport: { width: 667, height: 375 },
    hasTouch: true,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const laptop = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  const a = await phone.newPage(),
    b = await laptop.newPage();
  const code = await create(a);
  await bounds(a);
  await a.getByRole("button", { name: "Copy invite", exact: true }).click();
  await expect(
    a.getByRole("button", { name: "Link copied", exact: true }),
  ).toBeVisible();
  expect(await a.evaluate(() => navigator.clipboard.readText())).toContain(
    `?room=${code}`,
  );
  await b.goto(`/?room=${code}`);
  await b.getByLabel("Your name").fill("Sam");
  await b.getByRole("button", { name: "Join", exact: true }).click();
  await expect(a.getByRole("list", { name: "Players" })).toContainText("Sam");
  await bounds(b);
  await a.screenshot({ path: "test-results/phone-room.png" });
  await b.screenshot({ path: "test-results/laptop-room.png" });
  await a.getByRole("button", { name: "Start the night", exact: true }).click();
  await expect(
    b.locator('canvas[data-ready="true"]'),
  ).toBeVisible();
  await expect(a.locator('canvas')).toHaveAttribute('data-role','hider');
  await expect(a.locator('canvas')).toHaveAttribute('data-location','street');
  await expect(b.locator('canvas')).toHaveAttribute('data-role','seeker');
  await expect(b.locator('canvas')).toHaveAttribute('data-location','prep');
  await b.reload();
  await expect(b.getByRole("list", { name: "Players" })).toContainText(
    "Sam (you)",
  );
  await expect(b.locator('canvas[data-ready="true"]')).toHaveAttribute('data-role','seeker');
  await expect(b.locator('canvas')).toHaveAttribute('data-location','prep');
  await b.getByRole("button", { name: "Back to title" }).click();
  await expect(a.getByRole("list", { name: "Players" })).not.toContainText(
    "Sam",
  );
  await a.getByRole("button", { name: "Back to title" }).click();
  await expect(
    a.getByRole("button", { name: "Create a night", exact: true }),
  ).toBeVisible();
  expect(new URL(a.url()).search).toBe("");
  await bounds(a);
  await a.screenshot({ path: "test-results/phone-title.png" });
  await b.screenshot({ path: "test-results/laptop-title.png" });
  await phone.close();
  await laptop.close();
});
test("same browser tabs remain separate; disconnected credential offers seat; clipboard denial fallback", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 667, height: 375 },
  });
  const a = await context.newPage();
  const code = await create(a, "Alex");
  const firstId = await a.evaluate(
    () => JSON.parse(sessionStorage.getItem("maple:seat:v1")!).playerId,
  );
  const b = await context.newPage();
  await b.goto(`/?room=${code}`);
  await expect(b.getByRole("button", { name: "Return as Alex" })).toHaveCount(
    0,
  );
  await b.getByLabel("Your name").fill("Sam");
  await b.getByRole("button", { name: "Join", exact: true }).click();
  await expect(b.getByRole("list", { name: "Players" })).toContainText(
    "Sam (you)",
  );
  const secondId = await b.evaluate(
    () => JSON.parse(sessionStorage.getItem("maple:seat:v1")!).playerId,
  );
  expect(firstId).not.toBe(secondId);
  await a.close();
  const c = await context.newPage();
  await c.goto(`/?room=${code}`);
  await c.getByRole("button", { name: "Return as Alex", exact: true }).click();
  await expect(c.getByRole("list", { name: "Players" })).toContainText(
    "Alex (you)",
  );
  expect(
    await c.evaluate(
      () => JSON.parse(sessionStorage.getItem("maple:seat:v1")!).playerId,
    ),
  ).toBe(firstId);
  await c.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("Denied");
        },
      },
    }),
  );
  await c.getByRole("button", { name: "Copy invite", exact: true }).click();
  await expect(c.getByLabel("Invite link")).toHaveValue(
    new RegExp(`room=${code}`),
  );
  await expect(c.getByText("Select and copy the invite link.")).toBeVisible();
  await bounds(c);
  await context.close();
});
test("solo starts; invalid rooms and names stay actionable; small viewport fits", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 568, height: 320 },
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create a night", exact: true })
    .click();
  await expect(
    page.getByText("Enter your name to start a night."),
  ).toBeVisible();
  await bounds(page);
  await page.getByLabel("Your name").fill("Solo");
  await page.getByLabel("Room code").fill("ZZZZZ");
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(
    page.getByText(
      "That night has ended. Create a new night or check the code.",
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create a night", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start the night", exact: true })
    .click();
  await expect(
    page.locator('canvas[data-ready="true"]'),
  ).toBeVisible();
  await bounds(page);
  await context.close();
});
test("six-player phone lobby fits; another device cannot recover by name", async ({
  browser,
}) => {
  const hostContext = await browser.newContext({
    viewport: { width: 568, height: 320 },
    hasTouch: true,
  });
  const host = await hostContext.newPage();
  const code = await create(host, "Alex");
  const friends = [];
  for (let i = 0; i < 5; i++) {
    const context = await browser.newContext();
    friends.push(context);
    const p = await context.newPage();
    await p.goto(`/?room=${code}`);
    await p.getByLabel("Your name").fill(i === 0 ? "Alex" : `Friend ${i}`);
    await p.getByRole("button", { name: "Join", exact: true }).click();
    await expect(p.getByRole("list", { name: "Players" })).toContainText(
      "(you)",
    );
  }
  await expect(
    host.getByRole("list", { name: "Players" }).getByRole("listitem"),
  ).toHaveCount(6);
  await bounds(host);
  await host.screenshot({ path: "test-results/six-player-small-phone.png" });
  const extra = await browser.newContext();
  const page = await extra.newPage();
  await page.goto(`/?room=${code}`);
  await page.getByLabel("Your name").fill("Alex");
  await expect(
    page.getByRole("button", { name: "Return as Alex" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(
    page.getByText("This night is full. Try another room."),
  ).toBeVisible();
  await extra.close();
  for (const c of friends) await c.close();
  await hostContext.close();
});
test("real production restart returns two sessions to title and both can create again", async ({
  browser,
}) => {
  let process: ChildProcess;
  const start = async () => {
    process = spawn(
      globalThis.process.execPath,
      ["dist/server/server/index.js"],
      { env: { ...globalThis.process.env, PORT: "5176" }, stdio: "pipe" },
    );
    await new Promise<void>((resolve, reject) => {
      process.stdout!.once("data", () => resolve());
      process.once("error", reject);
      process.once("exit", () =>
        reject(new Error("Server exited before listening")),
      );
    });
  };
  const stop = async () => {
    if (process.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      process.once("exit", () => resolve());
      process.kill();
    });
  };
  const aContext = await browser.newContext({
      viewport: { width: 667, height: 375 },
    }),
    bContext = await browser.newContext({
      viewport: { width: 1366, height: 768 },
    });
  try {
    await start();
    const a = await aContext.newPage(),
      b = await bContext.newPage();
    await a.goto("http://127.0.0.1:5176");
    await a.getByLabel("Your name").fill("Alex");
    await a
      .getByRole("button", { name: "Create a night", exact: true })
      .click();
    await expect(a.getByTestId("room-code")).toBeVisible();
    const code = await a.getByTestId("room-code").innerText();
    await b.goto(`http://127.0.0.1:5176/?room=${code}`);
    await b.getByLabel("Your name").fill("Sam");
    await b.getByRole("button", { name: "Join", exact: true }).click();
    await expect(b.getByRole("list", { name: "Players" })).toContainText(
      "Sam (you)",
    );
    await a.getByRole('button',{name:'Start the night',exact:true}).click();
    await a.locator('canvas[data-ready="true"]').waitFor();
    await b.locator('canvas[data-ready="true"]').waitFor();
    await a.keyboard.down('d');await a.waitForTimeout(300);await a.keyboard.up('d');
    await stop();
    await start();
    for (const p of [a, b]) {
      await expect(
        p.getByText(
          "The street has gone quiet after a restart. Create a new night to play again.",
        ),
      ).toBeVisible({ timeout: 15000 });
      await expect(
        p.getByRole("button", { name: "Create a night", exact: true }),
      ).toBeEnabled();
      expect(new URL(p.url()).search).toBe("");
      await bounds(p);
    }
    await a
      .getByRole("button", { name: "Create a night", exact: true })
      .click();
    await expect(a.getByTestId("room-code")).toBeVisible();
  } finally {
    await aContext.close();
    await bContext.close();
    await stop();
  }
});
test("duplicated tab takes over once and displaced tab stops reclaiming its seat", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 568, height: 320 },
  });
  const a = await context.newPage();
  const code = await create(a, "Alex");
  const credential = await a.evaluate(() =>
    sessionStorage.getItem("maple:seat:v1"),
  );
  const b = await context.newPage();
  await b.addInitScript(
    (value) => sessionStorage.setItem("maple:seat:v1", value!),
    credential,
  );
  await b.goto(`/?room=${code}`);
  await expect(b.getByRole("list", { name: "Players" })).toContainText(
    "Alex (you)",
  );
  await expect(
    a.getByText("Your seat continued in another tab.", { exact: true }),
  ).toBeVisible();
  expect(
    await a.evaluate(() => sessionStorage.getItem("maple:seat:v1")),
  ).toBeNull();
  await bounds(b);
  await bounds(a);
  // Leave enough time for an erroneous automatic reconnect/resume to fight back.
  await a.waitForTimeout(2500);
  await expect(
    a.getByText("Your seat continued in another tab.", { exact: true }),
  ).toBeVisible();
  await expect(b.getByRole("list", { name: "Players" })).toContainText(
    "Alex (you)",
  );
  await a.reload();
  await expect(
    a.getByRole("button", { name: "Create a night", exact: true }),
  ).toBeVisible();
  await b.reload();
  await expect(b.getByRole("list", { name: "Players" })).toContainText(
    "Alex (you)",
  );
  await context.close();
});
test("returning from page cache keeps exactly one connection and the same seat", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 667, height: 375 },
  });
  await context.addInitScript(() => {
    const Native = WebSocket;
    Object.assign(window, { socketCount: 0 });
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        (window as unknown as { socketCount: number }).socketCount++;
      }
    };
  });
  const page = await context.newPage();
  await create(page);
  const id = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem("maple:seat:v1")!).playerId,
  );
  await page.evaluate(() => {
    dispatchEvent(new PageTransitionEvent("pagehide"));
    for (let i = 0; i < 5; i++)
      dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  await expect(
    page.getByText("Reconnecting to the street...", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Start the night", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("maple:seat:v1")!).playerId,
    ),
  ).toBe(id);
  expect(
    await page.evaluate(
      () => (window as unknown as { socketCount: number }).socketCount,
    ),
  ).toBe(2);
  await context.close();
});
test("silent browser-side drop resumes before the stale server socket expires", async ({
  browser,
}) => {
  const sockets = new Set<Socket>();
  const tunnels: { client: Socket; upstream: Socket; blackhole: boolean }[] =
    [];
  let staleOpenAtReconnect = false;
  const relay = createTcpServer((client) => {
    const upstream = connectTcp(5175, "127.0.0.1");
    const tunnel = { client, upstream, blackhole: false };
    sockets.add(client);
    sockets.add(upstream);
    client.once("data", (data) => {
      if (data.toString().startsWith("GET /live ")) {
        if (tunnels.length)
          staleOpenAtReconnect = !tunnels[0].upstream.destroyed;
        tunnels.push(tunnel);
      }
    });
    client.pipe(upstream);
    upstream.pipe(client);
    client.on("close", () => {
      sockets.delete(client);
      if (!tunnel.blackhole) upstream.destroy();
    });
    client.on("error", () => {
      if (!tunnel.blackhole) upstream.destroy();
    });
    upstream.on("close", () => {
      sockets.delete(upstream);
      client.destroy();
    });
    upstream.on("error", () => client.destroy());
  });
  await new Promise<void>((resolve) => relay.listen(0, "127.0.0.1", resolve));
  const port = (relay.address() as { port: number }).port;
  const phone = await browser.newContext({
    viewport: { width: 667, height: 375 },
    hasTouch: true,
  });
  const laptop = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  try {
    const a = await phone.newPage(),
      b = await laptop.newPage();
    let resumed = false;
    a.on("websocket", (ws) =>
      ws.on("framereceived", (frame) => {
        const data = JSON.parse(frame.payload.toString());
        if (
          tunnels.length > 1 &&
          data.type === "result" &&
          data.ok &&
          data.seat
        )
          resumed = true;
      }),
    );
    await a.goto(`http://127.0.0.1:${port}/`);
    await a.getByLabel("Your name").fill("Alex");
    await a
      .getByRole("button", { name: "Create a night", exact: true })
      .click();
    await expect(a.getByTestId("room-code")).toBeVisible();
    const code = await a.getByTestId("room-code").innerText();
    const seat = await a.evaluate(() =>
      sessionStorage.getItem("maple:seat:v1"),
    );
    await b.goto(`/?room=${code}`);
    await b.getByLabel("Your name").fill("Sam");
    await b.getByRole("button", { name: "Join", exact: true }).click();
    await expect(b.getByRole("list", { name: "Players" })).toContainText(
      "Sam (you)",
    );
    expect(tunnels).toHaveLength(1);
    await a.getByRole('button', {name:'Start the night',exact:true}).click();
    await a.locator('canvas[data-ready="true"]').waitFor();
    await b.locator('canvas[data-ready="true"]').waitFor();
    await a.keyboard.down('d');
    await a.waitForTimeout(400);
    await a.keyboard.up('d');
    await a.waitForTimeout(250);
    const beforeDrop = JSON.parse(await a.locator('canvas').getAttribute('data-playerposes') ?? '{}');
    const old = tunnels[0];
    old.blackhole = true;
    old.client.unpipe(old.upstream);
    old.upstream.unpipe(old.client);
    // Destroy only the browser leg. No WebSocket close, TCP FIN or RST reaches the server leg.
    const began = Date.now();
    old.client.destroy();
    expect(old.upstream.destroyed).toBe(false);
    await expect.poll(() => resumed, { timeout: 3000 }).toBe(true);
    const elapsed = Date.now() - began;
    expect(elapsed).toBeLessThan(3000);
    expect(staleOpenAtReconnect).toBe(true);
    expect(
      await a.evaluate(() => sessionStorage.getItem("maple:seat:v1")),
    ).toBe(seat);
    await expect(a.locator('canvas[data-ready="true"]')).toBeVisible();
    await expect(a.locator('canvas')).toHaveAttribute('data-role','hider');
    await expect(a.locator('canvas')).toHaveAttribute('data-location','street');
    const playerId = JSON.parse(seat!).playerId;
    await expect.poll(async()=>JSON.parse(await a.locator('canvas').getAttribute('data-playerposes') ?? '{}')[playerId]?.x).toBeCloseTo(beforeDrop[playerId].x,1);
    await expect(
      a.getByText(
        "Your seat is still reconnecting. You can also join as another player.",
      ),
    ).toHaveCount(0);
    await expect(
      b
        .getByRole("listitem")
        .filter({ hasText: "Alex" })
        .getByText("Here", { exact: true }),
    ).toHaveCount(1);
    await bounds(a);
    await bounds(b);
    await a.screenshot({ path: "test-results/silent-drop-phone.png" });
    await b.screenshot({ path: "test-results/silent-drop-laptop.png" });
    console.log(
      `Silent drop recovered in ${elapsed} ms with stale upstream still open at reconnect.`,
    );
  } finally {
    await phone.close();
    await laptop.close();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => relay.close(() => resolve()));
  }
});
