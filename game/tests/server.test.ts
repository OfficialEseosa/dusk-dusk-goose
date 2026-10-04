import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGameServer } from "../server/index.js";
import type { ClientRequest, ServerMessage } from "../shared/protocol.js";
import {SOLIDS} from '../shared/street-layout.js';

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
test("valid credentials replace live seats; offers stay disconnected-only and names do not authenticate", async () => {
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
    const previousClosed = new Promise<number>((resolve) =>
      a.socket.once("close", resolve),
    );
    const takeover = await b.request({
      type: "resume",
      code: seat.room,
      token: seat.token,
      bootId: seat.bootId,
    });
    assert.ok(takeover.ok && takeover.seat?.playerId === seat.playerId);
    assert.equal(await previousClosed, 4001);
    assert.ok(a.messages.some((message) => message.type === "seat_replaced"));
    assert.ok(takeover.room?.players[0].connected);
    const c = await connect(url);
    await new Promise<void>((resolve) => {
      b.socket.once("close", resolve);
      b.socket.close();
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const wrong = await c.request({
      type: "resume",
      code: seat.room,
      token: "not-the-token",
      name: "Alex",
    });
    assert.ok(!wrong.ok && wrong.error.code === "invalid_token");
    const offers = await c.request({
      type: "recover",
      code: seat.room,
      tokens: [seat.token],
    });
    assert.ok(offers.ok && offers.offers?.[0]?.playerId === seat.playerId);
    const resumed = await c.request({
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

test("street state has stable blackout timing and character poses through late joins and takeover", async () => {
  const { game, url } = await setup();
  try {
    const a = await connect(url);
    const created = await a.request({ type: "create", name: "Alex" });
    assert.ok(created.ok && created.seat);
    const started = await a.request({ type: "start" });
    assert.ok(started.ok && started.room?.startedAt && started.room.blackoutAt);
    assert.equal(started.room.blackoutAt - started.room.startedAt, 10_000);
    const again = await a.request({ type: "start" });
    assert.ok(again.ok && again.room);
    assert.equal(again.room.blackoutAt, started.room.blackoutAt);
    const b = await connect(url);
    const joined = await b.request({ type: "join", code: created.seat.room, name: "Sam" });
    assert.ok(joined.ok && joined.room);
    assert.equal(joined.room.blackoutAt, started.room.blackoutAt);
    assert.deepEqual(joined.room.players.map((player) => player.skin), [0, 1]);
    const pose = started.room.players[0];
    await new Promise((resolve) => setTimeout(resolve, 60));
    a.socket.send(JSON.stringify({ type: "move", id: "move", seq: 1, x: pose.x + 0.1, z: pose.z, facing: 0.5 }));
    await new Promise((resolve) => setTimeout(resolve, 160));
    const c = await connect(url);
    const restored = await c.request({ type: "resume", code: created.seat.room, token: created.seat.token, bootId: created.seat.bootId });
    assert.ok(restored.ok && restored.room);
    const restoredPlayer = restored.room.players.find((player) => player.id === created.seat!.playerId)!;
    assert.equal(restoredPlayer.skin, pose.skin);
    assert.equal(restoredPlayer.x, pose.x + 0.1);
    assert.equal(restoredPlayer.facing, 0.5);
    assert.equal(restoredPlayer.seq, 1);
    assert.equal(restored.room.blackoutAt, started.room.blackoutAt);
  } finally { await game.close(); }
});

test("20 Hz movement has its own budget and invalid speed, boundaries and replay are rejected", async () => {
  const { game, url } = await setup();
  try {
    const a = await connect(url);
    const created = await a.request({ type: "create", name: "Alex" });
    assert.ok(created.ok && created.seat);
    const started = await a.request({ type: "start" });
    assert.ok(started.ok && started.room);
    const pose = started.room.players[0];
    for (let seq = 1; seq <= 60; seq++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      a.socket.send(JSON.stringify({ type: "move", id: "move", seq, x: pose.x + seq * 0.05, z: pose.z, facing: 0.5 }));
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.ok(!a.messages.some((message) => message.type === "pose_rejected"));
    const state = await a.request({ type: "start" });
    assert.ok(state.ok && state.room);
    assert.equal(state.room.players[0].seq, 60);
    assert.equal(state.room.players[0].x, pose.x + 3);
    for (const invalid of [
      { seq: 61, x: 35, z: 2, facing: 0 },
      { seq: 61, x: -37, z: 2, facing: 0 },
      { seq: 60, x: pose.x + 3, z: 2, facing: 0 },
    ]) {
      const before = a.messages.filter((message) => message.type === "pose_rejected").length;
      a.socket.send(JSON.stringify({ type: "move", id: "move", ...invalid }));
      await new Promise((resolve) => setTimeout(resolve, 60));
      assert.equal(a.messages.filter((message) => message.type === "pose_rejected").length, before + 1);
    }
    const current = await a.request({ type: "start" });
    assert.ok(current.ok && current.room);
    assert.equal(current.room.players[0].x, pose.x + 3);
    assert.equal(current.room.players[0].seq, 60);
  } finally { await game.close(); }
});

test("server rejects lamp penetration while accepting bounded legal corner traces", async () => {
  const { game, url } = await setup();
  try {
    const a = await connect(url);
    const created = await a.request({ type: "create", name: "Alex" });
    assert.ok(created.ok);
    const started = await a.request({ type: "start" });
    assert.ok(started.ok && started.room);
    let seq = 0;
    const origin = started.room.players[0];
    for (let index = 1; index <= 25; index++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      a.socket.send(JSON.stringify({ type: "move", id: "move", seq: ++seq, x: origin.x - index * 0.2, z: 2, facing: -Math.PI / 2 }));
    }
    for (let index = 1; index <= 27; index++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      a.socket.send(JSON.stringify({ type: "move", id: "move", seq: ++seq, x: -9, z: 2 - index * 0.2, facing: Math.PI }));
    }
    await new Promise(resolve => setTimeout(resolve, 280));
    assert.ok(!a.messages.some(message => message.type === "pose_rejected"));
    // Both endpoints are outside the lamp body. The one-metre move fits the
    // accumulated speed allowance, but its segment passes through the pole.
    a.socket.send(JSON.stringify({ type: "move", id: "move", seq: ++seq, x: -9, z: -4.4, facing: Math.PI }));
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.ok(a.messages.some(message => message.type === "pose_rejected" && message.seq === seq - 1));
    const result = await a.request({ type: "start" });
    assert.ok(result.ok && result.room);
    assert.ok(Math.abs(result.room.players[0].z + 3.4) < 0.001);
    await new Promise(resolve => setTimeout(resolve, 280));
    const before = a.messages.filter(message => message.type === "pose_rejected").length;
    // The direct chord clips the corner. The two-segment walking trace does not.
    a.socket.send(JSON.stringify({ type: "move", id: "move", seq: ++seq, x: -8.5, z: -3.9, facing: 0 }));
    await new Promise(resolve => setTimeout(resolve, 60));
    assert.equal(a.messages.filter(message => message.type === "pose_rejected").length, before + 1);
    a.socket.send(JSON.stringify({ type: "move", id: "move", seq: ++seq, x: -8.5, z: -3.9, facing: 0,
      path: [{ x: -8.5, z: -3.4 }, { x: -8.5, z: -3.9 }] }));
    await new Promise(resolve => setTimeout(resolve, 120));
    const corner = await a.request({ type: "start" });
    assert.ok(corner.ok && corner.room);
    assert.equal(corner.room.players[0].seq, seq);
    assert.equal(corner.room.players[0].x, -8.5);
    assert.equal(corner.room.players[0].z, -3.9);
    for (const invalid of [
      { x: -9, z: -3.4, path: [{ x: -9, z: -3.9 }, { x: -9, z: -3.4 }] },
      { x: -8.5, z: -3.7, path: [{ x: -8.5, z: -3.8 }] },
      { x: -8.5, z: -3.9, path: Array.from({ length: 33 }, () => ({ x: -8.5, z: -3.9 })) },
      { x: -8.5, z: -3.9, path: [{ x: -7, z: -3.9 }, { x: -8.5, z: -3.9 }] },
      { x: -8.5, z: -3.9, path: [null] },
    ]) {
      const count = a.messages.filter(message => message.type === "pose_rejected").length;
      a.socket.send(JSON.stringify({ type: "move", id: "move", seq: ++seq, facing: 0, ...invalid }));
      await new Promise(resolve => setTimeout(resolve, 60));
      assert.equal(a.messages.filter(message => message.type === "pose_rejected").length, count + 1);
    }
    for(const kind of ['car','lamp','tree','planter','mailbox','house']){
      const solid=SOLIDS.find(s=>s.kind===kind)!;
      const count=a.messages.filter(m=>m.type==='pose_rejected').length;
      a.socket.send(JSON.stringify({type:'move',id:'forged',seq:++seq,x:(solid.minX+solid.maxX)/2,z:(solid.minZ+solid.maxZ)/2,facing:0}));
      await new Promise(resolve=>setTimeout(resolve,60));
      assert.equal(a.messages.filter(m=>m.type==='pose_rejected').length,count+1,`${kind} occupied endpoint rejected`);
    }
    const unchanged=await a.request({type:'start'});
    assert.ok(unchanged.ok&&unchanged.room);
    assert.equal(unchanged.room.players[0].x,-8.5);assert.equal(unchanged.room.players[0].z,-3.9);
  } finally { await game.close(); }
});
