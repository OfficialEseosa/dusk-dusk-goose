export type RoomPhase = "lobby" | "started";
export interface RoomSnapshot {
  code: string;
  phase: RoomPhase;
  hostId: string;
  players: { id: string; name: string; connected: boolean }[];
}
export interface SeatCredential {
  room: string;
  playerId: string;
  token: string;
  bootId: string;
}
export interface ClientRequest {
  id: string;
  type: "create" | "join" | "resume" | "recover" | "leave" | "start";
  name?: string;
  code?: string;
  token?: string;
  bootId?: string;
  tokens?: string[];
}
export type ServerMessage =
  | { type: "hello"; bootId: string }
  | { type: "room"; room: RoomSnapshot }
  | {
      type: "result";
      id: string;
      ok: true;
      seat?: SeatCredential;
      room?: RoomSnapshot;
      offers?: { playerId: string; name: string; token: string }[];
    }
  | {
      type: "result";
      id: string;
      ok: false;
      error: { code: string; message: string };
    };
