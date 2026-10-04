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
  roster?: { id: string; name: string; connected: boolean; skin: number }[];
  match?: { id: string; phase: 'playing' | 'finished'; roundNumber: number; totalRounds: number; solo: boolean; scores: { playerId: string; name: string; score: number; roundPoints: number }[]; rosterChanged: boolean; announcement: string; nextRoundAt?: number; winnerIds: string[] };
  round?: { number: number; phase: 'hiding' | 'seeking' | 'reveal'; hiderId: string | null; phaseEndsAt: number; seekingStartedAt?: number; revealReadyAt?: number; capsuleSpotId?: string; foundBy?: string | null; foundByName?: string; footprints?: { id: string; x: number; z: number; facing: number; fadeAt: number; expiresAt: number }[]; marks?: { id: string; x: number; z: number; createdAt: number }[]; clues?: { id: string; text: string; sentAt: number }[]; clueOffer?: { id: string; options: { id: string; text: string }[]; deadlineAt: number }; decoysRemaining?: number };
  players: (PlayerPose & { id: string; name: string; connected: boolean; skin: number; role?: 'hider' | 'seeker' | 'waiting'; place?: 'street' | 'prep'; flashlight?: boolean; frozenUntil?: number; immunityUntil?: number; cooldownUntil?: number; search?: { spotId: string; startedAt: number; endsAt: number } })[];
}
export interface SeatCredential {
  room: string;
  playerId: string;
  token: string;
  bootId: string;
}
export interface ClientRequest {
  id: string;
  type: "create" | "join" | "resume" | "recover" | "leave" | "start" | "play_again" | "move" | "pickup" | "bury" | "disturb" | "choose_clue" | "search_begin" | "search_cancel" | "search_complete";
  clueId?: string;
  spotId?: string;
  roundNumber?: number;
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
  | { type: 'search_noise'; eventId: string; playerId: string }
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
