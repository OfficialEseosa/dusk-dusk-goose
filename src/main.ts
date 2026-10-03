import { io } from "socket.io-client";
import type { Action, Beam, Reply, Role, Snapshot } from "../shared/protocol";
import { TITLES, quickMessages, actorCanInteract } from "./content";
import { escapeHtml as e, renderScene } from "./scene";
import { copyInvite } from "./clipboard";
import {
  readSeat,
  rememberSeat,
  recentSeat,
  clearTabSeat,
  forgetSeat,
} from "./seat";
import "./style.css";
const app = document.querySelector<HTMLDivElement>("#app")!;
const socket = io({ autoConnect: true });
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
function enter(
  event: "create" | "join",
  name: string,
  code?: string,
  token?: string,
) {
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
  if (seat) enter("join", seat.name, seat.code, seat.token);
  render();
  socket.emit("visibility", { visible: !document.hidden });
});
socket.on("disconnect", (reason) => {
  socketJoined = false;
  render();
  if (reason === "io server disconnect" && !saved()) socket.connect();
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
socket.on("beam", (packet: { role: Role; beam: Beam }) => {
  if (packet.role !== state?.you.role) targetBeam = packet.beam;
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
  const resume = recentSeat();
  const room = new URLSearchParams(location.search).get("room") ?? "";
  return `${header()}<main class="title-screen"><div class="title-world">${renderScene(null)}<div class="title-gradient"></div></div><section class="title-copy"><p class="eyebrow">A TWO-PLAYER SUMMER-NIGHT STORY</p><h1>Last Night on<br><em>Maple Street</em></h1><p class="premise">The lights go out. Your friend is across the street.<br>One time capsule. One last night before everything changes.</p><div class="entry">${resume ? button(`Resume night ${e(resume.code)}`, 'id="resume-night" data-testid="resume-night"', "full") : ""}<form id="create-form"><label for="create-name">What should your friend call you?</label><input id="create-name" name="name" maxlength="24" placeholder="Your name (optional)" autocomplete="nickname">${button("Start a Night <span>↗</span>", 'type="submit" data-testid="create"', "primary")}</form><form id="join-form"><label for="join-code">Already have a room?</label><div class="join-row"><input id="join-code" name="code" aria-label="Room code" maxlength="8" value="${e(room)}" placeholder="ROOM CODE" autocomplete="off" required>${button("Join a Night", 'type="submit" data-testid="join"')}</div></form></div><p class="small">Two people · Separate screens · About 10–12 minutes<br>No accounts. Use the radio, or talk together.</p></section></main>`;
}
function lobby(s: Snapshot) {
  const waiting = s.players.find((p) => !p.connected || !p.visible);
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
    )}</div>${button(s.you.ready ? (bothReady && waiting ? "Both ready — waiting for both screens" : "Ready — waiting for your friend") : "Ready for the Night", 'id="ready" data-testid="ready" ' + (!s.you.role || s.you.ready ? "disabled" : ""), "primary full")}<p class="${presenceNote ? "lobby-presence" : "small"}" data-testid="lobby-status" role="status">${presenceNote ? e(presenceNote) : s.players.length < 2 ? "Share the invitation with your friend." : "Your night begins when both friends are ready."}</p></section></main>`;
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
function game(s: Snapshot) {
  const canInteract = actorCanInteract(s);
  const partner = s.players.find((p) => p.id !== s.you.id);
  return `${header()}<main class="game-screen"><section class="scene-column"><div class="chapter"><span>${e(TITLES[s.phase])}</span><span>${s.you.role === "alex" ? "CORNER HOUSE / ALEX" : "BLUE HOUSE / SAM"}</span></div><div class="scene" id="scene">${renderScene(s)}<div class="scene-vignette"></div>${sceneHotspots(s, canInteract)}${s.phase === "opening" ? '<div class="date-card"><p>AUGUST 30, 2002</p><h2>11:52 PM.</h2><span>Maple Street. The last night of summer.</span></div>' : ""}${s.paused || !socketJoined ? `<div class="pause-overlay"><h2>We’ll wait for each other.</h2><p>${!socketJoined ? "Your radio is reconnecting. Wait here; your progress is safe." : partner && !partner.connected ? `${e(partner.name)} is disconnected. They can reopen the invite link to rejoin. You can also return to the game menu.` : "A game tab is hidden. Keep both game windows visible, or return on both devices."}</p><small>Your discoveries and choices are safe.</small></div>` : ""}${s.phase === "ending" ? `<div class="ending-card"><p class="eyebrow">THE LIGHTS CAME BACK. WE KEPT OUR PROMISE.</p><h2>Some things<br>travel with you.</h2><p>${s.disclosed ? "We said the difficult thing. Then we finished our summer together." : "We found the words under the water tower. It was never too late."}</p><span class="keepsake-symbol">${s.keepsake.toLowerCase().includes("map") ? "⌘" : s.keepsake.toLowerCase().includes("token") ? "◇" : "▧"}</span><p class="small">Recovered: ${e(s.keepsake || "our summer keepsake")}</p>${button("Swap Roles and Play Again", 'data-replay data-testid="replay"', "primary")}${button("Return to Lobby", 'data-lobby data-testid="lobby"')}<small>${s.replayVotes.length || s.lobbyVotes.length ? "Waiting for your friend’s matching vote." : "Both friends choose together."}</small></div>` : ""}</div><div class="scene-caption"><span>◌ ${hasFlashlight() ? "Your light follows your pointer. Amber light belongs to your friend." : "Moonlight is enough to find your way."}</span><span>${s.inventory.length ? e(s.inventory.join(" · ").replaceAll("-", " ")) : "Walkie-talkie / Channel 04"}</span></div><section class="objective"><p class="eyebrow">${s.phase === "ending" ? "ONE LAST SUMMER" : "YOUR NEXT MOMENT"}</p><h2>${e(s.objective)}</h2>${s.phase === "ending" ? `<p class="recovered-note">Recovered keepsake: ${e(s.keepsake)}</p>` : ""}${s.privateText ? `<p class="private-note">${e(s.privateText)}</p>` : ""}<div class="actions">${choices(s)}${s.phase === "goodbye" ? `${button(s.signals[s.you.role!] ? "Signal is held — tap to release" : "Hold your light with your friend", 'id="signal-toggle" data-testid="signal-toggle"', "primary")}${button("Press and hold signal", 'id="signal-hold"')}<span class="signal-status">${partner?.role && s.signals[partner.role] ? "Your friend is holding their signal." : "Waiting for your friend’s light…"}</span>` : ""}</div>${s.targets.length && s.phase !== "opening" ? `<div class="target-controls"><p class="small">${canInteract ? "Aim and interact are separate. Your friend may need to light the object first." : "Your friend needs your light. Select an aim point, then hold it steady."}</p><div class="anchor-list">${s.targets.map((t) => `<div class="anchor">${button(`◎ ${e(shelfLabel(t))}`, `data-aim="${e(t.id)}" data-testid="aim-${e(t.id)}" ${s.phase === "shelf" && s.you.role === "sam" ? `data-shelf-label="${e(t.id)}"` : ""}`, "aim")}${canInteract ? button("Interact", `data-target="${e(t.id)}" data-testid="target-${e(t.id)}"`, "interact") : ""}</div>`).join("")}</div></div>` : ""}</section></section><aside class="radio-panel ${radioOpen ? "" : "collapsed"}"><div class="radio-heading"><div><span class="radio-led"></span><strong>Walkie-talkie</strong><small>CHANNEL 04 · ${partner?.connected ? "FRIEND ONLINE" : "AWAITING FRIEND"}</small></div>${button(radioOpen ? "−" : "+", 'id="radio-toggle" aria-label="Toggle radio"', "quiet")}</div><div class="radio-content"><div class="messages" aria-live="polite">${
    s.messages
      .slice(-12)
      .map(
        (m) =>
          `<div class="message ${m.kind}"><small>${m.kind === "story" ? "STORY TRANSMISSION" : m.kind === "system" ? "THE NIGHT" : e(m.sender)}</small><p>${e(m.text)}</p></div>`,
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
function render() {
  app.dataset.phase = state?.phase ?? "title";
  app.dataset.role = state?.you.role ?? "";
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
  app.innerHTML = `${state ? (state.phase === "lobby" ? lobby(state) : game(state)) : title()}${error ? `<div class="toast" role="alert">${e(error)}${button("Dismiss", 'id="dismiss"', "quiet")}${!state ? button("Start fresh", 'id="fresh"', "quiet") + button("Retry connection", 'id="retry"', "quiet") : ""}</div>` : ""}<footer>LAST NIGHT ON MAPLE STREET <span>A PLAYABLE GRAYBOX / ORIGINAL TEMPORARY ART</span></footer>`;
  bind();
  const draftInput = document.querySelector<HTMLInputElement>("#radio-text");
  if (draftInput) draftInput.value = radioDraft;
  const restored = focusKey
    ? document.querySelector<HTMLElement>(focusKey)
    : null;
  if (restored) {
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
function bind() {
  document.querySelector("#game-menu")?.addEventListener("click", gameMenu);
  document.querySelector("#resume-night")?.addEventListener("click", () => {
    const seat = recentSeat();
    if (seat) {
      // Explicit resume must retain its credential through a rejected/slow join.
      rememberSeat(seat);
      enter("join", seat.name, seat.code, seat.token);
    }
  });
  document.querySelector("#leave-lobby")?.addEventListener("click", leaveLobby);
  document.querySelector(".wordmark")?.addEventListener("click", (ev) => {
    if (state?.phase === "lobby") {
      ev.preventDefault();
      leaveLobby();
    } else if (state) {
      ev.preventDefault();
      gameMenu();
    }
  });
  document.querySelector("#fresh")?.addEventListener("click", () => {
    forgetSeat(saved()?.code);
    recoveryAttempts = 0;
    if (!socket.connected) socket.connect();
    error = "";
    render();
  });
  document.querySelector("#retry")?.addEventListener("click", () => {
    const seat = saved();
    if (seat) enter("join", seat.name, seat.code, seat.token);
  });
  document.querySelector("#mute")?.addEventListener("click", () => {
    muted = !muted;
    localStorage.setItem("maple-muted", String(muted));
    unlockAudio();
    render();
  });
  document.querySelector("#dismiss")?.addEventListener("click", () => {
    error = "";
    render();
  });
  document.querySelector("#create-form")?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    enter(
      "create",
      (
        document.querySelector<HTMLInputElement>("#create-name")?.value ||
        "Friend"
      ).trim(),
    );
  });
  document.querySelector("#join-form")?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    enter(
      "join",
      (
        document.querySelector<HTMLInputElement>("#create-name")?.value ||
        "Friend"
      ).trim(),
      document
        .querySelector<HTMLInputElement>("#join-code")!
        .value.trim()
        .toUpperCase(),
    );
  });
  document
    .querySelectorAll<HTMLElement>("[data-claim]")
    .forEach(
      (el) =>
        (el.onclick = () =>
          action({ type: "claim", role: el.dataset.claim as Role })),
    );
  document.querySelector("#ready")?.addEventListener("click", () => {
    unlockAudio();
    action({ type: "ready" });
  });
  document.querySelector("#copy")?.addEventListener("click", async () => {
    if (invitePending) return;
    const input = document.querySelector<HTMLInputElement>("#invite-link")!;
    const room = state?.code;
    invitePending = true;
    const copyButton = document.querySelector<HTMLButtonElement>("#copy");
    if (copyButton) {
      copyButton.textContent = "Copying…";
      copyButton.disabled = true;
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
  });
  document
    .querySelector<HTMLInputElement>("#invite-link")
    ?.addEventListener("click", (ev) =>
      (ev.currentTarget as HTMLInputElement).select(),
    );
  document.querySelectorAll<HTMLElement>("[data-aim]").forEach(
    (el) =>
      (el.onclick = () => {
        const t = state?.targets.find((t) => t.id === el.dataset.aim);
        if (t) aim(t.x, t.y, true);
      }),
  );
  document
    .querySelectorAll<HTMLElement>("[data-target]")
    .forEach(
      (el) =>
        (el.onclick = () =>
          action({ type: "interact", target: el.dataset.target })),
    );
  document
    .querySelectorAll<HTMLElement>("[data-choice]")
    .forEach(
      (el) =>
        (el.onclick = () =>
          action({ type: "choice", value: el.dataset.choice })),
    );
  document
    .querySelectorAll<HTMLElement>("[data-radio]")
    .forEach(
      (el) => (el.onclick = () => emit("radio", { text: el.dataset.radio })),
    );
  document
    .querySelector<HTMLInputElement>("#radio-text")
    ?.addEventListener("input", (ev) => {
      radioDraft = (ev.currentTarget as HTMLInputElement).value;
    });
  document.querySelector("#radio-form")?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const input = document.querySelector<HTMLInputElement>("#radio-text")!;
    const submitted = input.value;
    if (!submitted.trim() || radioPending) return;
    if (!socket.connected || !socketJoined) {
      error = "Your radio is reconnecting. Your draft is saved.";
      render();
      return;
    }
    radioPending = true;
    emit(
      "radio",
      { text: submitted.trim() },
      () => {
        if (radioDraft === submitted) {
          radioDraft = "";
          const liveInput =
            document.querySelector<HTMLInputElement>("#radio-text");
          if (liveInput) liveInput.value = "";
        }
      },
      () => {
        radioPending = false;
      },
    );
  });
  document.querySelector("#radio-toggle")?.addEventListener("click", () => {
    radioOpen = !radioOpen;
    render();
  });
  document
    .querySelector("#hint")
    ?.addEventListener("click", () => emit("hint", {}));
  document
    .querySelector("#signal-toggle")
    ?.addEventListener("click", () =>
      action({ type: "signal", value: !state!.signals[state!.you.role!] }),
    );
  const hold = document.querySelector<HTMLElement>("#signal-hold");
  hold?.addEventListener("pointerdown", (ev) => {
    holding = true;
    hold.setPointerCapture(ev.pointerId);
    action({ type: "signal", value: true });
  });
  hold?.addEventListener("pointerup", () =>
    action({ type: "signal", value: false }),
  );
  hold?.addEventListener("pointercancel", () =>
    action({ type: "signal", value: false }),
  );
  hold?.addEventListener("keydown", (ev) => {
    if ((ev.key === " " || ev.key === "Enter") && !ev.repeat) {
      ev.preventDefault();
      holding = true;
      action({ type: "signal", value: true });
    }
  });
  hold?.addEventListener("keyup", (ev) => {
    if (ev.key === " " || ev.key === "Enter") {
      ev.preventDefault();
      action({ type: "signal", value: false });
    }
  });
  document
    .querySelector("[data-replay]")
    ?.addEventListener("click", () => action({ type: "replay" }));
  document
    .querySelector("[data-lobby]")
    ?.addEventListener("click", () => action({ type: "lobby" }));
  document
    .querySelector<HTMLElement>("#scene")
    ?.addEventListener("pointermove", (ev) => {
      if (
        (ev.target as Element).closest("button") ||
        (ev.pointerType === "touch" && !ev.buttons)
      )
        return;
      const rect =
        ev.currentTarget instanceof Element
          ? ev.currentTarget.getBoundingClientRect()
          : null;
      if (rect)
        aim(
          (ev.clientX - rect.left) / rect.width,
          (ev.clientY - rect.top) / rect.height,
        );
    });
}
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
