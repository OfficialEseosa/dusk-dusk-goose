import assert from "node:assert/strict";
import { io, type Socket } from "socket.io-client";
import type { Action, Reply, Snapshot } from "../shared/protocol.js";

export class Player {
  socket: Socket;
  state?: Snapshot;
  snapshots: Snapshot[] = [];
  constructor(url: string) {
    this.socket = io(url, {
      transports: ["websocket"],
      autoConnect: false,
      reconnection: false,
    });
    this.socket.on("snapshot", (state: Snapshot) => {
      this.state = state;
      this.snapshots.push(state);
    });
  }
  async connect() {
    if (this.socket.connected) return;
    await new Promise<void>((resolve, reject) => {
      this.socket.once("connect", resolve);
      this.socket.once("connect_error", reject);
      this.socket.connect();
    });
  }
  async request(event: string, payload: unknown): Promise<Reply> {
    return new Promise((resolve, reject) => {
      this.socket
        .timeout(3000)
        .emit(event, payload, (error: Error | null, reply: Reply) => {
          if (error) reject(error);
          else resolve(reply);
        });
    });
  }
  async action(action: Action) {
    const reply = await this.request("action", action);
    assert.equal(reply.ok, true, reply.error);
    return reply;
  }
  async wait(
    predicate: (state: Snapshot) => boolean,
    timeout = 8000,
  ): Promise<Snapshot> {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      if (this.state && predicate(this.state)) return this.state;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(
      `Timed out waiting for state; last snapshot: ${JSON.stringify(this.state)}`,
    );
  }
  close() {
    this.socket.disconnect();
  }
}
