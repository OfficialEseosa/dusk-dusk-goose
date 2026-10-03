import test from "node:test";
import assert from "node:assert/strict";
import { GameRoom } from "../server/game.js";
import type { Role } from "../shared/protocol.js";

for (const seed of [0, 1])
  for (const disclosure of ["tell", "defer"] as const) {
    test(`seed ${seed}: ${disclosure} branch completes with both roles and replay resets`, () => {
      const room = new GameRoom(`TEST${seed}`, Date.now(), seed);
      const alex = room.addPlayer("Alex", "a");
      const sam = room.addPlayer("Sam", "s");
      const player = { alex, sam };
      room.action(alex, { type: "claim", role: "alex" });
      room.action(sam, { type: "claim", role: "sam" });
      room.action(alex, { type: "ready" });
      room.action(sam, { type: "ready" });
      assert.equal(room.phase, "opening");
      for (let i = 1; i <= 9; i++) room.tick(Date.now() + i * 500);
      assert.equal(room.phase, "flashlights");
      assert(!room.snapshot(alex).privateText.includes("leave tomorrow"));
      assert(room.snapshot(sam).privateText.includes("leave tomorrow"));
      room.action(alex, { type: "interact", target: "flashlight-alex" });
      room.action(alex, { type: "interact", target: "flashlight-alex" });
      assert.equal(
        room.inventory.filter((x) => x === "flashlight-alex").length,
        1,
      );
      room.action(sam, { type: "interact", target: "flashlight-sam" });

      function reach(actor: Role, id: string) {
        const target = room.targets(actor).find((t) => t.id === id)!;
        assert(target, id);
        const guide: Role = actor === "alex" ? "sam" : "alex";
        room.setBeam(player[guide], { x: target.x, y: target.y, on: true });
        room.action(player[actor], { type: "interact", target: id });
      }
      assert.throws(
        () =>
          room.action(alex, {
            type: "interact",
            target: `shelf-${room.shelfIndex}`,
          }),
        /friend/,
      );
      assert.throws(
        () =>
          room.action(sam, {
            type: "interact",
            target: `shelf-${room.shelfIndex}`,
          }),
        /light/,
      );
      reach("sam", `shelf-${room.shelfIndex}`);
      assert.throws(
        () =>
          room.action(sam, {
            type: "interact",
            target: `shelf-${room.shelfIndex}`,
          }),
        /available/,
      );
      reach("alex", "key");
      const wrong = (room.passageSolution[0] + 1) % 3;
      reach("alex", `step-${wrong}`);
      assert.equal(room.passageStep, 0);
      assert.equal(room.mistakes, 1);
      for (const step of room.passageSolution) reach("alex", `step-${step}`);
      reach("sam", "latch");
      room.action(sam, { type: "choice", value: disclosure });
      if (disclosure === "tell")
        room.action(alex, { type: "choice", value: "understand" });
      assert.equal(room.phase, "route");
      assert.equal(room.disclosed, disclosure === "tell");
      for (const landmark of room.routeSolution)
        reach("sam", `landmark-${landmark}`);
      reach("alex", "marker");
      for (const role of ["alex", "sam", "alex", "sam"] as Role[])
        reach(role, `capsule-${role}`);
      assert.equal(room.phase, "keepsakes");
      assert.equal(room.inventory.filter((x) => x === "capsule").length, 1);
      room.action(alex, { type: "choice", value: "understand" });
      room.action(sam, { type: "choice", value: "continue" });
      assert.equal(room.phase, "goodbye");
      room.action(alex, { type: "signal", value: true });
      room.tick(Date.now() + 5000);
      assert.equal(room.phase, "goodbye", "one player cannot finish alone");
      room.action(sam, { type: "signal", value: true });
      for (let i = 1; i <= 4; i++) room.tick(Date.now() + 5000 + i * 500);
      assert.equal(room.phase, "ending");
      assert.match(
        room.snapshot(alex).privateText,
        disclosure === "tell" ? /before the tower/ : /under the tower/,
      );
      room.action(alex, { type: "replay" });
      assert.equal(room.phase, "ending");
      room.action(sam, { type: "replay" });
      assert.equal(room.phase, "lobby");
      assert.equal(alex.role, "sam");
      assert.equal(sam.role, "alex");
      assert.equal(room.variant, 1 - seed);
      assert.deepEqual(room.inventory, []);
      assert.equal(room.disclosed, false);
      assert.equal(room.passageStep, 0);
      assert.equal(room.routeStep, 0);
      assert.equal(
        room.players.some((p) => p.ready),
        false,
      );
    });
  }

test("hidden tabs start and act while disconnects pause; finale requires visible overlap", () => {
  const room = new GameRoom("PAUSE");
  const alex = room.addPlayer("Alex", "a");
  const sam = room.addPlayer("Sam", "s");
  room.action(alex, { type: "claim", role: "alex" });
  room.action(sam, { type: "claim", role: "sam" });
  room.visibility(sam, false);
  room.action(alex, { type: "ready" });
  room.action(sam, { type: "ready" });
  assert.equal(room.phase, "opening");
  assert.equal(room.paused, false);
  for (let i = 1; i <= 9; i++) room.tick(Date.now() + i * 500);
  assert.equal(room.phase, "flashlights");
  room.action(alex, { type: "interact", target: "flashlight-alex" });
  assert(room.inventory.includes("flashlight-alex"));
  room.disconnect(sam);
  assert.equal(room.paused, true);
  assert.throws(
    () => room.action(alex, { type: "interact", target: "flashlight-alex" }),
    /return/,
  );
  assert.throws(() => room.reconnect("wrong-token", "s2"), /credential/);
  assert.equal(room.reconnect(sam.token, "s2").id, sam.id);
  assert.equal(room.reconnect(sam.token, "s3").socketId, "s3");
  assert.equal(room.paused, false);
  room.enter("goodbye");
  room.action(alex, { type: "signal", value: true });
  room.action(sam, { type: "signal", value: true });
  room.visibility(sam, false);
  assert.equal(
    room.signals.alex,
    true,
    "hidden friend does not cancel visible signal",
  );
  assert.equal(room.signals.sam, false);
  room.action(sam, { type: "signal", value: true });
  for (let i = 1; i <= 9; i++) room.tick(Date.now() + 5000 + i * 500);
  assert.equal(
    room.phase,
    "goodbye",
    "hidden finale cannot advance even with stale signal input",
  );
  room.visibility(sam, true);
  assert.equal(
    room.signals.sam,
    false,
    "hidden input never restores a finale signal",
  );
  room.action(sam, { type: "signal", value: true });
  for (let i = 1; i <= 3; i++) room.tick(Date.now() + 10000 + i * 500);
  assert.equal(room.phase, "ending");
});

test("actual disconnect preserves the opening countdown until authenticated return", () => {
  const room = new GameRoom("INTRO");
  const alex = room.addPlayer("Alex", "a");
  const sam = room.addPlayer("Sam", "s");
  room.enter("opening");
  room.disconnect(sam);
  for (let i = 1; i <= 60; i++) room.tick(Date.now() + i * 500);
  assert.equal(room.phase, "opening");
  room.reconnect(sam.token, "s2");
  for (let i = 1; i <= 9; i++) room.tick(Date.now() + i * 500);
  assert.equal(room.phase, "flashlights");
});

test("Alex can answer a deferred disclosure during route without repeating the line", () => {
  const room = new GameRoom("LATER", Date.now(), 1);
  const alex = room.addPlayer("Alex", "a");
  const sam = room.addPlayer("Sam", "s");
  room.action(alex, { type: "claim", role: "alex" });
  room.action(sam, { type: "claim", role: "sam" });
  room.enter("disclosure");
  room.action(sam, { type: "choice", value: "defer" });
  room.action(sam, { type: "choice", value: "tell" });
  assert.equal(room.phase, "route");
  room.action(alex, { type: "choice", value: "understand" });
  assert.equal(room.phase, "route");
  assert.equal(room.response, "understand");
  const count = room.messages.length;
  room.action(alex, { type: "choice", value: "stay" });
  assert.equal(room.messages.length, count);
  assert.equal(room.response, "understand");
});
