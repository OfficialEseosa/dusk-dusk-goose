export type RoomPhase = "lobby" | "started";
export interface PlayerPose {
  x: number;
  z: number;
  facing: number;
  seq: number;
}
export interface RoomSnapshot {
  code: string;
  phase: RoomPhase;
  hostId: string;
  serverTime: number;
  startedAt?: number;
  blackoutAt?: number;
  players: (PlayerPose & { id: string; name: string; connected: boolean; skin: number })[];
}
export interface SeatCredential {
  room: string;
  playerId: string;
  token: string;
  bootId: string;
}
export interface ClientRequest {
  id: string;
  type: "create" | "join" | "resume" | "recover" | "leave" | "start" | "move";
  x?: number;
  z?: number;
  facing?: number;
  seq?: number;
  path?: { x: number; z: number }[];
  name?: string;
  code?: string;
  token?: string;
  bootId?: string;
  tokens?: string[];
}
export type ServerMessage =
  | ({ type: "pose_rejected"; playerId: string } & PlayerPose)
  | { type: "seat_replaced"; message: string }
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
