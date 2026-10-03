import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createGameServer } from "../server/index.js";
import { Player } from "./helpers.js";

test("real Socket.IO rooms enforce seats, reconnect credentials, presence, radio limits and legal actions", async () => {
  const app = createGameServer();
  await new Promise<void>((resolve) =>
    app.http.listen(0, "127.0.0.1", resolve),
  );
  const url = `http://127.0.0.1:${(app.http.address() as AddressInfo).port}`;
  const a = new Player(url),
    b = new Player(url),
    stranger = new Player(url),
    rejoin = new Player(url);
  try {
    await Promise.all([
      a.connect(),
      b.connect(),
      stranger.connect(),
      rejoin.connect(),
    ]);
    assert.equal((await stranger.request("join", { code: "XXXXX" })).ok, false);
    const created = await a.request("create", { name: "Same Name" });
    assert.equal(created.ok, true);
    assert.match(created.code!, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
    assert.match(created.token!, /^[a-f0-9]{64}$/);
    const joined = await b.request("join", {
      code: created.code,
      name: "Same Name",
    });
    assert.equal(joined.ok, true);
    assert.notEqual(
      joined.playerId,
      created.playerId,
      "names are not authentication",
    );
    assert.equal(
      (
        await stranger.request("join", {
          code: created.code,
          name: "Same Name",
        })
      ).ok,
      false,
    );
    assert.equal(
      (
        await stranger.request("join", {
          code: created.code,
          token: "wrong-token",
        })
      ).ok,
      false,
      "only the secret token authorizes a replacement",
    );
    const claims = await Promise.all([
      a.request("action", { type: "claim", role: "alex" }),
      b.request("action", { type: "claim", role: "alex" }),
    ]);
    assert.equal(claims.filter((x) => x.ok).length, 1);
    const alex = claims[0].ok ? a : b;
    const sam = claims[0].ok ? b : a;
    await sam.action({ type: "claim", role: "sam" });
    await alex.wait(
      (s) =>
        s.players.filter((p) => p.role === "alex").length === 1 &&
        s.players.filter((p) => p.role === "sam").length === 1,
    );
    assert.equal(
      (await alex.request("action", { type: "interact", target: "marker" })).ok,
      false,
    );
    sam.socket.emit("visibility", { visible: false });
    await alex.wait((s) =>
      s.players.some((p) => p.role === "sam" && !p.visible),
    );
    await alex.action({ type: "ready" });
    await sam.action({ type: "ready" });
    assert.equal(alex.state!.phase, "opening");
    assert.equal(alex.state!.paused, false);
    await alex.wait((s) => s.phase === "opening");
    await sam.wait((s) => s.phase === "opening");
    assert.equal(alex.state!.phaseStartedAt, sam.state!.phaseStartedAt);
    await alex.wait((s) => s.phase === "flashlights");
    await sam.wait((s) => s.phase === "flashlights");
    await alex.action({ type: "interact", target: "flashlight-alex" });
    await sam.action({ type: "interact", target: "flashlight-sam" });
    sam.socket.emit("visibility", { visible: true });
    await alex.wait((s) => s.players.every((p) => p.visible));
    await sam.wait((s) => s.phase === "shelf");
    const room = app.rooms.get(created.code!)!;
    assert(
      !room
        .snapshot(room.players.find((p) => p.role === "alex")!)
        .targets.some((t) => t.label.includes("route card")),
    );
    const shelf = sam.state!.targets.find((t) =>
      t.label.includes("route card"),
    )!;
    assert(shelf);
    assert.equal(
      (await sam.request("action", { type: "interact", target: shelf.id })).ok,
      false,
      "partner beam required",
    );
    const beamEvent = new Promise<any>((resolve) =>
      sam.socket.once("beam", resolve),
    );
    alex.socket.emit("beam", { x: shelf.x, y: shelf.y, on: true });
    assert.equal((await beamEvent).role, "alex");
    alex.socket.emit("visibility", { visible: false });
    await sam.wait((s) =>
      s.players.some((p) => p.role === "alex" && !p.visible),
    );
    assert.equal(room.paused, false);
    await sam.action({ type: "interact", target: shelf.id });
    assert.equal(room.phase, "key");
    assert.equal(
      room.beams.alex.on,
      false,
      "phase advance cancels the hidden handoff lease",
    );
    alex.socket.emit("visibility", { visible: true });
    await sam.wait((s) => s.players.every((p) => p.visible));
    assert.equal(
      (await sam.request("action", { type: "interact", target: shelf.id })).ok,
      false,
    );
    assert.equal(room.inventory.filter((x) => x === "route-card").length, 1);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const before = { ...room.beams.alex };
    alex.socket.emit("beam", { x: null, y: "bad", on: true });
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.deepEqual(room.beams.alex, before);

    const text = "<img src=x onerror=alert(1)> hello";
    assert.equal((await alex.request("radio", { text })).ok, true);
    await sam.wait((s) =>
      s.messages.some((m) => m.text === text && m.kind === "player"),
    );
    assert.equal(
      (await alex.request("radio", { text: "a".repeat(181) })).ok,
      false,
    );
    for (let i = 0; i < 7; i++)
      assert.equal(
        (await alex.request("radio", { text: `message ${i}` })).ok,
        true,
      );
    assert.equal((await alex.request("radio", { text: "too many" })).ok, false);

    const credential = sam === a ? created : joined;
    const role = sam.state!.you.role;
    const phase = room.phase;
    sam.close();
    await alex.wait((s) => s.paused && s.players.some((p) => !p.connected));
    assert.equal(
      (
        await stranger.request("join", {
          code: created.code,
          name: "Same Name",
        })
      ).ok,
      false,
    );
    assert.equal(
      (await stranger.request("join", { code: created.code, token: "invalid" }))
        .ok,
      false,
    );
    const recovered = await rejoin.request("join", {
      code: created.code,
      token: credential.token,
    });
    assert.equal(recovered.ok, true);
    assert.equal(recovered.playerId, credential.playerId);
    await rejoin.wait(
      (s) =>
        !s.paused &&
        s.phase === phase &&
        s.you.role === role &&
        s.inventory.includes("route-card"),
    );
    const replaced = new Promise<{ error: string }>((resolve) =>
      rejoin.socket.once("seat-replaced", resolve),
    );
    const replacement = await stranger.request("join", {
      code: created.code,
      token: credential.token,
    });
    assert.equal(
      replacement.ok,
      true,
      "valid token replaces a connection without waiting for heartbeat expiry",
    );
    assert.equal(replacement.playerId, credential.playerId);
    assert.match((await replaced).error, /another tab/);
    await stranger.wait(
      (s) => !s.paused && s.you.connected && s.phase === phase,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(rejoin.socket.connected, false);
    assert.equal(
      room.players.find((p) => p.id === credential.playerId)!.connected,
      true,
      "closing the old socket never disconnects its replacement",
    );
    assert.equal(room.players.length, 2);
    assert.equal(
      (await stranger.request("hint", {})).ok,
      true,
      "replacement membership is live",
    );
  } finally {
    a.close();
    b.close();
    stranger.close();
    rejoin.close();
    await app.close();
  }
});
