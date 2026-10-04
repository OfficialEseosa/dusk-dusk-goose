import test from "node:test";
import assert from "node:assert/strict";
import { insideStreet, legalStreetMove, moveOnStreet, SOLIDS, PLAYER_RADIUS } from "../shared/street-layout.js";

test("every rendered body blocks its occupied footprint with player clearance", () => {
  for (const solid of SOLIDS) {
    const x = (solid.minX + solid.maxX) / 2, z = (solid.minZ + solid.maxZ) / 2;
    assert.equal(insideStreet(x, z), false, solid.id);
    assert.equal(insideStreet(solid.maxX + PLAYER_RADIUS / 2, z), false, `${solid.id} clearance`);
  }
  assert.equal(insideStreet(0, 2), true);
  assert.equal(insideStreet(0, -18), true, "gaps between houses are walkable");
});

test("swept validation rejects crossing a thin lamp with clear endpoints", () => {
  const from = { x: -29.6, z: -3.9 }, to = { x: -28.4, z: -3.9 };
  assert.ok(insideStreet(from.x, from.z) && insideStreet(to.x, to.z));
  assert.equal(legalStreetMove(from, to), false);
  assert.equal(legalStreetMove({ x: -29.6, z: -3 }, { x: -28.4, z: -3 }), true);
});

test("device sliding stops at a car and continues along its face", () => {
  const from = { x: -17, z: 1.6 };
  const result = moveOnStreet(from, { x: -15, z: -0.5 });
  assert.ok(result.x > from.x + 1.5, "horizontal motion remains available");
  assert.ok(result.z >= 0.75 - 0.001, "cannot enter expanded car footprint");
  assert.ok(insideStreet(result.x, result.z));
  const away = moveOnStreet(result, { x: result.x, z: result.z + 0.3 });
  assert.ok(away.z > result.z, "can move away without sticking");
});

test("large movement cannot tunnel through a car, house or street boundary", () => {
  assert.equal(legalStreetMove({ x: -22, z: -0.8 }, { x: -12, z: -0.8 }), false);
  const stopped = moveOnStreet({ x: -22, z: -0.8 }, { x: -12, z: -0.8 });
  assert.ok(stopped.x < -19.4);
  assert.ok(insideStreet(stopped.x, stopped.z));
  assert.equal(legalStreetMove({ x: -30, z: -10 }, { x: -30, z: -18 }), false);
  const edge = moveOnStreet({ x: 35, z: 5 }, { x: 100, z: 5 });
  assert.ok(Math.abs(edge.x - 36) < 0.001);
  assert.equal(legalStreetMove({ x: 35, z: 5 }, { x: 36.1, z: 5 }), false);
});
