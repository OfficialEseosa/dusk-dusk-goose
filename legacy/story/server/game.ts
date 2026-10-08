import { phaseTransmission } from "./story.js";
import { randomBytes, randomInt } from "node:crypto";
import type {
  Action,
  Beam,
  Phase,
  RadioMessage,
  Role,
  Seat,
  Snapshot,
  Target,
} from "../shared/protocol.js";

export type Player = Seat & {
  token: string;
  socketId: string | null;
  rate: number[];
  hintLevel: number;
};
export const ROLES: Role[] = ["alex", "sam"];
export const other = (role: Role): Role => (role === "alex" ? "sam" : "alex");
const shapes = ["triangle", "circle", "star"];
const target = (id: string, label: string, x: number, y: number): Target => ({
  id,
  label,
  x,
  y,
});
export class GameRoom {
  code: string;
  createdAt: number;
  touchedAt: number;
  revision = 0;
  phase: Phase = "lobby";
  phaseStartedAt: number;
  players: Player[] = [];
  variant: number;
  seed: number;
  inventory: string[] = [];
  passageStep = 0;
  routeStep = 0;
  mistakes = 0;
  disclosed = false;
  response: string | null = null;
  finaleResponse: string | null = null;
  signals: Record<Role, boolean> = { alex: false, sam: false };
  beams: Record<Role, Beam> = {
    alex: { x: 0.5, y: 0.5, on: false },
    sam: { x: 0.5, y: 0.5, on: false },
  };
  messages: RadioMessage[] = [];
  replayVotes: string[] = [];
  lobbyVotes: string[] = [];
  private elapsed = 0;
  private lastTick: number;
  private overlap = 0;
  private beamExpiresAt: Partial<Record<Role, number>> = {};
  private capsuleStep = 0;
  private keepsakeReady = new Set<Role>();
  constructor(code: string, now = Date.now(), seed = randomInt(0, 2147483647)) {
    this.code = code;
    this.createdAt = this.touchedAt = this.phaseStartedAt = this.lastTick = now;
    this.seed = seed;
    this.variant = seed % 2;
  }
  get paused() {
    return this.players.length !== 2 || this.players.some((p) => !p.connected);
  }
  get shelfIndex() {
    return this.variant === 0 ? 0 : 2;
  }
  get passageSolution() {
    return this.variant === 0 ? [1, 0, 2] : [2, 1, 0];
  }
  get routeSolution() {
    return this.variant === 0 ? [2, 0, 1] : [1, 2, 0];
  }
  get keepsake() {
    return this.variant === 0
      ? "The photograph from your first summer together"
      : "The paper map of every place you called yours";
  }
  addPlayer(name: string, socketId: string): Player {
    if (this.players.length >= 2)
      throw Error("This night already has two players.");
    const p: Player = {
      id: randomBytes(8).toString("hex"),
      token: randomBytes(32).toString("hex"),
      name: cleanName(name),
      role: null,
      connected: true,
      visible: true,
      ready: false,
      socketId,
      rate: [],
      hintLevel: 0,
    };
    this.players.push(p);
    this.changed();
    return p;
  }
  reconnect(token: string, socketId: string): Player {
    const p = this.players.find((p) => p.token === token);
    if (!p)
      throw Error("This reconnect credential is not valid for this room.");
    if (p.role) {
      this.beams[p.role].on = false;
      delete this.beamExpiresAt[p.role];
      this.signals[p.role] = false;
      this.overlap = 0;
    }
    p.connected = true;
    p.visible = true;
    p.socketId = socketId;
    this.lastTick = Date.now();
    this.changed();
    return p;
  }
  disconnect(p: Player) {
    p.connected = false;
    p.socketId = null;
    this.clearSignals();
    this.changed();
  }
  visibility(p: Player, visible: boolean) {
    p.visible = visible;
    if (!visible && p.role) {
      // Give a deliberate aim a short lease for switching between game tabs.
      // Hidden input cannot renew it; disconnect and phase changes cancel it.
      if (this.beams[p.role].on && !this.beamExpiresAt[p.role])
        this.beamExpiresAt[p.role] = Date.now() + 10000;
      this.signals[p.role] = false;
      this.overlap = 0;
    }
    this.lastTick = Date.now();
    this.changed();
    this.maybeStart();
  }
  maybeStart() {
    if (
      this.phase === "lobby" &&
      !this.paused &&
      this.players.every((p) => p.ready && p.role)
    )
      this.enter("opening");
  }
  clearSignals() {
    this.beamExpiresAt = {};
    this.signals = { alex: false, sam: false };
    this.overlap = 0;
    this.beams.alex.on = false;
    this.beams.sam.on = false;
  }
  changed() {
    this.revision++;
    this.touchedAt = Date.now();
  }
  message(
    text: string,
    kind: RadioMessage["kind"] = "story",
    sender = "Radio",
  ) {
    this.messages.push({
      id: this.revision * 100 + this.messages.length,
      kind,
      sender,
      text,
    });
    this.messages = this.messages.slice(-40);
    this.changed();
  }
  enter(phase: Phase) {
    this.phase = phase;
    this.phaseStartedAt = Date.now();
    this.elapsed = 0;
    this.clearSignals();
    this.players.forEach((p) => (p.hintLevel = 0));
    this.changed();
    const line = phaseTransmission(phase, this.disclosed);
    if (line) this.message(line);
  }
  tick(now = Date.now()): boolean {
    const dt = Math.max(0, Math.min(now - this.lastTick, 500));
    this.lastTick = now;
    const rev = this.revision;
    for (const role of ROLES) {
      const expiresAt = this.beamExpiresAt[role];
      if (expiresAt && now >= expiresAt) {
        this.beams[role].on = false;
        delete this.beamExpiresAt[role];
        this.changed();
      }
    }
    this.maybeStart();
    if (!this.paused) {
      this.elapsed += dt;
      if (this.phase === "opening" && this.elapsed >= 4000)
        this.enter("flashlights");
      if (this.phase === "goodbye") {
        this.overlap =
          this.players.every((p) => p.visible) &&
          this.signals.alex &&
          this.signals.sam
            ? this.overlap + dt
            : 0;
        if (this.overlap >= 1000) this.enter("ending");
      }
    }
    return rev !== this.revision;
  }
  setBeam(p: Player, beam: Beam) {
    if (!p.role || !p.visible || this.paused) return;
    delete this.beamExpiresAt[p.role];
    this.beams[p.role] = {
      x: Math.max(0, Math.min(1, beam.x)),
      y: Math.max(0, Math.min(1, beam.y)),
      on: beam.on && this.inventory.includes(`flashlight-${p.role}`),
    };
  }
  illuminated(role: Role, t: Target) {
    const b = this.beams[other(role)];
    return b.on && Math.hypot(b.x - t.x, b.y - t.y) < 0.135;
  }
  targets(role: Role): Target[] {
    switch (this.phase) {
      case "flashlights":
        return [
          target(
            `flashlight-${role}`,
            "Your flashlight",
            role === "alex" ? 0.27 : 0.73,
            0.67,
          ),
        ];
      case "shelf":
        return [0, 1, 2].map((i) =>
          target(
            `shelf-${i}`,
            role === "sam"
              ? i === this.shelfIndex
                ? "Tin box · route card"
                : ["Blankets", "Garden tools", "Packed books"][i]
              : `Shelf ${i + 1}`,
            0.32 + i * 0.18,
            0.44,
          ),
        );
      case "key":
        return [
          target(
            "key",
            role === "alex" ? "Garden-gate key" : "Side passage key hook",
            0.67,
            0.62,
          ),
        ];
      case "passage":
        return [0, 1, 2].map((i) =>
          target(
            `step-${i}`,
            role === "sam"
              ? i === this.passageSolution[this.passageStep]
                ? "Safe stepping point"
                : "Loose board / obstacle"
              : `Stepping point ${i + 1}`,
            0.27 + i * 0.23,
            0.66 - this.passageStep * 0.08,
          ),
        );
      case "latch":
        return [target("latch", "Back-door latch", 0.62, 0.5)];
      case "route":
        return [0, 1, 2].map((i) =>
          target(
            `landmark-${i}`,
            role === "sam"
              ? `${shapes[(i + this.variant) % 3]} landmark`
              : `Fence anchor ${i + 1}`,
            0.25 + i * 0.25,
            0.61,
          ),
        );
      case "marker":
        return [target("marker", "Capsule marker", 0.55, 0.69)];
      case "capsule":
        return [
          target("capsule-alex", "Alex’s signal point", 0.35, 0.5),
          target("capsule-sam", "Sam’s signal point", 0.65, 0.5),
        ];
      default:
        return [];
    }
  }
  action(p: Player, a: Action) {
    if (!a || typeof a.type !== "string") throw Error("Invalid action.");
    if (a.type === "claim") {
      if (this.phase !== "lobby") throw Error("Roles are chosen in the lobby.");
      if (!ROLES.includes(a.role!)) throw Error("Choose a house.");
      if (this.players.some((q) => q !== p && q.role === a.role))
        throw Error("Your friend already chose that house.");
      p.role = a.role!;
      p.ready = false;
      this.changed();
      return;
    }
    if (a.type === "ready") {
      if (this.phase !== "lobby") return;
      if (!p.role) throw Error("Choose a house first.");
      p.ready = true;
      this.changed();
      if (!this.paused && this.players.every((q) => q.ready && q.role))
        this.enter("opening");
      return;
    }
    if (!p.role) throw Error("Choose a house first.");
    if (this.paused) throw Error("Waiting for both players to return.");
    const role = p.role;
    if (a.type === "replay" || a.type === "lobby") {
      if (this.phase !== "ending") throw Error("Finish this night first.");
      const votes = a.type === "replay" ? this.replayVotes : this.lobbyVotes;
      const opposite = a.type === "replay" ? this.lobbyVotes : this.replayVotes;
      const ix = opposite.indexOf(p.id);
      if (ix >= 0) opposite.splice(ix, 1);
      if (!votes.includes(p.id)) votes.push(p.id);
      this.changed();
      if (votes.length === 2) this.reset(a.type === "replay");
      return;
    }
    if (a.type === "signal") {
      if (this.phase !== "goodbye")
        throw Error("Signals are used at the final goodbye.");
      this.signals[role] = p.visible && a.value === true;
      this.changed();
      return;
    }
    if (a.type === "choice") {
      if (
        role === "alex" &&
        this.disclosed &&
        ["route", "marker"].includes(this.phase) &&
        ["stay", "understand"].includes(String(a.value))
      ) {
        if (this.response) return;
        this.response = String(a.value);
        this.message(
          a.value === "stay"
            ? "Alex: I wish you could stay. I’m glad you told me."
            : "Alex: Different streets, same signal. Let’s finish tonight together.",
        );
        return;
      }
      if (
        role === "sam" &&
        a.value === "tell" &&
        ["route", "marker"].includes(this.phase)
      ) {
        if (!this.disclosed) {
          this.disclosed = true;
          this.message(
            "Sam: Before we get there: I am moving away tomorrow. I should have told you sooner.",
          );
        }
        return;
      }
      if (this.phase === "disclosure") {
        if (role === "sam" && this.disclosed && a.value === "tell") return;
        if (
          role === "sam" &&
          !this.disclosed &&
          ["tell", "defer"].includes(String(a.value))
        ) {
          if (a.value === "tell") {
            this.disclosed = true;
            this.message(
              "Sam: I am moving away tomorrow. I should have told you sooner.",
            );
          } else {
            this.message(
              "Sam: Let’s get the capsule first. There is something I want to say when we get there.",
            );
            this.enter("route");
          }
          return;
        }
        if (
          role === "alex" &&
          this.disclosed &&
          ["stay", "understand"].includes(String(a.value))
        ) {
          this.response = String(a.value);
          this.message(
            a.value === "stay"
              ? "Alex: I wish you could stay. I’m glad you told me."
              : "Alex: We’ll find a way to keep talking. Let’s finish our night.",
          );
          this.enter("route");
          return;
        }
      }
      if (this.phase === "keepsakes") {
        if (this.keepsakeReady.has(role)) return;
        if (
          role === "alex" &&
          ["stay", "understand"].includes(String(a.value))
        ) {
          this.finaleResponse = String(a.value);
          this.keepsakeReady.add(role);
          this.message(
            a.value === "stay"
              ? "Alex: Maple Street won’t feel the same. Keep a light on for me."
              : "Alex: Different streets, same signal. We’ll make new maps.",
          );
        } else if (role === "sam" && a.value === "continue") {
          this.keepsakeReady.add(role);
          this.message(
            "Sam: I’ll take the token. You keep the map. We can still find each other.",
          );
        } else throw Error("Choose your next line.");
        this.changed();
        if (this.keepsakeReady.size === 2) this.enter("goodbye");
        return;
      }
      throw Error("That choice is not available now.");
    }
    if (a.type !== "interact") throw Error("Unknown action.");
    const t = this.targets(role).find((t) => t.id === a.target);
    if (!t) throw Error("That object is not available now.");
    if (this.phase === "flashlights") {
      if (!this.inventory.includes(t.id)) {
        this.inventory.push(t.id);
        this.message(`${role === "alex" ? "Alex" : "Sam"} found a flashlight.`);
      }
      if (ROLES.every((r) => this.inventory.includes(`flashlight-${r}`)))
        this.enter("shelf");
      this.changed();
      return;
    }
    const actors: Partial<Record<Phase, Role>> = {
      shelf: "sam",
      key: "alex",
      passage: "alex",
      latch: "sam",
      route: "sam",
      marker: "alex",
    };
    if (actors[this.phase] && actors[this.phase] !== role)
      throw Error("Your friend needs to interact; guide them with your light.");
    if (
      ["shelf", "key", "passage", "latch", "marker", "capsule"].includes(
        this.phase,
      ) &&
      !this.illuminated(role, t)
    )
      throw Error("Ask your friend to light this spot, then try again.");
    switch (this.phase) {
      case "shelf":
        if (t.id !== `shelf-${this.shelfIndex}`)
          throw Error(
            "That shelf does not contain the tin. Ask for another beam.",
          );
        this.inventory.push("route-card");
        this.enter("key");
        break;
      case "key":
        this.inventory.push("gate-key");
        this.enter("passage");
        break;
      case "passage":
        if (t.id !== `step-${this.passageSolution[this.passageStep]}`) {
          this.mistakes++;
          this.message(
            "A board creaks. Step back to the last safe point; no progress was lost.",
            "system",
          );
          break;
        }
        this.passageStep++;
        this.changed();
        if (this.passageStep === 3) this.enter("latch");
        break;
      case "latch":
        this.enter("disclosure");
        break;
      case "route":
        if (t.id !== `landmark-${this.routeSolution[this.routeStep]}`) {
          this.mistakes++;
          this.message(
            "That shape is not next on the card. Try the same step again.",
            "system",
          );
          break;
        }
        this.routeStep++;
        this.changed();
        if (this.routeStep === 3) this.enter("marker");
        break;
      case "marker":
        this.enter("capsule");
        break;
      case "capsule": {
        const expected: Role = this.capsuleStep % 2 === 0 ? "alex" : "sam";
        if (role !== expected || t.id !== `capsule-${role}`)
          throw Error(
            `It is ${expected === "alex" ? "Alex" : "Sam"}’s turn to answer the signal.`,
          );
        this.capsuleStep++;
        this.message(
          `${role === "alex" ? "Alex" : "Sam"}: I am here. (${this.capsuleStep}/4)`,
        );
        if (this.capsuleStep === 4) {
          this.inventory.push("capsule");
          this.enter("keepsakes");
        }
        break;
      }
      default:
        throw Error("That object cannot be used now.");
    }
  }
  reset(swap: boolean) {
    this.seed++;
    this.variant = this.seed % 2;
    this.inventory = [];
    this.passageStep = this.routeStep = this.mistakes = this.capsuleStep = 0;
    this.disclosed = false;
    this.response = this.finaleResponse = null;
    this.messages = [];
    this.replayVotes = [];
    this.lobbyVotes = [];
    this.keepsakeReady.clear();
    this.clearSignals();
    this.players.forEach((p) => {
      p.ready = false;
      p.hintLevel = 0;
      if (swap && p.role) p.role = other(p.role);
    });
    this.enter("lobby");
  }
  text(role: Role): string {
    if (
      role === "sam" &&
      !this.disclosed &&
      [
        "lobby",
        "opening",
        "flashlights",
        "key",
        "latch",
        "disclosure",
      ].includes(this.phase)
    )
      return "You leave tomorrow. You still haven’t told Alex. Tonight might be your last chance.";
    if (this.phase === "shelf")
      return role === "sam"
        ? "Ask Alex to sweep the garage shelves. Look for the tin box when their light reaches it."
        : "You can light Sam’s shelves, but cannot read their contents. Ask which shelf to aim at.";
    if (this.phase === "passage")
      return role === "sam"
        ? `Next safe point: ${this.passageSolution[this.passageStep] + 1}. Light it so Alex can move.`
        : "Sam can see the obstacles. Ask where to step, then choose the lit point.";
    if (this.phase === "route")
      return role === "alex"
        ? `Route card: ${this.routeSolution.map((i) => shapes[(i + this.variant) % 3]).join(" → ")}. Read the next shape to Sam.`
        : "Alex has the route card. Match each shape to a landmark here.";
    if (this.phase === "capsule")
      return `Signal ${this.capsuleStep + 1} of 4: ${this.capsuleStep % 2 === 0 ? "Alex" : "Sam"} answers while the other friend lights their signal point.`;
    if (this.phase === "ending")
      return this.disclosed
        ? "You said it before the tower. The goodbye still hurt, but neither friend had to carry it alone."
        : "The truth arrived under the tower. There was still time to answer, and still a light across the street.";
    return role === "alex"
      ? "Corner House · Alex. Your friend sees another part of Maple Street."
      : "Blue House · Sam. Your friend sees another part of Maple Street.";
  }
  hint(role: Role, level = 0): string {
    if (level === 0)
      return "Compare what you see with your friend over the radio. Ask for the light before reaching.";
    switch (this.phase) {
      case "lobby":
        return "Each choose a different house, then both press Ready.";
      case "opening":
        return "The lights go out after four seconds. Your friend will catch up when they return.";
      case "flashlights":
        return "Choose your flashlight in the room.";
      case "shelf":
        return role === "sam"
          ? `Retrieve shelf ${this.shelfIndex + 1} while Alex lights it.`
          : "Ask Sam which shelf holds the tin, then aim at that shelf.";
      case "key":
        return "Sam lights the key hook; Alex retrieves the key.";
      case "passage":
        return role === "sam"
          ? `Light safe point ${this.passageSolution[this.passageStep] + 1}.`
          : "Ask Sam for the safe point; choose it while their beam is there.";
      case "latch":
        return "Alex lights the latch; Sam opens it.";
      case "disclosure":
        return "Sam chooses whether to tell. If told, Alex chooses a response.";
      case "route":
        return role === "alex"
          ? this.text(role)
          : "Ask Alex for the next shape, then select its landmark.";
      case "marker":
        return "Sam lights the capsule marker; Alex retrieves it.";
      case "capsule":
        return this.text(role);
      case "keepsakes":
        return "Alex chooses a response; Sam chooses to keep the token and continue.";
      case "goodbye":
        return "Both toggle your signal on; overlap for one second.";
      case "ending":
        return "Both agree on Replay to swap roles, or both choose Lobby.";
    }
  }
  snapshot(p: Player): Snapshot {
    const seat = ({
      id,
      name,
      role,
      connected,
      visible,
      ready,
    }: Player): Seat => ({ id, name, role, connected, visible, ready });
    const role = p.role ?? "alex";
    const objectives: Record<Phase, string> = {
      lobby: "Choose your houses. Ready together.",
      opening: "The last night of summer",
      flashlights: "Find both flashlights",
      shelf: "Recover Sam’s route card",
      key: "Recover Alex’s gate key",
      passage: `Cross the passage · ${Math.min(this.passageStep + 1, 3)}/3`,
      latch: "Help Sam outside",
      disclosure: "Say what you are carrying",
      route: `Follow the route card · ${Math.min(this.routeStep + 1, 3)}/3`,
      marker: "Find the hidden capsule",
      capsule: `Answer the old signal · ${this.capsuleStep}/4`,
      keepsakes: "Decide what you will carry",
      goodbye: "Hold a light for your friend",
      ending: "Last Night on Maple Street",
    };
    return {
      code: this.code,
      revision: this.revision,
      serverTime: Date.now(),
      phase: this.phase,
      phaseStartedAt: this.phaseStartedAt,
      paused: this.paused,
      you: seat(p),
      players: this.players.map(seat),
      beams: structuredClone(this.beams),
      inventory: [...this.inventory],
      passageStep: this.passageStep,
      mistakes: this.mistakes,
      routeStep: this.routeStep,
      disclosed: this.disclosed,
      response: this.response,
      finaleResponse: this.finaleResponse,
      signals: { ...this.signals },
      replayVotes: [...this.replayVotes],
      lobbyVotes: [...this.lobbyVotes],
      messages: [...this.messages],
      privateText: p.role
        ? this.text(role)
        : "Choose the house whose story you want to see.",
      targets: p.role ? this.targets(role) : [],
      hint: this.hint(role, p.hintLevel),
      objective: objectives[this.phase],
      keepsake: this.keepsake,
      variant: this.variant,
    };
  }
}
export function cleanName(value: unknown) {
  return typeof value === "string"
    ? value.trim().slice(0, 24) || "Friend"
    : "Friend";
}
