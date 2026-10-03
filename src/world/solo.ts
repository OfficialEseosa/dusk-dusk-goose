import type { Role, Snapshot } from "../../shared/protocol";

/** Local exploration uses the same world without creating a multiplayer seat. */
export function soloHouse(role: Role): Snapshot {
  return {
    code: "",
    revision: 0,
    serverTime: Date.now(),
    phase: "flashlights",
    phaseStartedAt: Date.now(),
    paused: false,
    you: {
      id: "solo",
      name: "You",
      role,
      connected: true,
      visible: true,
      ready: true,
    },
    players: [],
    beams: {
      alex: { x: 0.5, y: 0.5, on: false },
      sam: { x: 0.5, y: 0.5, on: false },
    },
    inventory: [],
    passageStep: 0,
    mistakes: 0,
    routeStep: 0,
    disclosed: false,
    response: null,
    finaleResponse: null,
    signals: { alex: false, sam: false },
    replayVotes: [],
    lobbyVotes: [],
    messages: [],
    privateText: "",
    targets: [],
    hint: "",
    objective: "Explore your room. Find the flashlight on the bedside table.",
    keepsake: "",
    variant: 0,
  };
}
