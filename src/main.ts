import { io } from "socket.io-client";
import type { Action, Beam, Reply, Role, Snapshot } from "../shared/protocol";
import { TITLES, quickMessages, actorCanInteract } from "./content";
import { escapeHtml as e, renderScene } from "./scene";
import { copyInvite } from "./clipboard";
import { patchDom } from "./dom";
import { HouseWorld } from "./world/house";
import { soloHouse } from "./world/solo";
let houseWorld: HouseWorld | null = null;
let worldFailed = false;
function housePhase(s: Snapshot) {
  return !worldFailed && ["opening", "flashlights"].includes(s.phase);
}
import {
  readSeat,
  rememberSeat,
  recentSeat,
  clearTabSeat,
  forgetSeat,
} from "./seat";
import "./style.css";
const app = document.querySelector<HTMLDivElement>("#app")!;
const soloParam = new URLSearchParams(location.search).get("solo");
let solo: Snapshot | null =
  soloParam === "alex" || soloParam === "sam" ? soloHouse(soloParam) : null;
const socket = io({ autoConnect: !solo });
let state: Snapshot | null = null,
  error = "",
  muted = localStorage.getItem("maple-muted") === "true",
  radioOpen = true;
let localBeam: Beam = { x: 0.5, y: 0.5, on: false },
  remoteBeam: Beam = { x: 0.5, y: 0.5, on: false },
  targetBeam = { ...remoteBeam };
let lastBeam = 0,
  lastRevision = -1,
  clockOffset = 0,
  audio: AudioContext | undefined,
  lastPhase = "",
  progressKey = "",
  lastProgress = Date.now(),
  holding = false;
let socketJoined = false;
let seatReplaced = false;
let explicitConnecting = false;
let recoveryAttempts = 0;
let radioDraft = "",
  radioPending = false;
let inviteStatus = "",
  inviteCopied = false,
  invitePending = false;
const saved = readSeat;
function beep(frequency = 330) {
  if (muted || !audio) return;
  try {
    const osc = audio.createOscillator(),
      gain = audio.createGain();
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.025, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.16);
  } catch {
    /* optional audio */
  }
}
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    void audio.resume().catch(() => {});
  } catch {
    /* optional audio */
  }
}
function emit(
  event: string,
  payload: unknown,
  after?: (reply: Reply) => void,
  settled?: () => void,
) {
  socket
    .timeout(7000)
    .emit(event, payload, (timeout: Error | null, reply: Reply) => {
      settled?.();
      if (timeout) {
        error =
          "The radio connection is slow. Your progress is saved; try again.";
        render();
        return;
      }
      if (!reply?.ok) {
        error = reply?.error ?? "That action could not be completed.";
        if (event === "join" && error.includes("already has two players")) {
          const request = payload as { code?: string; token?: string };
          const remembered =
            request.code && !request.token ? recentSeat(request.code) : null;
          if (remembered) {
            rememberSeat(remembered);
            enter("join", remembered.name, remembered.code, remembered.token);
            return;
          }
        }
        if (
          event === "join" &&
          (error.startsWith("No night") ||
            error.includes("credential is not valid"))
        ) {
          forgetSeat(saved()?.code);
          state = null;
          lastRevision = -1;
          error =
            "This room is no longer available. Start a fresh night together.";
        }
        if (
          event === "join" &&
          error.includes("already open") &&
          recoveryAttempts < 12
        ) {
          recoveryAttempts++;
          setTimeout(() => {
            const seat = saved();
            if (seat && !socketJoined && socket.connected)
              enter("join", seat.name, seat.code, seat.token);
          }, 2000);
          error =
            "Rejoining your seat. Close another window using this seat, or wait for the previous connection to finish closing.";
        }
        render();
        return;
      }
      error = "";
      after?.(reply);
    });
}
function action(a: Action) {
  if (!socket.connected || !socketJoined) {
    error = "Your radio is reconnecting. Wait a moment, then try again.";
    render();
    return;
  }
  emit("action", a);
}
function leaveLobby() {
  emit("leave", {}, () => {
    returnToTitle(false);
  });
}
function returnToTitle(preserveSeat: boolean) {
  if (preserveSeat) clearTabSeat();
  else forgetSeat(state?.code);
  state = null;
  socketJoined = false;
  error = "";
  radioDraft = "";
  radioPending = false;
  inviteStatus = "";
  inviteCopied = invitePending = false;
  lastRevision = -1;
  lastPhase = "";
  recoveryAttempts = 0;
  holding = false;
  localBeam = { x: 0.5, y: 0.5, on: false };
  remoteBeam = targetBeam = { x: 0.5, y: 0.5, on: false };
  history.replaceState(null, "", "/");
  render();
}
function gameMenu() {
  returnToTitle(true);
  socket.disconnect();
  socket.connect();
}
function leaveNight() {
  returnToTitle(false);
  socket.disconnect();
  socket.connect();
}
function enter(
  event: "create" | "join",
  name: string,
  code?: string,
  token?: string,
) {
  seatReplaced = false;
  if (!socket.connected) {
    if (explicitConnecting) return;
    explicitConnecting = true;
    socket.once("connect", () => {
      explicitConnecting = false;
      enter(event, name, code, token);
    });
    socket.connect();
    return;
  }
  emit(event, { name, code, token }, (reply) => {
    if (reply.code && reply.token) {
      rememberSeat({ code: reply.code, token: reply.token, name });
      history.replaceState(null, "", `?room=${reply.code}`);
      socket.emit("visibility", { visible: !document.hidden });
    }
  });
}
socket.on("connect", () => {
  socketJoined = false;
  const seat = saved();
  if (seat && !solo && !seatReplaced && !explicitConnecting)
    enter("join", seat.name, seat.code, seat.token);
  render();
  socket.emit("visibility", { visible: !document.hidden });
});
socket.on("disconnect", (reason) => {
  socketJoined = false;
  render();
  if (reason === "io server disconnect" && !saved() && !seatReplaced)
    socket.connect();
});
socket.on("seat-replaced", () => {
  returnToTitle(true);
  seatReplaced = true;
  error =
    "This night continued in another tab. Your progress is safe there. You can start a new night here.";
  socket.disconnect();
  render();
});
socket.on("expired", () => {
  forgetSeat(state?.code ?? saved()?.code);
  state = null;
  lastRevision = -1;
  holding = false;
  error = "This night has expired. Start a fresh night together.";
  render();
});
socket.on("snapshot", (next: Snapshot) => {
  if (solo) return;
  socketJoined = true;
  if (state?.code !== next.code) {
    inviteStatus = "";
    inviteCopied = invitePending = false;
    radioDraft = "";
    radioPending = false;
  }
  recoveryAttempts = 0;
  if (next.revision < lastRevision && next.code === state?.code) return;
  lastRevision = next.revision;
  clockOffset = next.serverTime - Date.now();
  state = next;
  const progress =
    next.phase + next.passageStep + next.routeStep + next.inventory.length;
  if (progress !== progressKey) {
    progressKey = progress;
    lastProgress = Date.now();
  }
  const role = next.you.role;
  if (role) {
    localBeam = next.beams[role];
    targetBeam = next.beams[role === "alex" ? "sam" : "alex"];
  }
  if (lastPhase !== next.phase) {
    beep(next.phase === "ending" ? 660 : 330);
    lastPhase = next.phase;
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  render();
});
socket.on(
  "pose",
  (packet: { role: Role; pose: import("../shared/protocol").PlayerPose }) =>
    houseWorld?.receive(packet.role, packet.pose),
);
socket.on("beam", (packet: { role: Role; beam: Beam }) => {
  if (packet.role !== state?.you.role) targetBeam = packet.beam;
  houseWorld?.receiveBeam(packet.role, packet.beam);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) releaseHold();
  socket.emit("visibility", { visible: !document.hidden });
});
function aim(x: number, y: number, force = false) {
  if (!state?.you.role || !hasFlashlight()) return;
  localBeam = {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    on: true,
  };
  if (force || performance.now() - lastBeam > 60) {
    lastBeam = performance.now();
    socket.emit("beam", localBeam);
  }
  paintLights();
}
function hasFlashlight() {
  return !!state?.inventory.includes(`flashlight-${state.you.role}`);
}
function paintLights() {
  const local = document.querySelector("#local-light"),
    remote = document.querySelector("#partner-light");
  local?.setAttribute("cx", String(localBeam.x * 1000));
  local?.setAttribute("cy", String(localBeam.y * 560));
  local?.setAttribute("opacity", localBeam.on ? "1" : "0");
  remote?.setAttribute("cx", String(remoteBeam.x * 1000));
  remote?.setAttribute("cy", String(remoteBeam.y * 560));
  remote?.setAttribute("opacity", targetBeam.on ? "1" : "0");
}
function animation() {
  const smoothing = matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 1
    : 0.2;
  remoteBeam.x += (targetBeam.x - remoteBeam.x) * smoothing;
  remoteBeam.y += (targetBeam.y - remoteBeam.y) * smoothing;
  paintLights();
  document
    .querySelector(".radio-heading")
    ?.classList.toggle("nudge", Date.now() - lastProgress > 50000);
  document.querySelectorAll<HTMLElement>("[data-shelf-label]").forEach((el) => {
    const target = state?.targets.find((t) => t.id === el.dataset.shelfLabel);
    if (target) el.textContent = "◎ " + shelfLabel(target);
  });
  document
    .querySelectorAll<HTMLElement>("[data-shelf-target]")
    .forEach((el) => {
      const target = state?.targets.find(
        (t) => t.id === el.dataset.shelfTarget,
      );
      if (target)
        el.setAttribute("aria-label", `Interact with ${shelfLabel(target)}`);
    });
  requestAnimationFrame(animation);
}
requestAnimationFrame(animation);
function button(label: string, attrs: string = "", cls = "") {
  return `<button class="${cls}" ${attrs}>${label}</button>`;
}
function header() {
  return `<header><a class="wordmark" href="/">MAPLE STREET <span>SUMMER ’02</span></a><div class="header-tools">${state && state.phase !== "lobby" ? button("Game menu", 'id="game-menu" data-testid="game-menu"', "quiet game-menu") : ""}<span class="connection ${socket.connected ? "" : "offline"}">${socket.connected && (!state || socketJoined) ? "● Radio connected" : "◌ Reconnecting…"}</span>${button(muted ? "Sound off" : "Sound on", 'id="mute" aria-label="Toggle sound"', "quiet")}</div></header>`;
}
function title() {
  const room = new URLSearchParams(location.search).get("room") ?? "";
  const resume = recentSeat(room ? room.toUpperCase() : undefined);
  return `${header()}<main class="title-screen"><div class="title-world">${renderScene(null)}<div class="title-gradient"></div></div><section class="title-copy"><p class="eyebrow">A TWO-PLAYER SUMMER-NIGHT STORY</p><h1>Last Night on<br><em>Maple Street</em></h1><p class="premise">The lights go out. Your friend is across the street.<br>One time capsule. One last night before everything changes.</p><div class="entry">${button("Explore house solo", 'id="explore-solo" data-testid="explore-solo"', "primary full")}<p class="small">Walk around immediately. No room or friend needed.</p>${resume ? button(`Resume night ${e(resume.code)}`, 'id="resume-night" data-testid="resume-night"', "full") : ""}<form id="create-form"><label for="create-name">What should your friend call you?</label><input id="create-name" name="name" maxlength="24" placeholder="Your name (optional)" autocomplete="nickname">${button("Start a Night <span>↗</span>", 'type="submit" data-testid="create"', "primary")}</form><form id="join-form"><label for="join-code">Already have a room?</label><div class="join-row"><input id="join-code" name="code" aria-label="Room code" maxlength="8" value="${e(room)}" placeholder="ROOM CODE" autocomplete="off" required>${button("Join a Night", 'type="submit" data-testid="join"')}</div></form></div><p class="small">Two people · Separate screens · About 10–12 minutes<br>No accounts. Use the radio, or talk together.</p></section></main>`;
}
function lobby(s: Snapshot) {
  const waiting = s.players.find((p) => !p.connected);
  const bothReady = s.players.length === 2 && s.players.every((p) => p.ready);
  const presenceNote =
    bothReady && waiting
      ? `${waiting.name}${waiting.connected ? "’s game tab is hidden. Keep both game windows visible side by side, or return to the game on both devices." : "’s radio is reconnecting. The night will start automatically when they return."}`
      : "";
  return `${header()}<main class="lobby-screen"><div class="lobby-art">${renderScene(null)}</div><section class="lobby-copy">${button("← Back to title", 'id="leave-lobby" data-testid="leave-lobby"', "quiet lobby-back")}<p class="eyebrow">THE LAST NIGHT OF SUMMER</p><h1>Meet me at<br>the window.</h1><div class="invite"><div><span class="small">YOUR ROOM</span><strong data-testid="room-code">${e(s.code)}</strong></div>${button(inviteCopied ? "Link selected" : "Copy invite link", 'id="copy" data-testid="copy-invite"')}</div><div class="invite-share"><label for="invite-link">Invite link</label><input id="invite-link" readonly value="${e(`${location.origin}/?room=${s.code}`)}"><p id="invite-status" role="status">${e(inviteStatus || "Copy the link, or share the room code above.")}</p></div><p>Choose a house. You see different things.<br>Help each other over the radio.</p><div class="role-list">${(
    ["alex", "sam"] as Role[]
  )
    .map((role) => {
      const seat = s.players.find((p) => p.role === role);
      return `<button data-testid="claim-${role}" data-claim="${role}" class="role ${s.you.role === role ? "selected" : ""}" ${seat && seat.id !== s.you.id ? "disabled" : ""}><span class="house-icon">${role === "alex" ? "⌂" : "⌂"}</span><span><strong>${role === "alex" ? "Corner House" : "Blue House"}</strong><small>${role === "alex" ? "Alex · The summer ritual" : "Sam · A secret to carry"}</small><small>${seat ? `${e(seat.name)} · ${seat.connected ? (seat.visible ? "connected" : "tab hidden") : "reconnecting"}${seat.ready ? " · ready" : ""}` : "Seat open"}</small></span><span>${s.you.role === role ? "✓" : "↗"}</span></button>`;
    })
    .join(
      "",
    )}</div>${button(s.you.ready ? (bothReady && waiting ? "Both ready — waiting for your friend’s radio" : "Ready — waiting for your friend") : "Ready for the Night", 'id="ready" data-testid="ready" ' + (!s.you.role || s.you.ready ? "disabled" : ""), "primary full")}<p class="${presenceNote ? "lobby-presence" : "small"}" data-testid="lobby-status" role="status">${presenceNote ? e(presenceNote) : s.players.length < 2 ? "Share the invitation with your friend." : "Your night begins when both friends are ready."}</p></section></main>`;
}
function choices(s: Snapshot) {
  if (
    ["route", "marker"].includes(s.phase) &&
    s.you.role === "alex" &&
    s.disclosed &&
    !s.response
  )
    return `${choice("I wish you could stay.", "stay")}${choice("We’ll keep our signal.", "understand")}`;
  if (
    s.you.role === "sam" &&
    !s.disclosed &&
    ["route", "marker"].includes(s.phase)
  )
    return choice("Tell Alex now", "tell");
  if (s.phase === "disclosure") {
    if (s.you.role === "sam" && !s.disclosed)
      return `${choice("Tell Alex now", "tell")}${choice("Not yet", "defer")}`;
    if (s.you.role === "alex" && s.disclosed && !s.response)
      return `${choice("I wish you’d told me sooner.", "stay")}${choice("We still have tonight.", "understand")}`;
  }
  if (s.phase === "keepsakes") {
    if (s.you.role === "alex" && !s.finaleResponse)
      return `${choice("Promise we’ll stay in touch.", "stay")}${choice("Take a piece of Maple Street.", "understand")}`;
    if (s.you.role === "sam")
      return choice("Keep this summer with us", "continue");
  }
  return "";
}
function choice(label: string, value: string) {
  return button(label, `data-choice="${value}" data-testid="choice-${value}"`);
}
function sceneHotspots(s: Snapshot, canInteract: boolean) {
  return s.targets
    .map((t) => {
      const interact =
        canInteract &&
        (s.phase !== "capsule" || t.id === `capsule-${s.you.role}`);
      const operation = interact ? "target" : "aim";
      const label =
        s.phase === "flashlights"
          ? "Pick up your flashlight"
          : `${interact ? "Interact with" : "Aim at"} ${shelfLabel(t)}`;
      return `<button class="hotspot" style="left:${t.x * 100}%;top:${t.y * 100}%" data-${operation}="${e(t.id)}" data-testid="scene-${e(t.id)}" ${s.phase === "shelf" && s.you.role === "sam" ? `data-shelf-target="${e(t.id)}"` : ""} aria-label="${e(label)}"><span>${interact ? "↗" : "+"}</span></button>`;
    })
    .join("");
}
function sceneActions(
  s: Snapshot,
  partner: Snapshot["players"][number] | undefined,
) {
  return `<div class="actions scene-actions">${choices(s)}${s.phase === "goodbye" ? `${button(s.signals[s.you.role!] ? "Signal is held — tap to release" : "Hold your light with your friend", 'id="signal-toggle" data-testid="signal-toggle"', "primary")}${button("Press and hold signal", 'id="signal-hold"')}<span class="signal-status">${partner && !partner.visible ? "Your friend’s tab is away. Return together for the final signal." : partner?.role && s.signals[partner.role] ? "Your friend is holding their signal." : "Waiting for your friend’s light…"}</span>` : ""}</div>`;
}
function game(s: Snapshot) {
  const canInteract = actorCanInteract(s);
  const partner = s.players.find((p) => p.id !== s.you.id);
  return `${header()}<main class="game-screen"><section class="scene-column"><div class="chapter"><span>${e(TITLES[s.phase])}</span><span>${s.you.role === "alex" ? "CORNER HOUSE / ALEX" : "BLUE HOUSE / SAM"}</span></div><div class="scene ${housePhase(s) ? "house-scene" : ""}" id="scene">${housePhase(s) ? '<div id="house-world" data-dom-preserve="true"></div>' : renderScene(s)}<div class="scene-vignette"></div>${sceneHotspots(s, canInteract)}<p class="scene-objective">${e(s.objective)}</p>${sceneActions(s, partner)}${s.phase === "opening" ? '<div class="date-card"><p>AUGUST 30, 2002</p><h2>11:52 PM.</h2><span>Maple Street. The last night of summer.</span></div>' : ""}${s.paused || !socketJoined ? `<div class="pause-overlay"><h2>We’ll wait for each other.</h2><p>${!socketJoined ? "Your radio is reconnecting. Wait here; your progress is safe." : partner && !partner.connected ? `${e(partner.name)} is disconnected. They can reopen the invite link to rejoin. You can also return to the game menu.` : "A game tab is hidden. Keep both game windows visible, or return on both devices."}</p><small>Your discoveries and choices are safe.</small>${button("Leave this night", 'id="leave-night" data-testid="leave-night"', "quiet")}</div>` : ""}${s.phase === "ending" ? `<div class="ending-card"><p class="eyebrow">THE LIGHTS CAME BACK. WE KEPT OUR PROMISE.</p><h2>Some things<br>travel with you.</h2><p>${s.disclosed ? "We said the difficult thing. Then we finished our summer together." : "We found the words under the water tower. It was never too late."}</p><span class="keepsake-symbol">${s.keepsake.toLowerCase().includes("map") ? "⌘" : s.keepsake.toLowerCase().includes("token") ? "◇" : "▧"}</span><p class="small">Recovered: ${e(s.keepsake || "our summer keepsake")}</p>${button("Swap Roles and Play Again", 'data-replay data-testid="replay"', "primary")}${button("Return to Lobby", 'data-lobby data-testid="lobby"')}<small>${s.replayVotes.length || s.lobbyVotes.length ? "Waiting for your friend’s matching vote." : "Both friends choose together."}</small></div>` : ""}</div><div class="scene-caption"><span>◌ ${hasFlashlight() ? "Your light follows your pointer. Amber light belongs to your friend." : "Moonlight is enough to find your way."}</span><span>${s.inventory.length ? e(s.inventory.join(" · ").replaceAll("-", " ")) : "Walkie-talkie / Channel 04"}</span></div><section class="objective"><p class="eyebrow">${s.phase === "ending" ? "ONE LAST SUMMER" : "YOUR NEXT MOMENT"}</p><h2>${e(s.objective)}</h2>${s.phase === "ending" ? `<p class="recovered-note">Recovered keepsake: ${e(s.keepsake)}</p>` : ""}${s.privateText ? `<p class="private-note">${e(s.privateText)}</p>` : ""}${s.targets.length && s.phase !== "opening" ? `<div class="target-controls"><p class="small">${canInteract ? "Aim and interact are separate. Your friend may need to light the object first." : "Your friend needs your light. Select an aim point, then hold it steady."}</p><div class="anchor-list">${s.targets.map((t) => `<div class="anchor">${button(`◎ ${e(shelfLabel(t))}`, `data-aim="${e(t.id)}" data-testid="aim-${e(t.id)}" ${s.phase === "shelf" && s.you.role === "sam" ? `data-shelf-label="${e(t.id)}"` : ""}`, "aim")}${canInteract ? button("Interact", `data-target="${e(t.id)}" data-testid="target-${e(t.id)}"`, "interact") : ""}</div>`).join("")}</div></div>` : ""}</section></section><aside class="radio-panel ${radioOpen ? "" : "collapsed"}"><div class="radio-heading"><div><span class="radio-led"></span><strong>Walkie-talkie</strong><small>CHANNEL 04 · ${partner?.connected ? (partner.visible ? "FRIEND ONLINE" : "FRIEND AWAY") : "AWAITING FRIEND"}</small></div>${button(radioOpen ? "−" : "+", 'id="radio-toggle" aria-label="Toggle radio"', "quiet")}</div><div class="radio-content"><div class="messages" aria-live="polite">${
    s.messages
      .slice(-12)
      .map(
        (m) =>
          `<div class="message ${m.kind}" data-dom-key="message-${e(m.id)}"><small>${m.kind === "story" ? "STORY TRANSMISSION" : m.kind === "system" ? "THE NIGHT" : e(m.sender)}</small><p>${e(m.text)}</p></div>`,
      )
      .join("") ||
    '<p class="radio-empty">Press to talk. Your friend is listening.</p>'
  }</div><div class="quick-messages"><span class="small">QUICK TRANSMISSIONS</span>${quickMessages(
    s,
  )
    .map((text) => button(e(text), `data-radio="${e(text)}"`))
    .join(
      "",
    )}</div><form id="radio-form"><label for="radio-text" class="small">SEND A SHORT MESSAGE</label><div class="radio-input"><input id="radio-text" maxlength="180" placeholder="Over to you…" autocomplete="off">${button("Send", 'type="submit"')}</div></form><div class="hint-row">${button("Need a nudge?", 'id="hint"')}${s.hint ? `<p>${e(s.hint)}</p>` : ""}</div></div></aside></main>`;
}
function soloScreen(s: Snapshot) {
  return `<header><a class="wordmark" href="/">MAPLE STREET <span>SOLO EXPLORATION</span></a><div class="header-tools">${button("Back to title", 'id="solo-exit" data-testid="solo-exit"', "quiet")}</div></header><main class="solo-screen"><div class="chapter"><span>Explore freely</span><span>${s.you.role === "alex" ? "CORNER HOUSE / ALEX" : "BLUE HOUSE / SAM"}</span></div><div class="scene house-scene solo-scene" id="scene">${worldFailed ? '<p class="solo-unavailable">3D rendering is unavailable in this browser. Try a browser with WebGL enabled.</p>' : '<div id="house-world" data-dom-preserve="true"></div>'}<p class="scene-objective">${e(s.objective)}</p></div><div class="solo-details"><p>WASD / arrows to walk · Drag to look · E to pick up the nearby flashlight · Escape to release controls.</p>${button("Try the other house", 'id="solo-switch" data-testid="solo-switch"')}<p class="small">This prototype currently contains one bedroom per house. More rooms follow in the next scene pass. The cooperative story is available from Start a Night.</p></div></main>`;
}

function render() {
  app.dataset.phase = solo ? "solo" : (state?.phase ?? "title");
  app.dataset.role = solo?.you.role ?? state?.you.role ?? "";
  const active = document.activeElement as HTMLElement | null;
  const focusKey = active?.id
    ? `#${CSS.escape(active.id)}`
    : active?.dataset.testid
      ? `[data-testid="${CSS.escape(active.dataset.testid)}"]`
      : active?.dataset.radio
        ? `[data-radio="${CSS.escape(active.dataset.radio)}"]`
        : null;
  const savedInput =
    active instanceof HTMLInputElement
      ? {
          text: active.value,
          start: active.selectionStart,
          end: active.selectionEnd,
        }
      : null;
  patchDom(
    app,
    `${solo ? soloScreen(solo) : state ? (state.phase === "lobby" ? lobby(state) : game(state)) : title()}${error ? `<div class="toast" role="alert">${e(error)}${button("Dismiss", 'id="dismiss"', "quiet")}${!state ? button("Start fresh", 'id="fresh"', "quiet") + button("Retry connection", 'id="retry"', "quiet") : ""}</div>` : ""}<footer>LAST NIGHT ON MAPLE STREET <span>A PLAYABLE GRAYBOX / ORIGINAL TEMPORARY ART</span></footer>`,
  );
  const worldHost = document.querySelector<HTMLElement>("#house-world");
  if (!worldHost && houseWorld) {
    houseWorld.dispose();
    houseWorld = null;
  }
  const worldState = solo ?? state;
  if (worldHost && worldState) {
    try {
      if (!houseWorld)
        houseWorld = new HouseWorld(
          worldHost,
          worldState,
          (pose) => {
            if (solo) solo.poses = { alex: pose, sam: pose };
            else if (socketJoined) socket.emit("pose", pose);
          },
          (id) => {
            if (solo) {
              solo.inventory = [id];
              solo.objective =
                "Flashlight collected. Explore freely, or try the other house.";
              render();
            } else action({ type: "interact", target: id });
          },
          (x, y) => {
            if (!solo) aim(x, y);
          },
        );
      houseWorld.update({
        ...worldState,
        paused: solo ? false : worldState.paused || !socketJoined,
      });
    } catch (failure) {
      console.warn("3D unavailable; using illustrated scene", failure);
      houseWorld?.dispose();
      houseWorld = null;
      worldFailed = true;
      render();
      return;
    }
  }
  bind();
  const draftInput = document.querySelector<HTMLInputElement>("#radio-text");
  if (draftInput && draftInput !== active && draftInput.value !== radioDraft)
    draftInput.value = radioDraft;
  const restored = focusKey
    ? document.querySelector<HTMLElement>(focusKey)
    : null;
  if (restored && restored !== active) {
    restored.focus({ preventScroll: true });
    if (savedInput && restored instanceof HTMLInputElement) {
      if (restored.id !== "radio-text") restored.value = savedInput.text;
      restored.setSelectionRange(savedInput.start, savedInput.end);
    }
  }
  const messages = document.querySelector(".messages");
  if (messages) messages.scrollTop = messages.scrollHeight;
  paintLights();
}
let eventsBound = false;
let composing = false;
function bind() {
  if (eventsBound) return;
  eventsBound = true;
  app.addEventListener("compositionstart", () => {
    composing = true;
  });
  app.addEventListener("compositionend", () => {
    composing = false;
    radioDraft =
      document.querySelector<HTMLInputElement>("#radio-text")?.value ??
      radioDraft;
  });
  app.addEventListener("input", (ev) => {
    const input = ev.target;
    if (input instanceof HTMLInputElement && input.id === "radio-text")
      radioDraft = input.value;
  });
  app.addEventListener("click", (ev) => {
    const el = (ev.target as Element).closest<HTMLElement>(
      "button, a, #invite-link",
    );
    if (!el) return;
    if (el.id === "explore-solo" || el.id === "solo-switch") {
      houseWorld?.dispose();
      houseWorld = null;
      solo = soloHouse(
        el.id === "solo-switch" && solo?.you.role === "alex" ? "sam" : "alex",
      );
      error = "";
      history.replaceState(null, "", `?solo=${solo.you.role}`);
      render();
      return;
    }
    if (el.id === "solo-exit" || (solo && el.classList.contains("wordmark"))) {
      ev.preventDefault();
      houseWorld?.dispose();
      houseWorld = null;
      solo = null;
      history.replaceState(null, "", "/");
      seatReplaced = true;
      render();
      socket.connect();
      return;
    }
    if (state && el.id !== "mute") unlockAudio();
    if (el.id === "invite-link") {
      (el as HTMLInputElement).select();
      return;
    }
    if (el.classList.contains("wordmark")) {
      if (state) {
        ev.preventDefault();
        state.phase === "lobby" ? leaveLobby() : gameMenu();
      }
      return;
    }
    if (el.id === "game-menu") {
      gameMenu();
      return;
    }
    if (el.id === "leave-night") {
      leaveNight();
      return;
    }
    if (el.id === "resume-night") {
      const room = new URLSearchParams(location.search)
        .get("room")
        ?.toUpperCase();
      const seat = recentSeat(room);
      if (seat) {
        rememberSeat(seat);
        enter("join", seat.name, seat.code, seat.token);
      }
      return;
    }
    if (el.id === "leave-lobby") {
      leaveLobby();
      return;
    }
    if (el.id === "fresh") {
      forgetSeat(saved()?.code);
      seatReplaced = false;
      if (!socket.connected) socket.connect();
      error = "";
      render();
      return;
    }
    if (el.id === "retry") {
      const seat = saved();
      if (seat) enter("join", seat.name, seat.code, seat.token);
      return;
    }
    if (el.id === "mute") {
      muted = !muted;
      localStorage.setItem("maple-muted", String(muted));
      unlockAudio();
      render();
      return;
    }
    if (el.id === "dismiss") {
      error = "";
      render();
      return;
    }
    if (el.id === "ready") {
      unlockAudio();
      action({ type: "ready" });
      return;
    }
    if (el.id === "copy") {
      void copyRoomInvite();
      return;
    }
    if (el.dataset.claim) {
      action({ type: "claim", role: el.dataset.claim as Role });
      return;
    }
    if (el.dataset.aim) {
      const target = state?.targets.find((t) => t.id === el.dataset.aim);
      if (target) aim(target.x, target.y, true);
      return;
    }
    if (el.dataset.target) {
      action({ type: "interact", target: el.dataset.target });
      return;
    }
    if (el.dataset.choice) {
      action({ type: "choice", value: el.dataset.choice });
      return;
    }
    if (el.dataset.radio) {
      if (joined()) emit("radio", { text: el.dataset.radio });
      return;
    }
    if (el.id === "radio-toggle") {
      radioOpen = !radioOpen;
      render();
      return;
    }
    if (el.id === "hint") {
      if (joined()) emit("hint", {});
      return;
    }
    if (el.id === "signal-toggle") {
      action({ type: "signal", value: !state!.signals[state!.you.role!] });
      return;
    }
    if (el.hasAttribute("data-replay")) {
      action({ type: "replay" });
      return;
    }
    if (el.hasAttribute("data-lobby")) action({ type: "lobby" });
  });
  app.addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (composing) return;
    const form = ev.target as HTMLFormElement;
    const name = (
      document.querySelector<HTMLInputElement>("#create-name")?.value ||
      "Friend"
    ).trim();
    if (form.id === "create-form") {
      enter("create", name);
      return;
    }
    if (form.id === "join-form") {
      enter(
        "join",
        name,
        document
          .querySelector<HTMLInputElement>("#join-code")!
          .value.trim()
          .toUpperCase(),
      );
      return;
    }
    if (form.id !== "radio-form") return;
    const input = document.querySelector<HTMLInputElement>("#radio-text")!;
    const submitted = input.value;
    if (!submitted.trim() || radioPending || !joined()) return;
    radioPending = true;
    emit(
      "radio",
      { text: submitted.trim() },
      () => {
        if (radioDraft === submitted) {
          radioDraft = "";
          const live = document.querySelector<HTMLInputElement>("#radio-text");
          if (live) live.value = "";
        }
      },
      () => {
        radioPending = false;
      },
    );
  });
  app.addEventListener("pointerdown", (ev) => {
    const hold = (ev.target as Element).closest<HTMLElement>("#signal-hold");
    if (!hold) return;
    holding = true;
    hold.setPointerCapture(ev.pointerId);
    action({ type: "signal", value: true });
  });
  app.addEventListener("keydown", (ev) => {
    if (
      !(ev.target as Element).closest("#signal-hold") ||
      ![" ", "Enter"].includes(ev.key)
    )
      return;
    ev.preventDefault();
    if (!ev.repeat) {
      holding = true;
      action({ type: "signal", value: true });
    }
  });
  app.addEventListener("keyup", (ev) => {
    if (
      (ev.target as Element).closest("#signal-hold") &&
      [" ", "Enter"].includes(ev.key)
    )
      ev.preventDefault();
  });
  app.addEventListener("pointermove", (ev) => {
    const target = ev.target as Element;
    const scene = target.closest<HTMLElement>("#scene");
    if (
      !scene ||
      !!target.closest("#house-world") ||
      target.closest("button") ||
      (ev.pointerType === "touch" && !ev.buttons)
    )
      return;
    const rect = scene.getBoundingClientRect();
    aim(
      (ev.clientX - rect.left) / rect.width,
      (ev.clientY - rect.top) / rect.height,
    );
  });
}
function joined() {
  if (socket.connected && socketJoined) return true;
  error = "Your radio is reconnecting. Your draft and progress are saved.";
  render();
  return false;
}
async function copyRoomInvite() {
  if (invitePending) return;
  const input = document.querySelector<HTMLInputElement>("#invite-link")!;
  const room = state?.code;
  invitePending = true;
  const button = document.querySelector<HTMLButtonElement>("#copy");
  if (button) {
    button.textContent = "Copying…";
    button.disabled = true;
  }
  const copied = await copyInvite(input);
  if (state?.code !== room || state?.phase !== "lobby") return;
  invitePending = false;
  inviteCopied = copied;
  inviteStatus = copied
    ? "Copy requested. If pasting does not work in this browser, press Ctrl+C, Cmd+C, or use your phone’s Copy menu. The link is selected."
    : "Clipboard access is blocked here. The link is selected; copy it with Ctrl+C, Cmd+C, or your phone’s Copy menu.";
  render();
  const selected = document.querySelector<HTMLInputElement>("#invite-link");
  selected?.focus();
  selected?.select();
}
eventsBound = false;
bind();
render();

function shelfLabel(t: {
  id: string;
  label: string;
  x: number;
  y: number;
}): string {
  if (
    state?.phase === "shelf" &&
    state.you.role === "sam" &&
    (!targetBeam.on ||
      Math.hypot(targetBeam.x - t.x, targetBeam.y - t.y) > 0.13)
  )
    return `Shelf ${Number(t.id.split("-")[1]) + 1} · needs your friend’s light`;
  return t.label;
}
function releaseHold() {
  if (holding) {
    holding = false;
    if (state?.phase === "goodbye") action({ type: "signal", value: false });
  }
}
document.addEventListener("pointerup", releaseHold);
document.addEventListener("pointercancel", releaseHold);
document.addEventListener("keyup", (ev) => {
  if (ev.key === " " || ev.key === "Enter") releaseHold();
});
