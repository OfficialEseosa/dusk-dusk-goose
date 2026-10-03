export type Role = "alex" | "sam";
export type Phase =
  | "lobby"
  | "opening"
  | "flashlights"
  | "shelf"
  | "key"
  | "passage"
  | "latch"
  | "disclosure"
  | "route"
  | "marker"
  | "capsule"
  | "keepsakes"
  | "goodbye"
  | "ending";
export interface Seat {
  id: string;
  name: string;
  role: Role | null;
  connected: boolean;
  visible: boolean;
  ready: boolean;
}
export interface Beam {
  x: number;
  y: number;
  on: boolean;
}
export interface RadioMessage {
  id: number;
  kind: "player" | "story" | "system";
  sender: string;
  text: string;
}
export interface Target {
  id: string;
  label: string;
  x: number;
  y: number;
}
export interface Snapshot {
  code: string;
  revision: number;
  serverTime: number;
  phase: Phase;
  phaseStartedAt: number;
  paused: boolean;
  you: Seat;
  players: Seat[];
  beams: Record<Role, Beam>;
  inventory: string[];
  passageStep: number;
  mistakes: number;
  routeStep: number;
  disclosed: boolean;
  response: string | null;
  finaleResponse: string | null;
  signals: Record<Role, boolean>;
  replayVotes: string[];
  lobbyVotes: string[];
  messages: RadioMessage[];
  privateText: string;
  targets: Target[];
  hint: string;
  objective: string;
  keepsake: string;
  variant: number;
}
export interface Reply {
  ok: boolean;
  error?: string;
  code?: string;
  token?: string;
  playerId?: string;
}
export interface Action {
  type:
    "claim" | "ready" | "interact" | "choice" | "signal" | "replay" | "lobby";
  role?: Role;
  target?: string;
  value?: string | boolean;
}
export const PHASES: Phase[] = [
  "lobby",
  "opening",
  "flashlights",
  "shelf",
  "key",
  "passage",
  "latch",
  "disclosure",
  "route",
  "marker",
  "capsule",
  "keepsakes",
  "goodbye",
  "ending",
];
