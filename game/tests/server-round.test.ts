import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';
import { HIDING_SPOTS } from '../shared/round.js';
import type { ClientRequest, RoomSnapshot, ServerMessage } from '../shared/protocol.js';
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function setup(roundDurations: Parameters<typeof createGameServer>[0]['roundDurations'] = {}) {
  const game = createGameServer({ roundDurations: { blackoutMs: 0, hidingMs: 20_000, seekingMs: 20_000, revealMs: 40, ...roundDurations } });
  await new Promise<void>(resolve => game.server.listen(0, '127.0.0.1', resolve));
  const address = game.server.address(); assert.ok(address && typeof address !== 'string');
  async function connect() {
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/live`), messages: ServerMessage[] = [];
    socket.on('message', bytes => messages.push(JSON.parse(bytes.toString())));
    await new Promise<void>(resolve => socket.once('open', resolve)); let sequence = 0;
    async function request(body: Omit<ClientRequest, 'id'>) {
      const current = [...messages].reverse().find(m => m.type === 'room');
      const epoch = ['pickup','bury','search_begin','search_cancel','search_complete'].includes(body.type) && current?.type === 'room' ? current.room.round?.number : undefined;
      const id = String(++sequence); socket.send(JSON.stringify({ roundNumber: epoch, ...body, id }));
      for (let i = 0; i < 400; i++) { const message = messages.find(m => m.type === 'result' && m.id === id); if (message?.type === 'result') return message; await wait(5); }
      throw new Error('No response: ' + body.type);
    }
    const room = () => { const message = [...messages].reverse().find(m => m.type === 'room'); assert.ok(message?.type === 'room'); return message.room; };
    return { socket, messages, request, room };
  }
  return { game, connect };
}
type Client = Awaited<ReturnType<Awaited<ReturnType<typeof setup>>['connect']>>;
async function move(client: Client, playerId: string, axis: 'x' | 'z', target: number) {
  while (Math.abs(client.room().players.find(p => p.id === playerId)![axis] - target) > .01) {
    await wait(205); const pose = client.room().players.find(p => p.id === playerId)!;
    const value = pose[axis] + Math.sign(target - pose[axis]) * Math.min(.75, Math.abs(target - pose[axis]));
    client.socket.send(JSON.stringify({ id: 'move', type: 'move', x: axis === 'x' ? value : pose.x, z: axis === 'z' ? value : pose.z, facing: 0, seq: pose.seq + 1 }));
    await wait(105);
  }
}
async function create(client: Client, name: string) { const result = await client.request({ type: 'create', name }); assert.ok(result.ok && result.seat && result.room); return result; }
async function atSpot(client: Client, id: string, spot = HIDING_SPOTS[8]) { await move(client, id, 'z', -5.5); await move(client, id, 'x', spot.x); await move(client, id, 'z', spot.z); }

test('human burial, private projection, full server hold, wrong cooldown, one reveal and rotation', async () => {
  const { game, connect } = await setup({ cooldownMs: 180, hidingMs: 6000 });
  try {
    const a = await connect(), b = await connect(), c = await create(a, 'Alex');
    const joined = await b.request({ type: 'join', name: 'Sam', code: c.room.code }); assert.ok(joined.ok && joined.seat);
    const started = await a.request({ type: 'start' }); assert.ok(started.ok && started.room?.round?.hiderId === c.seat.playerId);
    await wait(20); assert.equal(b.room().players.some(p => p.id === c.seat.playerId), false);
    assert.equal((await b.request({ type: 'bury', spotId: HIDING_SPOTS[8].id })).ok, false);
    await atSpot(a, c.seat.playerId); assert.ok((await a.request({ type: 'bury', spotId: HIDING_SPOTS[8].id })).ok);
    await wait(2100);
    const prior = b.messages.filter(m => m.type === 'room' || (m.type === 'result' && m.ok && m.room));
    assert.ok(prior.every(m => !JSON.stringify(m).includes('capsuleSpotId')));
    assert.equal(b.room().round?.phase, 'seeking');
    assert.equal((await b.request({ type: 'search_complete', spotId: HIDING_SPOTS[8].id })).ok, false);
    const wrong = HIDING_SPOTS[9]; await atSpot(b, joined.seat.playerId, wrong);
    assert.ok((await b.request({ type: 'search_begin', spotId: wrong.id })).ok);
    assert.equal((await b.request({ type: 'search_complete', spotId: wrong.id })).ok, false);
    await wait(2010); assert.ok((await b.request({ type: 'search_complete', spotId: wrong.id })).ok);
    assert.ok(b.messages.some(m => m.type === 'search_noise')); assert.ok(a.messages.some(m => m.type === 'search_noise'));
    assert.deepEqual(a.messages.filter(m => m.type === 'search_noise'), b.messages.filter(m => m.type === 'search_noise'));
    const blocked = await b.request({ type: 'search_begin', spotId: wrong.id }); assert.ok(!blocked.ok && blocked.error.code === 'cooldown');
    await atSpot(b, joined.seat.playerId); await b.request({ type: 'search_begin', spotId: HIDING_SPOTS[8].id });
    await wait(2010); assert.ok((await b.request({ type: 'search_complete', spotId: HIDING_SPOTS[8].id })).ok);
    assert.equal((await b.request({ type: 'search_complete', spotId: HIDING_SPOTS[8].id })).ok, false);
    assert.equal(b.room().round?.capsuleSpotId, HIDING_SPOTS[8].id); assert.equal(b.room().round?.foundBy, joined.seat.playerId); assert.equal(b.room().round?.foundByName, 'Sam');
    await wait(50); const next = await a.request({ type: 'start' }); assert.ok(next.ok && next.room?.round?.hiderId === joined.seat.playerId);
    for (const type of ['pickup','bury','search_begin','search_cancel','search_complete'] as const) {
      const stale = await b.request({ type, spotId: HIDING_SPOTS[8].id, roundNumber: 1 });
      assert.ok(!stale.ok && stale.error.code === 'stale_round', `${type} cannot mutate the next round`);
    }
    const missingEpoch = await b.request({ type: 'search_begin', spotId: HIDING_SPOTS[8].id, roundNumber: undefined });
    assert.ok(!missingEpoch.ok && missingEpoch.error.code === 'stale_round');
  } finally { await game.close(); }
});

test('solo pickup, timeout secrecy, late join waits and enters next human round', async () => {
  const { game, connect } = await setup({ seekingMs: 300 });
  try {
    const a = await connect(), c = await create(a, 'Alex'); await a.request({ type: 'start' });
    await move(a, c.seat.playerId, 'x', 0); await move(a, c.seat.playerId, 'z', -1);
    const pickup = await a.request({ type: 'pickup' }); assert.ok(pickup.ok && pickup.room?.round?.phase === 'seeking');
    assert.equal(pickup.room.round.hiderId, null); assert.equal(pickup.room.round.capsuleSpotId, undefined);
    const b = await connect(), joined = await b.request({ type: 'join', name: 'Sam', code: c.room.code });
    assert.ok(joined.ok && joined.seat && joined.room?.players[0].role === 'waiting');
    await wait(500); assert.equal(a.room().round?.phase, 'reveal'); assert.ok(a.room().round?.capsuleSpotId);
    assert.ok((await a.request({ type: 'start' })).ok); await wait(20); assert.equal(b.room().players[0].role, 'seeker');
  } finally { await game.close(); }
});

test('disconnected hider cannot stall fallback burial and seeker resumes role and place', async () => {
  const { game, connect } = await setup({ hidingMs: 200, seekingMs: 800 });
  try {
    const a = await connect(), b = await connect(), c = await create(a, 'Alex');
    const joined = await b.request({ type: 'join', name: 'Sam', code: c.room.code }); assert.ok(joined.ok && joined.seat);
    await a.request({ type: 'start' }); a.socket.terminate(); await wait(300);
    assert.equal(b.room().round?.phase, 'seeking'); b.socket.terminate(); await wait(30);
    const resumed = await connect(), reply = await resumed.request({ type: 'resume', code: c.room.code, token: joined.seat.token });
    assert.ok(reply.ok && reply.room?.players.some(p => p.id === joined.seat!.playerId && p.role === 'seeker' && p.place === 'street'));
    await wait(850); assert.equal(resumed.room().round?.phase, 'reveal');
  } finally { await game.close(); }
});

test('rotation advances past a removed hider rather than returning to the first joiner', async () => {
  const { game, connect } = await setup({ hidingMs: 100, seekingMs: 100, revealMs: 10 });
  try {
    const a = await connect(), b = await connect(), c = await connect(), created = await create(a, 'Alex');
    const joinedB = await b.request({ type: 'join', name: 'Sam', code: created.room.code }); assert.ok(joinedB.ok && joinedB.seat);
    const joinedC = await c.request({ type: 'join', name: 'Lee', code: created.room.code }); assert.ok(joinedC.ok && joinedC.seat);
    await a.request({ type: 'start' }); await wait(350);
    const second = await a.request({ type: 'start' }); assert.ok(second.ok && second.room?.round?.hiderId === joinedB.seat.playerId);
    await b.request({ type: 'leave' }); await wait(350);
    const third = await a.request({ type: 'start' }); assert.ok(third.ok && third.room?.round?.hiderId === joinedC.seat.playerId);
  } finally { await game.close(); }
});
