import { randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import type {
  RadioMessage,
  ClientRequest,
  RoomSnapshot,
  ServerMessage,
} from "../shared/protocol.js";
import { BLACKOUT_DELAY_MS, MOVE_SPEED, legalStreetMove } from "../shared/street-layout.js";
import { HIDING_SPOTS, HIDING_MS, SEEKING_MS, SEARCH_MS, REVEAL_MS, COOLDOWN_MS, FLASHLIGHT_PICKUP, insidePrep, nearSpot } from '../shared/round.js';
import { RADIO_HISTORY_LIMIT, RADIO_TEXT_LIMIT, RADIO_WINDOW_MS, RADIO_MESSAGES_PER_WINDOW, getRadioPhrases } from '../shared/radio.js';
import { FOOTPRINT_LIFE_MS, MAX_FOOTPRINTS, FOOTPRINT_SPACING, FREEZE_MS, FREEZE_IMMUNITY_MS, CLUE_INTERVAL_MS, CLUE_CHOICE_MS, groundBeamStrength, groundHeight, streetRoute, trueCluePool, type TrueClue } from '../shared/trails.js';

interface Seat {
  id: string;
  radioSentAt?: number[];
  joinOrder: number;
  name: string;
  token: string;
  socket?: WebSocket;
  disconnectedAt?: number;
  skin: number;
  x: number;
  z: number;
  facing: number;
  seq: number;
  moveAt: number;
  distanceCredit: number;
  role?: 'hider' | 'seeker' | 'waiting';
  place?: 'prep' | 'street';
  flashlight?: boolean;
  cooldownUntil?: number;
  search?: { spotId: string; startedAt: number; endsAt: number };
  frozenUntil?: number;
  immunityUntil?: number;
}
interface Match {
  id: string; phase: 'playing' | 'finished'; roundNumber: number; totalRounds: number; solo: boolean;
  scores: { playerId: string; name: string; score: number; roundPoints: number }[];
  rosterIds: string[]; announcement: string; nextRoundAt?: number; winnerIds: string[];
}
interface Room {
  code: string;
  phase: "lobby" | "started";
  hostId: string;
  seats: Map<string, Seat>;
  touchedAt: number;
  startedAt?: number;
  blackoutAt?: number;
  movementDirty?: boolean;
  round?: { number: number; phase: 'hiding' | 'seeking' | 'reveal'; hiderId: string | null; phaseEndsAt: number; capsuleSpotId?: string; foundBy?: string | null; foundByName?: string; revealReadyAt?: number };
  match?: Match;
  radio?: RadioMessage[];
  previousHiderOrder?: number;
  nextJoinOrder: number;
  trails?: { footprints: { id: string; x: number; z: number; facing: number; fadeAt: number; expiresAt: number }[]; marks: { id: string; x: number; z: number; createdAt: number }[]; disturbed: Set<string>; decoys: number; lastStep?: { x: number; z: number }; seekingStartedAt?: number; clues: { id: string; text: string; sentAt: number }[]; clueCount: number; offer?: { id: string; options: TrueClue[]; deadlineAt: number } };
}
interface Session {
  revoked?: boolean;
  radioFailureTokens?: number;
  radioFailureAt?: number;
  seat?: Seat;
  room?: Room;
  alive: boolean;
  windowAt: number;
  requests: number;
  movementTokens: number;
  movementAt: number;
}
export interface ServerOptions {
  clientDir?: string;
  maxRooms?: number;
  maxPlayers?: number;
  seatGraceMs?: number;
  abandonedMs?: number;
  heartbeatMs?: number;
  roundDurations?: { hidingMs?: number; seekingMs?: number; searchMs?: number; cooldownMs?: number; revealMs?: number; nextRoundMs?: number; blackoutMs?: number };
  clueIntervalMs?: number;
  clueChoiceMs?: number;
}
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".glb": "model/gltf-binary",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

export function createGameServer(options: ServerOptions = {}) {
  const bootId = randomUUID();
  const rooms = new Map<string, Room>();
  const sessions = new Map<WebSocket, Session>();
  const maxRooms =
    options.maxRooms ?? environmentInteger("MAX_ROOMS", 25, 1, 25);
  const maxPlayers =
    options.maxPlayers ?? environmentInteger("MAX_PLAYERS_PER_ROOM", 6, 1, 6);
  const seatGraceMs =
    options.seatGraceMs ??
    environmentInteger("SEAT_RECONNECT_TTL_SECONDS", 600, 30, 3600) * 1000;
  const abandonedMs =
    options.abandonedMs ??
    environmentInteger("ROOM_IDLE_TTL_SECONDS", 600, 30, 3600) * 1000;
  const clientDir = resolve(
    options.clientDir ?? resolve(process.cwd(), "dist/client"),
  );
  function send(socket: WebSocket, message: ServerMessage) {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 256_000) {
      socket.terminate();
      return;
    }
    socket.send(JSON.stringify(message));
  }
  const durations = { hidingMs: HIDING_MS, seekingMs: SEEKING_MS, searchMs: SEARCH_MS, cooldownMs: COOLDOWN_MS, revealMs: REVEAL_MS, nextRoundMs: 8000, blackoutMs: BLACKOUT_DELAY_MS, ...options.roundDurations };
  function snapshot(room: Room, recipient?: Seat): RoomSnapshot {
    const round = room.round;
    const visibleRound = round && { number: round.number, phase: round.phase, hiderId: round.hiderId, phaseEndsAt: round.phaseEndsAt,
      ...(round.phase === 'reveal' ? { capsuleSpotId: round.capsuleSpotId, foundBy: round.foundBy, foundByName: round.foundByName, revealReadyAt: round.revealReadyAt } : recipient?.role === 'hider' && round.capsuleSpotId ? { capsuleSpotId: round.capsuleSpotId } : {}) };
    return {
      radio: room.radio,
      code: room.code,
      phase: room.phase,
      hostId: room.hostId,
      serverTime: Date.now(),
      startedAt: room.startedAt,
      blackoutAt: room.blackoutAt,
      match: room.match && { id: room.match.id, phase: room.match.phase, roundNumber: room.match.roundNumber, totalRounds: room.match.totalRounds, solo: room.match.solo, scores: room.match.scores, rosterChanged: rosterChanged(room), announcement: room.match.announcement, nextRoundAt: room.match.nextRoundAt, winnerIds: room.match.winnerIds },
      round: visibleRound && { ...visibleRound, seekingStartedAt: room.trails?.seekingStartedAt,
        ...(recipient?.place === 'street' ? { footprints: shuffled([...(room.trails?.footprints ?? [])]), marks: shuffled([...(room.trails?.marks ?? [])]) } : {}),
        clues: room.trails?.clues,
        ...(recipient?.role === 'hider' ? { decoysRemaining: 3 - (room.trails?.decoys ?? 0), clueOffer: room.trails?.offer && { id: room.trails.offer.id, deadlineAt: room.trails.offer.deadlineAt, options: room.trails.offer.options.map(({ id, text }) => ({ id, text })) } } : {}) },
      roster: [...room.seats.values()].map(seat => ({ id: seat.id, name: seat.name, connected: !!seat.socket, skin: seat.skin })),
      players: [...room.seats.values()].filter(seat => !round || seat.place === recipient?.place).map((seat) => ({
        id: seat.id,
        name: seat.name,
        connected: !!seat.socket,
        skin: seat.skin,
        x: seat.x,
        z: seat.z,
        facing: seat.facing,
        seq: seat.seq,
        role: seat.role, place: seat.place, flashlight: seat.flashlight,
        frozenUntil: seat.frozenUntil, immunityUntil: seat.immunityUntil,
        ...(seat.id === recipient?.id ? { cooldownUntil: seat.cooldownUntil, search: seat.search } : {}),
      })),
    };
  }
  function host(room: Room) {
    if (!room.seats.get(room.hostId)?.socket)
      room.hostId =
        [...room.seats.values()].find((seat) => seat.socket)?.id ??
        [...room.seats.keys()][0] ??
        "";
  }
  function broadcast(room: Room) {
    host(room);
    for (const seat of room.seats.values())
      if (seat.socket)
        send(seat.socket, { type: "room", room: snapshot(room, seat) });
  }
  function resetPosition(seat: Seat, place: 'street' | 'prep') {
    seat.place = place; seat.x = (seat.skin - 2.5) * (place === 'prep' ? 1.2 : 1.6); seat.z = place === 'prep' ? 0 : 2;
    seat.facing = Math.PI; seat.moveAt = Date.now(); seat.distanceCredit = .25; seat.search = undefined;
  }
  function addMark(room: Room, spotId: string) {
    const traces = room.trails, spot = HIDING_SPOTS.find(item => item.id === spotId);
    if (!traces || !spot || traces.disturbed.has(spotId) || traces.marks.length >= 4) return;
    traces.disturbed.add(spotId); traces.marks.push({ id: randomUUID(), x: spot.x, z: spot.z, createdAt: room.startedAt ?? Date.now() });
    // Public projection independently shuffles every list, including after late decoys.
  }
  function leaveSteps(room: Room, path: { x: number; z: number }[], now: number) {
    const traces = room.trails;
    if (!traces) return;
    for (const point of path) {
      const previous = traces.lastStep;
      if (!previous) { traces.lastStep = { ...point }; continue; }
      const distance = Math.hypot(point.x - previous.x, point.z - previous.z);
      if (distance < FOOTPRINT_SPACING) continue;
      const facing = Math.atan2(point.x - previous.x, point.z - previous.z);
      const count = Math.floor(distance / FOOTPRINT_SPACING);
      for (let i = 1; i <= count; i++) {
        const t = i * FOOTPRINT_SPACING / distance, fadeAt = room.round?.phase === 'seeking' ? now : 0;
        traces.footprints.push({ id: randomUUID(), x: previous.x + (point.x - previous.x) * t, z: previous.z + (point.z - previous.z) * t, facing, fadeAt, expiresAt: fadeAt ? fadeAt + FOOTPRINT_LIFE_MS : 0 });
        if (traces.footprints.length > MAX_FOOTPRINTS) traces.footprints.shift();
      }
      traces.lastStep = { ...point };
    }
  }
  function buryAutomatically(room: Room) {
    if (room.round && !room.round.capsuleSpotId) {
      room.round.capsuleSpotId = HIDING_SPOTS.filter(spot => !room.trails?.disturbed.has(spot.id))[randomBytes(1)[0] % (HIDING_SPOTS.length - (room.trails?.disturbed.size ?? 0))].id;
      addMark(room, room.round.capsuleSpotId);
    }
  }
  function beginSeeking(room: Room) {
    if (!room.round || room.round.phase !== 'hiding') return;
    buryAutomatically(room); room.round.phase = 'seeking'; room.round.phaseEndsAt = Date.now() + durations.seekingMs;
    const traces = room.trails!; traces.seekingStartedAt = Date.now();
    for (const step of traces.footprints) if (!step.fadeAt) { step.fadeAt = traces.seekingStartedAt; step.expiresAt = step.fadeAt + FOOTPRINT_LIFE_MS; }
    room.blackoutAt = Math.min(room.blackoutAt ?? Date.now(), Date.now());
    for (const seat of room.seats.values()) if (seat.role !== 'waiting') { if (seat.place === 'prep') resetPosition(seat, 'street'); seat.flashlight = seat.role === 'seeker'; }
    broadcast(room);
  }
  function reveal(room: Room, foundBy: string | null) {
    if (!room.round || room.round.phase !== 'seeking') return;
    room.round.phase = 'reveal'; room.round.foundBy = foundBy; room.round.foundByName = foundBy ? room.seats.get(foundBy)?.name : undefined; room.round.phaseEndsAt = Date.now() + durations.revealMs; room.round.revealReadyAt = room.round.phaseEndsAt;
    for (const seat of room.seats.values()) seat.search = undefined;
    if (room.trails) room.trails.offer = undefined;
    const match = room.match!;
    const fullSeconds = Math.ceil(durations.seekingMs / 1000);
    // Seeking start remains authoritative, independent of client clocks.
    const elapsed = Math.max(0, Math.min(fullSeconds, Math.floor((Date.now() - (room.trails?.seekingStartedAt ?? Date.now())) / 1000)));
    for (const entry of match.scores) {
      entry.roundPoints = entry.playerId === room.round.hiderId ? (foundBy ? elapsed : fullSeconds) : room.seats.get(entry.playerId)?.role === 'seeker' && foundBy ? fullSeconds - elapsed : 0;
      entry.score += entry.roundPoints;
    }
    if (match.roundNumber >= match.totalRounds && !rosterChanged(room)) {
      match.phase = 'finished'; match.nextRoundAt = undefined;
      const maximum = Math.max(...match.scores.map(entry => entry.score));
      match.winnerIds = match.scores.filter(entry => entry.score === maximum).map(entry => entry.playerId);
    } else match.nextRoundAt = Date.now() + durations.nextRoundMs;
    broadcast(room);
  }
  function rosterChanged(room: Room) {
    const ids = room.match?.rosterIds;
    return !!ids && (ids.length !== room.seats.size || ids.some(id => !room.seats.has(id)));
  }
  function newMatch(room: Room, changed = false) {
    const seats = [...room.seats.values()];
    room.radio = [];
    room.match = { id: randomUUID(), phase: 'playing', roundNumber: 0, totalRounds: seats.length === 1 ? 3 : seats.length === 2 ? 4 : seats.length, solo: seats.length === 1,
      scores: seats.map(seat => ({ playerId: seat.id, name: seat.name, score: 0, roundPoints: 0 })), rosterIds: seats.map(seat => seat.id),
      announcement: changed ? 'The group changed. A fresh match starts now.' : '', winnerIds: [] };
  }
  function startRound(room: Room) {
    if (![...room.seats.values()].some(seat => seat.socket)) return;
    if (!room.match || rosterChanged(room)) newMatch(room, !!room.match);
    if (room.match!.phase === 'finished') return;
    room.match!.roundNumber++; room.match!.nextRoundAt = undefined;

    const participants = [...room.seats.values()].filter(seat => seat.socket);
    const hider = participants.length > 1 ? participants.find(seat => seat.joinOrder > (room.previousHiderOrder ?? -1)) ?? participants[0] : undefined;
    if (hider) room.previousHiderOrder = hider.joinOrder;
    room.phase = 'started'; room.startedAt ??= Date.now(); room.blackoutAt = room.round ? Date.now() : Date.now() + durations.blackoutMs;
    room.round = { number: (room.round?.number ?? 0) + 1, phase: 'hiding', hiderId: hider?.id ?? null, phaseEndsAt: (room.blackoutAt ?? Date.now()) + durations.hidingMs };
    room.trails = { footprints: [], marks: [], disturbed: new Set(), decoys: 0, clues: [], clueCount: 0 };
    for (const seat of room.seats.values()) {
      seat.role = !seat.socket ? 'waiting' : seat.id === hider?.id ? 'hider' : 'seeker'; seat.flashlight = seat.role === 'hider'; seat.cooldownUntil = 0; seat.frozenUntil = 0; seat.immunityUntil = 0;
      resetPosition(seat, seat.role === 'hider' ? 'street' : 'prep');
    }
    if (hider) room.trails.lastStep = { x: hider.x, z: hider.z };
    if (!hider) {
      buryAutomatically(room);
      const capsule = HIDING_SPOTS.find(spot => spot.id === room.round!.capsuleSpotId)!;
      const alternatives = shuffled(HIDING_SPOTS.filter(spot => spot.id !== capsule.id)).slice(0,3);
      for (const spot of alternatives) addMark(room, spot.id);
      room.trails.decoys = 3;
      for (const spot of shuffled([capsule, alternatives[0]])) { const route = streetRoute({x:-4,z:2},spot); room.trails.lastStep = undefined; leaveSteps(room, route, Date.now()); }
    }
  }
  function publishRadio(room: Room, message: RadioMessage) {
    room.radio = [...(room.radio ?? []), message].slice(-RADIO_HISTORY_LIMIT);
    for (const seat of room.seats.values()) if (seat.socket) send(seat.socket, { type: 'radio', message });
  }
  function sendClue(room: Room, clue: TrueClue) {
    if (!room.trails || room.round?.phase !== 'seeking') return;
    const id = randomUUID(), sentAt = Date.now();
    room.trails.clues.push({ id, text: clue.text, sentAt });
    const hiderId = room.round.hiderId, hiderName = hiderId ? room.seats.get(hiderId)?.name ?? room.match?.scores.find(entry => entry.playerId === hiderId)?.name : undefined;
    publishRadio(room, { id, senderId: hiderId, senderName: hiderName ?? 'The street', text: clue.text, kind: 'clue', sentAt });
    room.trails.clues = room.trails.clues.slice(-3); room.trails.offer = undefined;
    room.movementDirty = true;
  }
  function updateTrails(room: Room, now: number) {
    const traces = room.trails, round = room.round;
    if (!traces || !round || round.phase !== 'seeking') return;
    const alive = traces.footprints.filter(step => step.expiresAt > now);
    if (alive.length !== traces.footprints.length) { traces.footprints = alive; room.movementDirty = true; }
    const hider = round.hiderId ? room.seats.get(round.hiderId) : undefined;
    if (hider && (hider.immunityUntil ?? 0) <= now && [...room.seats.values()].some(seat => seat.socket && seat.role === 'seeker' && seat.place === 'street' && seat.flashlight && groundBeamStrength(hider, seat, groundHeight(hider.x,hider.z)) > .05)) {
      hider.frozenUntil = now + FREEZE_MS; hider.immunityUntil = now + FREEZE_MS + FREEZE_IMMUNITY_MS; room.movementDirty = true;
    }
    const interval = options.clueIntervalMs ?? CLUE_INTERVAL_MS;
    if (!traces.offer && traces.clueCount < 3 && now >= (traces.seekingStartedAt ?? now) + interval * (traces.clueCount + 1)) {
      const spot = HIDING_SPOTS.find(item => item.id === round.capsuleSpotId)!;
      const pool = trueCluePool(spot), offset = traces.clueCount % pool.length;
      traces.clueCount++;
      const offered = Array.from({length:3},(_,i)=>pool[(offset+i)%pool.length]);
      if (!hider?.socket) sendClue(room, offered[0]);
      else { traces.offer = { id: randomUUID(), options: offered, deadlineAt: now + (options.clueChoiceMs ?? CLUE_CHOICE_MS) }; room.movementDirty = true; }
    }
    if (traces.offer && now >= traces.offer.deadlineAt) sendClue(room, traces.offer.options[0]);
  }
  function disconnect(socket: WebSocket, remove = false) {
    const session = sessions.get(socket);
    if (!session?.seat || !session.room) return;
    const { seat, room } = session;
    if (seat.socket !== socket) return;
    seat.socket = undefined;
    seat.search = undefined;
    seat.disconnectedAt = Date.now();
    if (remove) room.seats.delete(seat.id);
    session.seat = undefined;
    session.room = undefined;
    room.touchedAt = Date.now();
    broadcast(room);
    if (room.seats.size === 0) rooms.delete(room.code);
  }
  function tokenMatches(actual: string, supplied: unknown) {
    if (typeof supplied !== "string" || supplied.length !== actual.length)
      return false;
    return timingSafeEqual(Buffer.from(actual), Buffer.from(supplied));
  }
  function name(input: unknown) {
    return typeof input === "string"
      ? input
          .trim()
          .replace(/[\u0000-\u001f\u007f]/g, "")
          .slice(0, 24)
      : "";
  }
  function code(input: unknown) {
    return typeof input === "string" ? input.trim().toUpperCase() : "";
  }
  function credential(room: Room, seat: Seat) {
    return { room: room.code, playerId: seat.id, token: seat.token, bootId };
  }
  function fail(
    socket: WebSocket,
    id: string,
    errorCode: string,
    message: string,
  ) {
    send(socket, {
      type: "result",
      id,
      ok: false,
      error: { code: errorCode, message },
    });
  }
  function attach(
    socket: WebSocket,
    session: Session,
    room: Room,
    seat: Seat,
    id: string,
  ) {
    seat.socket = socket;
    seat.disconnectedAt = undefined;
    seat.moveAt = Date.now();
    seat.distanceCredit = 0.25;
    seat.search = undefined;
    session.room = room;
    session.seat = seat;
    room.touchedAt = Date.now();
    host(room);
    send(socket, {
      type: "result",
      id,
      ok: true,
      seat: credential(room, seat),
      room: snapshot(room, seat),
    });
    broadcast(room);
  }
  function receive(socket: WebSocket, request: ClientRequest) {
    const session = sessions.get(socket)!;
    if (session.revoked) return;
    // Radio has a separate allowance and never invokes expensive trace/phase
    // updates. A rejected flood gets at most ten small replies per second.
    if (request.type === 'radio' || request.type === 'radio_quick') {
      const { room, seat } = session, now = Date.now();
      const rejectRadio = (error: string, message: string) => {
        session.radioFailureTokens = Math.min(10, (session.radioFailureTokens ?? 10) + (now - (session.radioFailureAt ?? now)) * .01);
        session.radioFailureAt = now;
        if (session.radioFailureTokens >= 1) { session.radioFailureTokens--; fail(socket, request.id, error, message); }
      };
      if (!room?.match || !seat) return rejectRadio('no_radio', 'Join a night and start playing first.');
      const recent = (seat.radioSentAt ?? []).filter(time => now - time < RADIO_WINDOW_MS);
      seat.radioSentAt = recent;
      if (recent.length >= RADIO_MESSAGES_PER_WINDOW) return rejectRadio('radio_rate_limited', 'Let the radio settle for a few seconds.');
      let text: string;
      if (request.type === 'radio_quick') {
        // Construct only the public context needed by the shared phrase helper;
        // do not create a full secret-filtered trace snapshot for each send.
        const context = { round: room.round, match: room.match, players: [{ id: seat.id, role: seat.role }] } as unknown as RoomSnapshot;
        const phrase = getRadioPhrases(context, seat.id).find(item => item.id === request.phraseId);
        if (!phrase) return rejectRadio('invalid_phrase', 'That phrase is not available now.');
        text = phrase.text;
      } else {
        if (typeof request.text !== 'string' || request.text.length > RADIO_TEXT_LIMIT * 2 || [...request.text].length > RADIO_TEXT_LIMIT || /[\u0000-\u001f\u007f]/.test(request.text) || !request.text.trim()) return rejectRadio('invalid_radio_text', 'Send a short message of 1 to 80 characters.');
        text = request.text.trim();
      }
      seat.radioSentAt.push(now);
      const message: RadioMessage = { id: randomUUID(), senderId: seat.id, senderName: seat.name, text, kind: 'message', sentAt: now };
      publishRadio(room, message); room.touchedAt = now;
      send(socket, { type: 'result', id: request.id, ok: true, radio: message });
      return;
    }
    if (session.room?.round?.phase === 'hiding' && Date.now() >= session.room.round.phaseEndsAt) beginSeeking(session.room);
    if (session.room?.round?.phase === 'seeking' && Date.now() >= session.room.round.phaseEndsAt) reveal(session.room, null);
    if (session.room) updateTrails(session.room, Date.now());
    const id = request.id;
    if (request.type === "move") {
      const now = Date.now();
      session.movementTokens = Math.min(10, session.movementTokens + (now - session.movementAt) * 0.03);
      session.movementAt = now;
      if (session.movementTokens < 1) return;
      session.movementTokens--;
      const { seat, room } = session;
      if (!seat || !room || room.phase !== "started") return;
      const { x, z, facing, seq } = request;
      const credit = Math.min(1, seat.distanceCredit + Math.max(0, now - seat.moveAt) * MOVE_SPEED / 1000);
      seat.moveAt = now;
      seat.distanceCredit = credit;
      const distance = typeof x === "number" && typeof z === "number" ? legalReportedPath(seat, { x, z }, request.path, seat.place === 'prep') : undefined;
      if (typeof x !== "number" || typeof z !== "number" || typeof facing !== "number" ||
          !Number.isFinite(facing) || typeof seq !== "number" || !Number.isSafeInteger(seq) ||
          seq <= seat.seq || distance === undefined || distance > credit + 0.001 || ((seat.frozenUntil ?? 0) > now && distance > .00001)) {
        send(socket, { type: "pose_rejected", playerId: seat.id, x: seat.x, z: seat.z, facing: seat.facing, seq: seat.seq });
        return;
      }
      seat.distanceCredit -= distance;
      if (seat.role === 'hider' && seat.place === 'street' && room.round?.phase !== 'reveal') leaveSteps(room, request.path ?? [{x,z}], now);
      seat.x = x;
      seat.z = z;
      seat.facing = Math.atan2(Math.sin(facing), Math.cos(facing));
      seat.seq = seq;
      if (seat.search) { const spot = HIDING_SPOTS.find(s => s.id === seat.search!.spotId); if (!spot || !nearSpot(seat, spot)) seat.search = undefined; }
      room.movementDirty = true;
      room.touchedAt = now;
      return;
    }
    if (Date.now() - session.windowAt > 10_000) {
      session.windowAt = Date.now();
      session.requests = 0;
    }
    if (++session.requests > 50)
      return fail(
        socket,
        id,
        "rate_limited",
        "Slow down for a moment, then try again.",
      );
    if (request.type === "leave") {
      disconnect(socket, true);
      send(socket, { type: "result", id, ok: true });
      return;
    }
    if (request.type === "play_again") {
      const { room, seat } = session;
      if (!room || !seat || room.match?.phase !== 'finished') return fail(socket, id, 'not_finished', 'Finish this match before playing again.');
      if (request.roundNumber !== room.round?.number) return fail(socket, id, 'stale_round', 'That replay belonged to an earlier match.');
      newMatch(room); room.previousHiderOrder = undefined; startRound(room);
      send(socket, { type: 'result', id, ok: true, room: snapshot(room, seat) }); broadcast(room); return;
    }
    if (request.type === "start") {
      if (!session.room || !session.seat)
        return fail(socket, id, "no_seat", "Join a night first.");
      host(session.room);
      if (session.room.hostId !== session.seat.id)
        return fail(socket, id, "not_host", "The host starts the night.");
      if (!session.room.round || (session.room.round.phase === 'reveal' && Date.now() >= (session.room.round.revealReadyAt ?? Infinity))) startRound(session.room);
      session.room.touchedAt = Date.now();
      send(socket, {
        type: "result",
        id,
        ok: true,
        room: snapshot(session.room, session.seat),
      });
      broadcast(session.room);
      return;
    }
    if (['pickup', 'bury', 'disturb', 'choose_clue', 'search_begin', 'search_cancel', 'search_complete'].includes(request.type)) {
      const { room, seat } = session; const round = room?.round; const now = Date.now();
      if (!room || !seat || !round) return fail(socket, id, 'no_round', 'Start a round first.');
      if (request.roundNumber !== round.number) return fail(socket, id, 'stale_round', 'That action belonged to an earlier round.');
      const success = () => { send(socket, { type: 'result', id, ok: true, room: snapshot(room, seat) }); broadcast(room); };
      if (request.type === 'pickup') {
        if (seat.place !== 'prep' || !nearSpot(seat, FLASHLIGHT_PICKUP)) return fail(socket, id, 'out_of_range', 'Move closer to the flashlights.');
        seat.flashlight = true;
        if (seat.role === 'seeker' && round.phase === 'hiding' && round.hiderId === null) beginSeeking(room);
        success(); return;
      }
      const spot = HIDING_SPOTS.find(item => item.id === request.spotId);
      if (request.type === 'choose_clue') {
        const offer = room.trails?.offer, clue = offer?.options.find(item => item.id === request.clueId);
        if (seat.role !== 'hider' || round.phase !== 'seeking' || !offer || !clue || now >= offer.deadlineAt) return fail(socket, id, 'no_clue_offer', 'That radio choice has already passed.');
        sendClue(room, clue); success(); return;
      }
      if (request.type === 'disturb') {
        if (seat.role !== 'hider' || seat.place !== 'street' || round.phase === 'reveal' || now < (room.blackoutAt ?? 0) || (seat.frozenUntil ?? 0) > now) return fail(socket, id, 'wrong_phase', 'You cannot disturb a spot now.');
        if (!spot || !nearSpot(seat, spot)) return fail(socket, id, 'out_of_range', 'Move closer to a hiding spot.');
        if (room.trails!.decoys >= 3) return fail(socket, id, 'decoy_limit', 'All three decoys are already laid.');
        if (room.trails!.disturbed.has(spot.id)) return fail(socket, id, 'already_disturbed', 'That ground is already disturbed.');
        addMark(room, spot.id); room.trails!.decoys++; success(); return;
      }
      if (request.type === 'bury') {
        if (seat.role !== 'hider' || round.phase !== 'hiding' || now < (room.blackoutAt ?? 0)) return fail(socket, id, 'wrong_phase', 'You cannot bury the capsule now.');
        if (!spot || seat.place !== 'street' || !nearSpot(seat, spot)) return fail(socket, id, 'out_of_range', 'Move closer to a hiding spot.');
        if (round.capsuleSpotId) return fail(socket, id, 'already_buried', 'The capsule is already buried.');
        if (room.trails!.disturbed.has(spot.id)) return fail(socket, id, 'already_disturbed', 'Bury the capsule at a fresh spot.');
        round.capsuleSpotId = spot.id; addMark(room, spot.id); success(); return;
      }
      if (request.type === 'search_cancel') { seat.search = undefined; success(); return; }
      if (seat.role !== 'seeker' || seat.place !== 'street' || round.phase !== 'seeking') return fail(socket, id, 'wrong_phase', 'You cannot search now.');
      if ((seat.cooldownUntil ?? 0) > now) return fail(socket, id, 'cooldown', 'Wait a few seconds before searching again.');
      if (!spot || !nearSpot(seat, spot)) { seat.search = undefined; return fail(socket, id, 'out_of_range', 'Move closer to that hiding spot.'); }
      if (request.type === 'search_begin') {
        if (!seat.search || seat.search.spotId !== spot.id) seat.search = { spotId: spot.id, startedAt: now, endsAt: now + durations.searchMs };
        success(); return;
      }
      if (!seat.search || seat.search.spotId !== spot.id || now < seat.search.endsAt) return fail(socket, id, 'hold_required', 'Hold Search until it finishes.');
      seat.search = undefined;
      if (round.capsuleSpotId === spot.id) reveal(room, seat.id);
      else { seat.cooldownUntil = now + durations.cooldownMs; const eventId = randomUUID(); for (const player of room.seats.values()) if (player.socket) send(player.socket, { type: 'search_noise', eventId, playerId: seat.id }); }
      success(); return;
    }
    if (session.seat)
      return fail(
        socket,
        id,
        "already_seated",
        "Leave this night before joining another.",
      );
    if (request.type === "create") {
      if (!name(request.name))
        return fail(socket, id, "invalid_name", "Enter your name first.");
      if (rooms.size >= maxRooms)
        return fail(
          socket,
          id,
          "rooms_full",
          "Maple Street is busy. Try again in a few minutes.",
        );
      let roomCode: string;
      do {
        roomCode = [...randomBytes(5)]
          .map((byte) => alphabet[byte % alphabet.length])
          .join("");
      } while (rooms.has(roomCode));
      const seat: Seat = {
        id: randomUUID(),
        joinOrder: 0,
        name: name(request.name),
        token: randomBytes(32).toString("hex"),
        ...initialPose(0),
      };
      const room: Room = {
        code: roomCode,
        phase: "lobby",
        hostId: seat.id,
        seats: new Map([[seat.id, seat]]),
        touchedAt: Date.now(),
        nextJoinOrder: 1,
      };
      rooms.set(roomCode, room);
      attach(socket, session, room, seat, id);
      return;
    }
    const room = rooms.get(code(request.code));
    if (request.bootId && request.bootId !== bootId)
      return fail(
        socket,
        id,
        "server_restarted",
        "The street has gone quiet after a restart. Create a new night to play again.",
      );
    if (!room)
      return fail(
        socket,
        id,
        "room_missing",
        "That night has ended. Create a new night or check the code.",
      );
    if (request.type === "recover") {
      const tokens = Array.isArray(request.tokens)
        ? request.tokens
            .filter((value) => typeof value === "string")
            .slice(0, 6)
        : [];
      const offers = [...room.seats.values()]
        .filter(
          (seat) =>
            !seat.socket &&
            tokens.some((token) => tokenMatches(seat.token, token)),
        )
        .map((seat) => ({
          playerId: seat.id,
          name: seat.name,
          token: seat.token,
        }));
      send(socket, { type: "result", id, ok: true, offers });
      return;
    }
    if (request.type === "resume") {
      const seat = [...room.seats.values()].find((item) =>
        tokenMatches(item.token, request.token),
      );
      if (!seat)
        return fail(
          socket,
          id,
          "invalid_token",
          "Your place in that night has expired. Join again with the room code.",
        );
      if (seat.socket) {
        const previous = seat.socket;
        const previousSession = sessions.get(previous);
        // Detach first so late messages/close events cannot mutate the new seat.
        if (previousSession) {
          previousSession.revoked = true;
          previousSession.seat = undefined;
          previousSession.room = undefined;
        }
        send(previous, {
          type: "seat_replaced",
          message: "Your seat continued in another tab.",
        });
        previous.close(4001, "Your seat continued in another tab.");
        const timeout = setTimeout(() => previous.terminate(), 1000);
        timeout.unref();
        previous.once("close", () => clearTimeout(timeout));
      }
      attach(socket, session, room, seat, id);
      return;
    }
    if (request.type === "join") {
      if (!name(request.name))
        return fail(socket, id, "invalid_name", "Enter your name first.");
      if (room.seats.size >= maxPlayers)
        return fail(
          socket,
          id,
          "room_full",
          "This night is full. Try another room.",
        );
      const seat: Seat = {
        id: randomUUID(),
        joinOrder: room.nextJoinOrder++,
        name: name(request.name),
        token: randomBytes(32).toString("hex"),
        ...initialPose(Array.from({ length: 6 }, (_, index) => index).find((skin) => ![...room.seats.values()].some((seat) => seat.skin === skin))!),
      };
      room.seats.set(seat.id, seat);
      if (room.round) { seat.role = 'waiting'; seat.flashlight = false; resetPosition(seat, 'prep'); }
      attach(socket, session, room, seat, id);
      return;
    }
    fail(
      socket,
      id,
      "invalid_request",
      "That request could not be understood.",
    );
  }
  const server = createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "same-origin");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405);
      response.end();
      return;
    }
    try {
      const pathname = decodeURIComponent(
        new URL(request.url ?? "/", "http://localhost").pathname,
      );
      if (
        pathname.startsWith("/api") ||
        pathname.startsWith("/debug") ||
        pathname.startsWith("/__") ||
        pathname === "/live" ||
        pathname.split("/").some((part) => part.startsWith("."))
      ) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      let target = resolve(clientDir, "." + pathname);
      if (target !== clientDir && !target.startsWith(clientDir + sep)) {
        response.writeHead(404);
        response.end();
        return;
      }
      let info = await stat(target).catch(() => undefined);
      if (info?.isDirectory()) {
        target = resolve(target, "index.html");
        info = await stat(target).catch(() => undefined);
      }
      if (!info?.isFile()) {
        if (extname(pathname)) {
          response.writeHead(404);
          response.end("Not found");
          return;
        }
        target = resolve(clientDir, "index.html");
      }
      const data = await readFile(target);
      response.setHeader(
        "Content-Type",
        mime[extname(target)] ?? "application/octet-stream",
      );
      response.setHeader(
        "Cache-Control",
        extname(target) === ".html" ? "no-cache" : "public, max-age=3600",
      );
      response.writeHead(200);
      response.end(request.method === "HEAD" ? undefined : data);
    } catch {
      missing(response);
    }
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 4096,
    perMessageDeflate: false,
  });
  server.on("upgrade", (request, socket, head) => {
    const origin = request.headers.origin;
    let allowed = !origin;
    try {
      if (origin) allowed = new URL(origin).host === request.headers.host;
    } catch {
      allowed = false;
    }
    if (
      request.url !== "/live" ||
      !allowed ||
      sessions.size >= maxRooms * 6 + 30
    ) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) =>
      wss.emit("connection", ws, request),
    );
  });
  wss.on("connection", (socket) => {
    sessions.set(socket, { alive: true, windowAt: Date.now(), requests: 0, movementTokens: 10, movementAt: Date.now() });
    send(socket, { type: "hello", bootId });
    socket.on("pong", () => {
      const session = sessions.get(socket);
      if (session) session.alive = true;
    });
    socket.on("message", (data, binary) => {
      if (binary) {
        socket.close(1003, "Text messages only");
        return;
      }
      try {
        const request: ClientRequest = JSON.parse(data.toString());
        if (
          !request ||
          typeof request.id !== "string" ||
          request.id.length > 64 ||
          typeof request.type !== "string"
        )
          throw new Error("Invalid request");
        receive(socket, request);
      } catch {
        socket.close(1007, "Invalid message");
      }
    });
    socket.on("close", () => {
      disconnect(socket);
      sessions.delete(socket);
    });
    socket.on("error", () => socket.terminate());
  });
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [socket, session] of sessions) {
      if (!session.alive) {
        socket.terminate();
        continue;
      }
      session.alive = false;
      socket.ping();
    }
    for (const room of rooms.values()) {
      for (const seat of room.seats.values())
        if (!seat.socket && now - (seat.disconnectedAt ?? now) >= seatGraceMs)
          room.seats.delete(seat.id);
      if (
        !room.seats.size ||
        (![...room.seats.values()].some((seat) => seat.socket) &&
          now - room.touchedAt >= abandonedMs)
      )
        rooms.delete(room.code);
      else broadcast(room);
    }
  }, options.heartbeatMs ?? 10_000);
  cleanup.unref();
  const movementBroadcast = setInterval(() => {
    for (const room of rooms.values()) {
      if (room.round?.phase === 'hiding' && Date.now() >= room.round.phaseEndsAt) beginSeeking(room);
      if (room.round?.phase === 'seeking' && Date.now() >= room.round.phaseEndsAt) reveal(room, null);
      if (room.round?.phase === 'reveal' && room.match?.phase === 'playing' && Date.now() >= (room.match.nextRoundAt ?? Infinity)) { startRound(room); broadcast(room); }
      updateTrails(room, Date.now());
      if (room.phase === "started" && room.movementDirty) {
        room.movementDirty = false;
        broadcast(room);
      }
    }
  }, 100);
  movementBroadcast.unref();
  return {
    server,
    bootId,
    async close() {
      clearInterval(cleanup);
      clearInterval(movementBroadcast);
      for (const socket of sessions.keys()) socket.terminate();
      await new Promise<void>((resolveClose) =>
        wss.close(() => resolveClose()),
      );
      await new Promise<void>((resolveClose, reject) =>
        server.close((error) => (error ? reject(error) : resolveClose())),
      );
    },
  };
}
function initialPose(skin: number) {
  return { skin, x: (skin - 2.5) * 1.6, z: 2, facing: Math.PI, seq: 0, moveAt: Date.now(), distanceCredit: 0.25 };
}
function shuffled<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) { const j = randomInt(i + 1); [items[i],items[j]] = [items[j],items[i]]; }
  return items;
}
/** Bounded client traces preserve legitimate sliding around a corner. */
function legalReportedPath(from: { x: number; z: number }, to: { x: number; z: number }, supplied: unknown, prep = false): number | undefined {
  const path = supplied === undefined ? [to] : supplied;
  if (!Array.isArray(path) || path.length < 1 || path.length > 32) return;
  let previous = from, distance = 0;
  for (const point of path) {
    if (!point || typeof point !== "object" || typeof point.x !== "number" || typeof point.z !== "number" ||
        !(prep ? insidePrep(previous.x, previous.z) && insidePrep(point.x, point.z) : legalStreetMove(previous, point))) return;
    distance += Math.hypot(point.x - previous.x, point.z - previous.z);
    previous = point;
  }
  if (Math.hypot(previous.x - to.x, previous.z - to.z) > 0.00001) return;
  return distance;
}
function missing(response: ServerResponse) {
  response.writeHead(404);
  response.end("Not found");
}
function environmentInteger(
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (process.env[key] === undefined) return fallback;
  const value = Number(process.env[key]);
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    throw new Error(`${key} must be an integer from ${minimum} to ${maximum}`);
  return value;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const game = createGameServer();
  const port = Number(process.env.PORT ?? 5173);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be a valid TCP port");
  game.server.listen(port, "0.0.0.0", () =>
    console.log(`Maple Street listening on ${port}`),
  );
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      void game.close().then(() => process.exit(0));
    });
}
