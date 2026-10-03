import { createServer, type IncomingMessage } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomInt } from "node:crypto";
import { Server } from "socket.io";
import { GameRoom, type Player } from "./game.js";
import type { Action, Beam, Reply } from "../shared/protocol.js";

export function createGameServer() {
  const rooms = new Map<string, GameRoom>();
  const clients = new Map<string, { room: GameRoom; player: Player }>();
  const root = resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
  const development = process.env.NODE_ENV !== "production";
  const http = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const json = (status: number, data: unknown) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
    };
    if (url.pathname === "/api/health") {
      json(200, { ok: true, rooms: rooms.size });
      return;
    }
    if (development && url.pathname.startsWith("/api/dev/rooms/")) {
      const code = url.pathname.split("/")[4]?.toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        json(404, { error: "Room not found" });
        return;
      }
      if (req.method === "POST") {
        try {
          const body = await readJson(req);
          room.reset(false);
          if (Number.isInteger(body.seed)) {
            room.seed = body.seed;
            room.variant = Math.abs(body.seed) % 2;
          }
          broadcast(room);
          json(200, { ok: true });
        } catch {
          json(400, { error: "Invalid reset body" });
        }
        return;
      }
      json(200, {
        code: room.code,
        phase: room.phase,
        variant: room.variant,
        revision: room.revision,
        paused: room.paused,
        players: room.players.map(
          ({ id, name, role, connected, visible, ready }) => ({
            id,
            name,
            role,
            connected,
            visible,
            ready,
          }),
        ),
        inventory: room.inventory,
      });
      return;
    }
    if (req.method !== "GET") {
      json(405, { error: "Method not allowed" });
      return;
    }
    try {
      const pathname = decodeURIComponent(url.pathname);
      const file = resolve(
        root,
        `.${pathname === "/" ? "/index.html" : pathname}`,
      );
      if (file !== root && !file.startsWith(root + sep)) {
        json(403, { error: "Invalid path" });
        return;
      }
      const data = await readFile(file);
      const types: Record<string, string> = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".json": "application/json",
        ".woff2": "font/woff2",
      };
      res.writeHead(200, {
        "Content-Type": types[extname(file)] ?? "application/octet-stream",
      });
      res.end(data);
    } catch {
      json(404, {
        error: "Run npm run dev, or npm run build before npm start.",
      });
    }
  });
  const io = new Server(http, {
    cors: { origin: true },
    maxHttpBufferSize: 8192,
    pingTimeout: 10000,
    pingInterval: 5000,
  });
  function broadcast(room: GameRoom) {
    for (const p of room.players)
      if (p.socketId) io.to(p.socketId).emit("snapshot", room.snapshot(p));
  }
  function cleanCode(code: unknown) {
    return typeof code === "string" ? code.trim().toUpperCase() : "";
  }
  function uniqueCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    do {
      code = Array.from(
        { length: 5 },
        () => alphabet[randomInt(alphabet.length)],
      ).join("");
    } while (rooms.has(code));
    return code;
  }
  io.on("connection", (socket) => {
    let arrivals: number[] = [];
    let beamAt = 0;
    const execute = (ack: unknown, fn: () => Reply | void) => {
      try {
        const now = Date.now();
        arrivals = arrivals.filter((n) => now - n < 1000);
        if (arrivals.length >= 35)
          throw Error("Please slow down for a moment.");
        arrivals.push(now);
        const result = fn();
        if (typeof ack === "function") ack(result ?? { ok: true });
      } catch (error) {
        if (typeof ack === "function")
          ack({
            ok: false,
            error: error instanceof Error ? error.message : "Invalid request.",
          });
      }
    };
    const member = () => {
      const c = clients.get(socket.id);
      if (!c) throw Error("Join a night first.");
      return c;
    };
    socket.on("leave", (_data: unknown, ack: unknown) =>
      execute(ack, () => {
        const c = clients.get(socket.id);
        if (!c) return;
        if (c.room.phase !== "lobby")
          throw Error(
            "The night has begun. Rejoin this seat to continue your story.",
          );
        clients.delete(socket.id);
        void socket.leave(c.room.code);
        c.room.players = c.room.players.filter((p) => p !== c.player);
        c.room.players.forEach((p) => {
          p.ready = false;
        });
        c.room.clearSignals();
        c.room.changed();
        if (c.room.players.length === 0) rooms.delete(c.room.code);
        else broadcast(c.room);
      }),
    );
    socket.on("create", (data: unknown, ack: unknown) =>
      execute(ack, () => {
        if (clients.has(socket.id)) throw Error("You are already in a room.");
        if (rooms.size >= 300)
          throw Error("The street is full. Try again later.");
        const room = new GameRoom(uniqueCode());
        const p = room.addPlayer(
          (data as { name?: string })?.name ?? "Friend",
          socket.id,
        );
        rooms.set(room.code, room);
        clients.set(socket.id, { room, player: p });
        socket.join(room.code);
        broadcast(room);
        return { ok: true, code: room.code, token: p.token, playerId: p.id };
      }),
    );
    socket.on(
      "join",
      (
        data: { code?: unknown; name?: string; token?: unknown },
        ack: unknown,
      ) =>
        execute(ack, () => {
          if (clients.has(socket.id)) throw Error("You are already in a room.");
          const room = rooms.get(cleanCode(data?.code));
          if (!room)
            throw Error(
              "No night with that code. Check the code or start a new night.",
            );
          const previousSocketId =
            typeof data?.token === "string"
              ? room.players.find((p) => p.token === data.token)?.socketId
              : null;
          const p =
            typeof data?.token === "string"
              ? room.reconnect(data.token, socket.id)
              : room.addPlayer(data?.name ?? "Friend", socket.id);
          clients.set(socket.id, { room, player: p });
          // Remove the old membership before closing it: its disconnect handler
          // must never mark the authenticated replacement offline.
          if (previousSocketId && previousSocketId !== socket.id) {
            clients.delete(previousSocketId);
            const previous = io.sockets.sockets.get(previousSocketId);
            previous?.emit("seat-replaced", {
              error:
                "Your night was resumed in another tab. Continue there, or resume here from the menu.",
            });
            previous?.disconnect(true);
          }
          socket.join(room.code);
          broadcast(room);
          return { ok: true, code: room.code, token: p.token, playerId: p.id };
        }),
    );
    socket.on("action", (action: Action, ack: unknown) =>
      execute(ack, () => {
        const { room, player } = member();
        room.action(player, action);
        broadcast(room);
      }),
    );
    socket.on("beam", (b: Beam) => {
      try {
        const now = Date.now();
        if (now - beamAt < 25) return;
        beamAt = now;
        if (
          !b ||
          typeof b.x !== "number" ||
          typeof b.y !== "number" ||
          !Number.isFinite(b.x) ||
          !Number.isFinite(b.y) ||
          typeof b.on !== "boolean"
        )
          return;
        const { room, player } = member();
        room.setBeam(player, b);
        if (player.role)
          io.to(room.code).emit("beam", {
            role: player.role,
            beam: room.beams[player.role],
            serverTime: now,
          });
      } catch {
        /* Ephemeral invalid input has no state effect. */
      }
    });
    socket.on("visibility", (data: { visible?: unknown }) =>
      execute(undefined, () => {
        if (typeof data?.visible !== "boolean") return;
        const { room, player } = member();
        room.visibility(player, data.visible);
        broadcast(room);
      }),
    );
    socket.on("radio", (data: { text?: unknown }, ack: unknown) =>
      execute(ack, () => {
        const { room, player } = member();
        if (typeof data?.text !== "string" || !data.text.trim())
          throw Error("Write a radio message first.");
        if (data.text.length > 180)
          throw Error("Keep radio messages under 180 characters.");
        const now = Date.now();
        player.rate = player.rate.filter((t) => now - t < 10000);
        if (player.rate.length >= 8)
          throw Error("Radio is busy. Wait a few seconds.");
        player.rate.push(now);
        room.message(data.text.trim(), "player", player.name);
        broadcast(room);
      }),
    );
    socket.on("hint", (_data: unknown, ack: unknown) =>
      execute(ack, () => {
        const { room, player } = member();
        player.hintLevel = Math.min(2, player.hintLevel + 1);
        room.changed();
        broadcast(room);
      }),
    );
    socket.on("disconnect", () => {
      const c = clients.get(socket.id);
      if (c) {
        c.room.disconnect(c.player);
        clients.delete(socket.id);
        broadcast(c.room);
      }
    });
  });
  const tick = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (room.tick(now)) broadcast(room);
      if (
        room.players.every((p) => !p.connected) &&
        now - room.touchedAt > 30 * 60 * 1000
      ) {
        rooms.delete(code);
      } else if (now - room.createdAt > 12 * 60 * 60 * 1000) {
        for (const p of room.players)
          if (p.socketId) {
            io.to(p.socketId).emit("expired", {
              error: "This night expired. Start another night.",
            });
            io.sockets.sockets.get(p.socketId)?.disconnect(true);
          }
        rooms.delete(code);
      }
    }
  }, 100);
  tick.unref();
  return {
    http,
    io,
    rooms,
    broadcast,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(tick);
        io.close(() => resolve());
      }),
  };
}
async function readJson(req: IncomingMessage): Promise<Record<string, any>> {
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 2048) throw Error("Too large");
  }
  return JSON.parse(text || "{}");
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = createGameServer();
  const port = Number(process.env.PORT) || 3001;
  app.http.listen(port, "0.0.0.0", () =>
    console.log(
      `Maple Street multiplayer listening on http://localhost:${port}`,
    ),
  );
}
