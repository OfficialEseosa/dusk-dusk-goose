import test from "node:test";
import assert from "node:assert/strict";
import { GameRoom } from "../server/game.js";

function pair() {
  const room = new GameRoom("RECOV", Date.now(), 0);
  const alex = room.addPlayer("Friend", "a");
  const sam = room.addPlayer("Friend", "s");
  room.action(alex, { type: "claim", role: "alex" });
  room.action(sam, { type: "claim", role: "sam" });
  return { room, alex, sam };
}
test("hidden handoff lasts ten seconds, preserves the visible beam, and cannot be renewed while hidden", () => {
  const { room, alex, sam } = pair();
  room.inventory.push(
    "flashlight-alex",
    "flashlight-sam",
    "route-card",
    "gate-key",
  );
  room.enter("passage");
  room.passageStep = 1;
  const target = room.targets("alex").find((t) => t.id === "step-0")!;
  room.setBeam(sam, { x: target.x, y: target.y, on: true });
  room.setBeam(alex, { x: 0.4, y: 0.4, on: true });
  room.visibility(sam, false);
  assert.equal(room.paused, false);
  assert.equal(
    room.beams.alex.on,
    true,
    "hidden friend does not cancel visible flashlight",
  );
  assert.equal(
    room.illuminated("alex", target),
    true,
    "actor can use guide's deliberate beam after tab handoff",
  );
  room.tick(Date.now() + 9900);
  assert.equal(room.beams.sam.on, true);
  room.setBeam(sam, { x: target.x, y: target.y, on: true });
  room.tick(Date.now() + 10100);
  assert.equal(
    room.beams.sam.on,
    false,
    "hidden input cannot extend beam lease",
  );
  assert.equal(room.beams.alex.on, true);
  assert.throws(
    () => room.action(alex, { type: "interact", target: target.id }),
    /light/,
  );
  room.visibility(sam, true);
  assert.equal(room.passageStep, 1);
  assert.equal(room.snapshot(sam).you.role, "sam");
  assert.throws(
    () => room.action(alex, { type: "interact", target: target.id }),
    /light/,
  );
  room.setBeam(sam, { x: target.x, y: target.y, on: true });
  room.action(alex, { type: "interact", target: target.id });
  assert.equal(room.passageStep, 2);
});
test("deferred disclosure can be revisited; repeated choices do not duplicate authored lines", () => {
  const { room, alex, sam } = pair();
  room.enter("disclosure");
  room.action(sam, { type: "choice", value: "defer" });
  assert.equal(room.phase, "route");
  room.action(sam, { type: "choice", value: "tell" });
  const count = room.messages.length;
  room.action(sam, { type: "choice", value: "tell" });
  assert.equal(room.messages.length, count);
  assert.equal(room.disclosed, true);
  room.enter("keepsakes");
  room.action(alex, { type: "choice", value: "stay" });
  const responseCount = room.messages.length;
  room.action(alex, { type: "choice", value: "understand" });
  assert.equal(room.messages.length, responseCount);
  assert.equal(room.finaleResponse, "stay");
  assert.equal(room.phase, "keepsakes");
  room.action(sam, { type: "choice", value: "continue" });
  assert.equal(room.phase, "goodbye");
});

test("disconnect and phase advance clear leased beams immediately", () => {
  const { room, alex, sam } = pair();
  room.inventory.push("flashlight-alex", "flashlight-sam");
  room.enter("key");
  const key = room.targets("alex")[0];
  room.setBeam(sam, { x: key.x, y: key.y, on: true });
  room.visibility(sam, false);
  room.action(alex, { type: "interact", target: key.id });
  assert.equal(
    room.phase,
    "passage",
    "hidden guide's handoff supports actor's ordinary action",
  );
  assert.equal(
    room.beams.sam.on,
    false,
    "key light never leaks into next puzzle",
  );
  room.visibility(sam, true);
  room.setBeam(sam, { x: 0.5, y: 0.5, on: true });
  room.visibility(sam, false);
  room.disconnect(sam);
  assert.equal(room.beams.sam.on, false);
  assert.equal(room.paused, true);
});
