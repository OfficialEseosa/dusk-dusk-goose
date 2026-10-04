import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';
import { HIDING_SPOTS } from '../shared/round.js';
import type { ClientRequest, ServerMessage } from '../shared/protocol.js';
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean, description: string, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) { assert.ok(Date.now() < deadline, `Timed out waiting for ${description}`); await wait(10); }
}
// The test and its in-process server share a clock. Use the server's actual
// deadline rather than assuming a request, broadcast and fixed sleep align.
async function afterServerDeadline(deadline: number) {
  await wait(Math.max(0, deadline - Date.now()) + 20);
}
async function setup(roundDurations: Parameters<typeof createGameServer>[0]['roundDurations'] = {}) {
  const game = createGameServer({ roundDurations: { blackoutMs: 0, hidingMs: 20_000, seekingMs: 60_000, revealMs: 40, ...roundDurations } });
  await new Promise<void>(resolve => game.server.listen(0, '127.0.0.1', resolve));
  const address = game.server.address(); assert.ok(address && typeof address !== 'string');
  async function connect() {
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/live`), messages: ServerMessage[] = [];
    socket.on('message', bytes => messages.push(JSON.parse(bytes.toString())));
    await new Promise<void>(resolve => socket.once('open', resolve)); let sequence = 0;
    async function request(body: Omit<ClientRequest, 'id'>) {
      const current = [...messages].reverse().find(m => m.type === 'room');
      const epoch = ['pickup','bury','disturb','search_begin','search_cancel','search_complete'].includes(body.type) && current?.type === 'room' ? current.room.round?.number : undefined;
      const id = String(++sequence); socket.send(JSON.stringify({ roundNumber: epoch, ...body, id }));
      for (let i = 0; i < 400; i++) { const message = messages.find(m => m.type === 'result' && m.id === id); if (message?.type === 'result') return message; await wait(5); }
      throw new Error('No response: ' + body.type);
    }
    const room = () => {
      const message = [...messages].reverse().find(m => m.type === 'room' || (m.type === 'result' && m.ok && m.room));
      assert.ok(message && 'room' in message && message.room); return message.room;
    };
    return { socket, messages, request, room };
  }
  return { game, connect };
}
type Client = Awaited<ReturnType<Awaited<ReturnType<typeof setup>>['connect']>>;
async function move(client: Client, playerId: string, axis: 'x' | 'z', target: number) {
  const deadline = Date.now() + 20_000;
  while (Math.abs(client.room().players.find(p => p.id === playerId)![axis] - target) > .01) {
    assert.ok(Date.now() < deadline, `Player failed to move on ${axis} toward ${target}`);
    await wait(205); const pose = client.room().players.find(p => p.id === playerId)!;
    const value = pose[axis] + Math.sign(target - pose[axis]) * Math.min(.75, Math.abs(target - pose[axis]));
    client.socket.send(JSON.stringify({ id: 'move', type: 'move', x: axis === 'x' ? value : pose.x, z: axis === 'z' ? value : pose.z, facing: Math.PI / 2, seq: pose.seq + 1 }));
    await until(() => client.room().players.find(p => p.id === playerId)!.seq >= pose.seq + 1, 'accepted movement snapshot');
  }
}
async function create(client: Client, name: string) { const result = await client.request({ type: 'create', name }); assert.ok(result.ok && result.seat && result.room); return result; }
async function atSpot(client: Client, id: string, spot = HIDING_SPOTS[8]) { await move(client, id, 'z', -5.5); await move(client, id, 'x', spot.x); await move(client, id, 'z', spot.z); }

test('human burial, private projection, full server hold, wrong cooldown, one reveal and rotation', async () => {
  const { game, connect } = await setup({ cooldownMs: 2000, hidingMs: 12_000 });
  try {
    const a = await connect(), b = await connect(), c = await create(a, 'Alex');
    const joined = await b.request({ type: 'join', name: 'Sam', code: c.room.code }); assert.ok(joined.ok && joined.seat);
    const otherSeeker = await connect(), joinedOther = await otherSeeker.request({ type: 'join', name: 'Lee', code: c.room.code }); assert.ok(joinedOther.ok && joinedOther.seat);
    const started = await a.request({ type: 'start' }); assert.ok(started.ok && started.room?.round?.hiderId === c.seat.playerId);
    await until(() => b.room().round?.phase === 'hiding', 'seeker hiding-phase projection');
    assert.equal(b.room().players.some(p => p.id === c.seat.playerId), false);
    assert.equal((await b.request({ type: 'bury', spotId: HIDING_SPOTS[8].id })).ok, false);
    await atSpot(a, c.seat.playerId); assert.ok((await a.request({ type: 'bury', spotId: HIDING_SPOTS[8].id })).ok);
    await until(() => b.room().round?.phase === 'seeking', 'hiding timer to start seeking', 15_000);
    // Add a decoy after seeking begins, then inspect repeated projections. A
    // newly appended decoy must not leave the burial at a privileged list index.
    const otherPose = otherSeeker.room().players.find(p => p.id === joinedOther.seat!.playerId)!;
    otherSeeker.socket.send(JSON.stringify({ id: 'turn-away', type: 'move', x: otherPose.x, z: otherPose.z, facing: 0, seq: otherPose.seq + 1 }));
    await until(() => otherSeeker.room().players.find(p => p.id === joinedOther.seat!.playerId)!.seq > otherPose.seq, 'Other seeker turns away');
    const seekerPose = b.room().players.find(p => p.id === joined.seat!.playerId)!;
    b.socket.send(JSON.stringify({ id: 'turn-away', type: 'move', x: seekerPose.x, z: seekerPose.z, facing: 0, seq: seekerPose.seq + 1 }));
    await until(() => b.room().players.find(p => p.id === joined.seat!.playerId)!.seq > seekerPose.seq, 'Seeker turns away from the decoy author');
    await afterServerDeadline(a.room().players.find(p => p.id === c.seat.playerId)!.frozenUntil ?? 0);
    await atSpot(a, c.seat.playerId, HIDING_SPOTS[11]);
    const decoy = await a.request({ type: 'disturb', spotId: HIDING_SPOTS[11].id, roundNumber: 1 }); assert.ok(decoy.ok);
    const burialRanks = new Set<number>();
    let markSet: string | undefined;
    for (let sample = 0; sample < 20; sample++) {
      const projection = await b.request({ type: 'search_cancel' }); assert.ok(projection.ok && projection.room);
      const identity = JSON.stringify([...projection.room.round!.marks!].sort((a,b) => a.id.localeCompare(b.id)));
      markSet ??= identity; assert.equal(identity, markSet, 'Shuffle preserves stable IDs, coordinates and timestamps');
      burialRanks.add(projection.room.round!.marks!.findIndex(mark => mark.x === HIDING_SPOTS[8].x && mark.z === HIDING_SPOTS[8].z));
    }
    assert.deepEqual([...burialRanks].sort(), [0,1], 'Human burial has no fixed index after a late seeking decoy');
    const prior = b.messages.filter(m => m.type === 'room' || (m.type === 'result' && m.ok && m.room));
    assert.ok(prior.every(m => !JSON.stringify(m).includes('capsuleSpotId')));
    assert.equal(b.room().round?.phase, 'seeking');
    assert.equal((await b.request({ type: 'search_complete', spotId: HIDING_SPOTS[8].id })).ok, false);
    const wrong = HIDING_SPOTS[9]; await atSpot(b, joined.seat.playerId, wrong);
    const wrongBegin = await b.request({ type: 'search_begin', spotId: wrong.id });
    assert.ok(wrongBegin.ok && wrongBegin.room);
    const wrongSearch = wrongBegin.room.players.find(p => p.id === joined.seat!.playerId)?.search; assert.ok(wrongSearch);
    assert.equal(wrongSearch.endsAt - wrongSearch.startedAt, 2000, 'production hold duration is unchanged');
    assert.equal((await b.request({ type: 'search_complete', spotId: wrong.id })).ok, false);
    await afterServerDeadline(wrongSearch.endsAt);
    const wrongComplete = await b.request({ type: 'search_complete', spotId: wrong.id }); assert.ok(wrongComplete.ok && wrongComplete.room);
    await until(() => a.messages.some(m => m.type === 'search_noise') && b.messages.some(m => m.type === 'search_noise'), 'noise on both independent sockets');
    assert.deepEqual(a.messages.filter(m => m.type === 'search_noise'), b.messages.filter(m => m.type === 'search_noise'));
    const blocked = await b.request({ type: 'search_begin', spotId: wrong.id }); assert.ok(!blocked.ok && blocked.error.code === 'cooldown');
    const cooldownUntil = wrongComplete.room.players.find(p => p.id === joined.seat!.playerId)?.cooldownUntil; assert.ok(cooldownUntil);
    await atSpot(b, joined.seat.playerId); await afterServerDeadline(cooldownUntil);
    const rightBegin = await b.request({ type: 'search_begin', spotId: HIDING_SPOTS[8].id }); assert.ok(rightBegin.ok && rightBegin.room);
    const rightSearch = rightBegin.room.players.find(p => p.id === joined.seat!.playerId)?.search; assert.ok(rightSearch);
    await afterServerDeadline(rightSearch.endsAt); assert.ok((await b.request({ type: 'search_complete', spotId: HIDING_SPOTS[8].id })).ok);
    assert.equal((await b.request({ type: 'search_complete', spotId: HIDING_SPOTS[8].id })).ok, false);
    assert.equal(b.room().round?.capsuleSpotId, HIDING_SPOTS[8].id); assert.equal(b.room().round?.foundBy, joined.seat.playerId); assert.equal(b.room().round?.foundByName, 'Sam');
    const scores = b.room().match!.scores;
    const hiderScore = scores.find(entry => entry.playerId === c.seat.playerId)!;
    const seekerScore = scores.find(entry => entry.playerId === joined.seat.playerId)!;
    assert.equal(hiderScore.score + seekerScore.score, 60, 'Elapsed and remaining server seconds partition the round');
    assert.ok(seekerScore.score > 0 && hiderScore.score > 0);
    assert.equal(scores.find(entry => entry.playerId === joinedOther.seat.playerId)!.score, seekerScore.score, 'Every seeker earns the remaining seconds, not just the finder');
    assert.ok(b.room().round?.revealReadyAt); await afterServerDeadline(b.room().round!.revealReadyAt!); const next = await a.request({ type: 'start' }); assert.ok(next.ok && next.room?.round?.hiderId === joined.seat.playerId);
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
    await a.request({ type: 'start' });
    await until(() => a.room().round?.phase === 'reveal', 'first round reveal');
    await afterServerDeadline(a.room().round!.revealReadyAt!);
    const second = await a.request({ type: 'start' }); assert.ok(second.ok && second.room?.round?.hiderId === joinedB.seat.playerId);
    await b.request({ type: 'leave' });
    await until(() => a.room().round?.phase === 'reveal', 'second round reveal after hider leaves');
    await afterServerDeadline(a.room().round!.revealReadyAt!);
    const third = await a.request({ type: 'start' }); assert.ok(third.ok && third.room?.round?.hiderId === joinedC.seat.playerId);
  } finally { await game.close(); }
});
