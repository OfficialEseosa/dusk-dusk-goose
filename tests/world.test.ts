import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createGameServer } from "../server/index.js";
import { Player } from "./helpers.js";
import type { PlayerPose, Role } from "../shared/protocol.js";

test("3D movement relays only an authenticated own-house pose and survives seat replacement", async () => {
  const app = createGameServer();
  await new Promise<void>((resolve) =>
    app.http.listen(0, "127.0.0.1", resolve),
  );
  const url = `http://127.0.0.1:${(app.http.address() as AddressInfo).port}`;
  const alex = new Player(url),
    sam = new Player(url),
    stranger = new Player(url),
    replacement = new Player(url);
  const received: { role: Role; pose: PlayerPose }[] = [];
  sam.socket.on("pose", (event) => received.push(event));
  const pause = () => new Promise((resolve) => setTimeout(resolve, 80));
  try {
    await Promise.all([
      alex.connect(),
      sam.connect(),
      stranger.connect(),
      replacement.connect(),
    ]);
    const created = await alex.request("create", { name: "Alex" });
    await sam.request("join", { code: created.code, name: "Sam" });
    await alex.action({ type: "claim", role: "alex" });
    await sam.action({ type: "claim", role: "sam" });
    assert.deepEqual(sam.state?.poses?.alex, { x: 0, z: 1.5, yaw: 0 });
    stranger.socket.emit("pose", { x: 0.1, z: 1.5, yaw: 0 });
    await pause();
    assert.equal(received.length, 0);
    // A spoofed role has no influence: membership supplies the actor.
    alex.socket.emit("pose", { role: "sam", x: 0.3, z: 1.5, yaw: 7 });
    await pause();
    assert.equal(received.length, 1);
    assert.equal(received[0].role, "alex");
    assert.equal(received[0].pose.x, 0.3);
    assert(Math.abs(received[0].pose.yaw) <= Math.PI);
    for (const bad of [
      { x: 10, z: 1.5, yaw: 0 },
      { x: 0.3, z: 4, yaw: 0 },
      { x: 0.3, z: 1.5, yaw: null },
      { x: 3.9, z: -2.9, yaw: 0 },
    ]) {
      alex.socket.emit("pose", bad);
      await pause();
    }
    assert.equal(
      received.length,
      1,
      "invalid bounds, nonfinite angles and teleporting are discarded",
    );
    alex.socket.emit("visibility", { visible: false });
    await sam.wait((s) =>
      s.players.some((p) => p.role === "alex" && !p.visible),
    );
    alex.socket.emit("pose", { x: 0.4, z: 1.5, yaw: 0 });
    await pause();
    assert.equal(received.length, 1, "a hidden tab does not move the avatar");
    await replacement.request("join", {
      code: created.code,
      token: created.token,
    });
    assert.equal(replacement.state?.you.id, created.playerId);
    assert.equal(replacement.state?.poses?.alex.x, 0.3);
    assert.equal(alex.socket.connected, false);
    replacement.socket.emit("pose", { x: 0.5, z: 1.5, yaw: 0.2 });
    await pause();
    assert.equal(received.length, 2);
    assert.equal(received[1].pose.x, 0.5);
    await sam.request("radio", { text: "I can see you." });
    assert.equal(
      sam.state?.poses?.alex.x,
      0.5,
      "snapshots retain the latest accepted movement",
    );
  } finally {
    [alex, sam, stranger, replacement].forEach((player) => player.close());
    await app.close();
  }
});
