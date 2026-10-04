import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import type {
  ClientRequest,
  RoomSnapshot,
  ServerMessage,
} from "../shared/protocol.js";

interface Seat {
  id: string;
  name: string;
  token: string;
  socket?: WebSocket;
  disconnectedAt?: number;
}
interface Room {
  code: string;
  phase: "lobby" | "started";
  hostId: string;
  seats: Map<string, Seat>;
  touchedAt: number;
}
interface Session {
  seat?: Seat;
  room?: Room;
  alive: boolean;
  windowAt: number;
  requests: number;
}
export interface ServerOptions {
  clientDir?: string;
  maxRooms?: number;
  maxPlayers?: number;
  seatGraceMs?: number;
  abandonedMs?: number;
  heartbeatMs?: number;
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
  function snapshot(room: Room): RoomSnapshot {
    return {
      code: room.code,
      phase: room.phase,
      hostId: room.hostId,
      players: [...room.seats.values()].map((seat) => ({
        id: seat.id,
        name: seat.name,
        connected: !!seat.socket,
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
        send(seat.socket, { type: "room", room: snapshot(room) });
  }
  function disconnect(socket: WebSocket, remove = false) {
    const session = sessions.get(socket);
    if (!session?.seat || !session.room) return;
    const { seat, room } = session;
    if (seat.socket !== socket) return;
    seat.socket = undefined;
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
    session.room = room;
    session.seat = seat;
    room.touchedAt = Date.now();
    host(room);
    send(socket, {
      type: "result",
      id,
      ok: true,
      seat: credential(room, seat),
      room: snapshot(room),
    });
    broadcast(room);
  }
  function receive(socket: WebSocket, request: ClientRequest) {
    const session = sessions.get(socket)!;
    const id = request.id;
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
    if (request.type === "start") {
      if (!session.room || !session.seat)
        return fail(socket, id, "no_seat", "Join a night first.");
      host(session.room);
      if (session.room.hostId !== session.seat.id)
        return fail(socket, id, "not_host", "The host starts the night.");
      session.room.phase = "started";
      session.room.touchedAt = Date.now();
      send(socket, {
        type: "result",
        id,
        ok: true,
        room: snapshot(session.room),
      });
      broadcast(session.room);
      return;
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
        name: name(request.name),
        token: randomBytes(32).toString("hex"),
      };
      const room: Room = {
        code: roomCode,
        phase: "lobby",
        hostId: seat.id,
        seats: new Map([[seat.id, seat]]),
        touchedAt: Date.now(),
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
      if (seat.socket)
        return fail(
          socket,
          id,
          "seat_connected",
          "That player is already connected in another tab.",
        );
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
        name: name(request.name),
        token: randomBytes(32).toString("hex"),
      };
      room.seats.set(seat.id, seat);
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
    sessions.set(socket, { alive: true, windowAt: Date.now(), requests: 0 });
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
  return {
    server,
    bootId,
    async close() {
      clearInterval(cleanup);
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
