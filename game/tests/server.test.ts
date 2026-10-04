import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGameServer } from "../server/index.js";
import type { ClientRequest, ServerMessage } from "../shared/protocol.js";

async function setup(options: Parameters<typeof createGameServer>[0] = {}) {
  const game = createGameServer(options);
  await new Promise<void>((resolve) =>
    game.server.listen(0, "127.0.0.1", resolve),
  );
  const address = game.server.address();
  assert.ok(address && typeof address !== "string");
  const url = `ws://127.0.0.1:${address.port}/live`;
  return { game, url };
}
async function connect(url: string) {
  const socket = new WebSocket(url);
  const messages: ServerMessage[] = [];
  socket.on("message", (data) =>
    messages.push(JSON.parse(data.toString()) as ServerMessage),
  );
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  let counter = 0;
  async function request(body: Omit<ClientRequest, "id">) {
    const id = `${++counter}`;
    socket.send(JSON.stringify({ ...body, id }));
    const until = Date.now() + 2000;
    while (Date.now() < until) {
      const reply = messages.find(
        (message) => message.type === "result" && message.id === id,
      );
      if (reply?.type === "result") return reply;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error(`No reply to ${body.type}`);
  }
  return { socket, messages, request };
}
test("solo start, shared joins, private credentials, leave and host reassignment", async () => {
  const { game, url } = await setup();
  try {
    const a = await connect(url);
    const created = await a.request({ type: "create", name: "Alex" });
    assert.ok(created.ok && created.seat && created.room);
    const token = created.seat.token;
    const started = await a.request({ type: "start" });
    assert.ok(started.ok && started.room?.phase === "started");
    const b = await connect(url);
    const joined = await b.request({
      type: "join",
      code: created.room.code.toLowerCase(),
      name: "Sam",
    });
    assert.ok(joined.ok && joined.room?.players.length === 2 && joined.seat);
    assert.ok(!JSON.stringify(b.messages).includes(token));
    const unauthorized = await b.request({ type: "start" });
    assert.ok(!unauthorized.ok && unauthorized.error.code === "not_host");
    await a.request({ type: "leave" });
    const nowHost = await b.request({ type: "start" });
    assert.ok(nowHost.ok && nowHost.room?.hostId === joined.seat.playerId);
    assert.equal(nowHost.room?.players.length, 1);
  } finally {
    await game.close();
  }
});
test("only disconnected credential holders can recover a seat, names do not authenticate", async () => {
  const { game, url } = await setup();
  try {
    const a = await connect(url);
    const created = await a.request({ type: "create", name: "Alex" });
    assert.ok(created.ok && created.seat);
    const seat = created.seat;
    const b = await connect(url);
    const live = await b.request({
      type: "recover",
      code: seat.room,
      tokens: [seat.token],
    });
    assert.ok(live.ok && live.offers?.length === 0);
    const steal = await b.request({
      type: "resume",
      code: seat.room,
      token: seat.token,
      bootId: seat.bootId,
    });
    assert.ok(!steal.ok && steal.error.code === "seat_connected");
    await new Promise<void>((resolve) => {
      a.socket.once("close", resolve);
      a.socket.close();
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const wrong = await b.request({
      type: "resume",
      code: seat.room,
      token: "not-the-token",
      name: "Alex",
    });
    assert.ok(!wrong.ok && wrong.error.code === "invalid_token");
    const offers = await b.request({
      type: "recover",
      code: seat.room,
      tokens: [seat.token],
    });
    assert.ok(offers.ok && offers.offers?.[0]?.playerId === seat.playerId);
    const resumed = await b.request({
      type: "resume",
      code: seat.room,
      token: seat.token,
      bootId: seat.bootId,
    });
    assert.ok(resumed.ok && resumed.seat?.playerId === seat.playerId);
  } finally {
    await game.close();
  }
});
test("six seats and room capacity are bounded; old boot token returns restart reason", async () => {
  const { game, url } = await setup({ maxRooms: 1 });
  try {
    const a = await connect(url);
    const created = await a.request({ type: "create", name: "Alex" });
    assert.ok(created.ok && created.seat);
    for (let index = 0; index < 5; index++) {
      const client = await connect(url);
      assert.ok(
        (
          await client.request({
            type: "join",
            code: created.seat.room,
            name: `Friend ${index}`,
          })
        ).ok,
      );
    }
    const seventh = await connect(url);
    const full = await seventh.request({
      type: "join",
      code: created.seat.room,
      name: "Seventh",
    });
    assert.ok(!full.ok && full.error.code === "room_full");
    const excess = await seventh.request({
      type: "create",
      name: "Another night",
    });
    assert.ok(!excess.ok && excess.error.code === "rooms_full");
    const restarted = await seventh.request({
      type: "resume",
      code: created.seat.room,
      token: created.seat.token,
      bootId: "prior-server",
    });
    assert.ok(!restarted.ok && restarted.error.code === "server_restarted");
  } finally {
    await game.close();
  }
});
test("expired disconnected seats disappear without deleting connected players", async () => {
  const { game, url } = await setup({ seatGraceMs: 20, heartbeatMs: 20 });
  try {
    const a = await connect(url);
    const created = await a.request({ type: "create", name: "Alex" });
    assert.ok(created.ok && created.seat);
    const b = await connect(url);
    await b.request({ type: "join", code: created.seat.room, name: "Sam" });
    await new Promise<void>((resolve) => {
      a.socket.once("close", resolve);
      a.socket.close();
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const state = await b.request({ type: "start" });
    assert.ok(
      state.ok &&
        state.room?.players.length === 1 &&
        state.room.players[0]?.name === "Sam",
    );
  } finally {
    await game.close();
  }
});
test("a real process-state restart loses the room and identifies stale credentials", async () => {
  const first = await setup();
  const a = await connect(first.url);
  const created = await a.request({ type: "create", name: "Alex" });
  assert.ok(created.ok && created.seat);
  await first.game.close();
  const second = await setup();
  try {
    const b = await connect(second.url);
    const resumed = await b.request({
      type: "resume",
      code: created.seat.room,
      token: created.seat.token,
      bootId: created.seat.bootId,
    });
    assert.ok(!resumed.ok && resumed.error.code === "server_restarted");
    const fresh = await b.request({ type: "create", name: "Alex" });
    assert.ok(
      fresh.ok && fresh.seat && fresh.seat.bootId !== created.seat.bootId,
    );
  } finally {
    await second.game.close();
  }
});
test("production serves built static files and rejects development routes and foreign origins", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maple-server-"));
  await writeFile(join(directory, "index.html"), "<h1>Maple Street</h1>");
  const { game, url } = await setup({ clientDir: directory });
  try {
    const httpUrl = url.replace("ws:", "http:").replace("/live", "");
    const page = await fetch(httpUrl);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Maple Street/);
    for (const path of [
      "/api/debug",
      "/debug",
      "/__vite_ping",
      "/.env",
      "/missing.glb",
    ])
      assert.equal((await fetch(httpUrl + path)).status, 404);
    const forbidden = new WebSocket(url, {
      origin: "https://unrelated.example",
    });
    await new Promise<void>((resolve, reject) => {
      forbidden.once("error", (error) => {
        assert.match(error.message, /403/);
        resolve();
      });
      forbidden.once("open", () => {
        forbidden.terminate();
        reject(new Error("Foreign origin accepted"));
      });
    });
  } finally {
    await game.close();
    await rm(directory, { recursive: true, force: true });
  }
});
