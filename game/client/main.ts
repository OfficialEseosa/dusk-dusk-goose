import "@fontsource/fraunces/latin-600.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-600.css";
import "./style.css";
import {Street} from './street';
import {RoundControls} from './round-controls';
import {RadioControls} from './radio-controls';
import {NightSound} from './audio';
import type {RoomSnapshot,RadioMessage} from '../shared/protocol';

type Seat = { room: string; playerId: string; token: string; bootId: string };
type Room = RoomSnapshot;
type Offer = { playerId: string; name: string; token: string };
type Result = {
  ok: boolean;
  seat?: Seat;
  room?: Room;
  offers?: Offer[];
  radio?: RadioMessage;
  error?: { code: string; message: string };
};
const app = document.querySelector<HTMLDivElement>("#app")!;
const sound=new NightSound();
let street:Street|null=null;
let roundControls:RoundControls|null=null;
let radioControls:RadioControls|null=null;
let sceneSeat='',rosterSignature='';
const key = "maple:seat:v1",
  ownedKey = "maple:owned:v1";
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const read = <T>(storage: Storage, k: string, fallback: T): T => {
  try {
    return JSON.parse(storage.getItem(k) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
};
let seat = read<Seat | null>(sessionStorage, key, null),
  room: Room | null = null,
  offers: Offer[] = [];
let name = localStorage.getItem("maple:name") ?? "",
  code = new URL(location.href).searchParams.get("room") ?? "";
let notice = "",
  connected = false,
  busy = false,
  copied = false,
  showLink = false,
  bootId = "",
  recovering = false;
let socket: WebSocket,
  retry = 0,
  timer: ReturnType<typeof setTimeout>;
const pending = new Map<
  string,
  {
    resolve: (r: Result) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
function owned(): Seat[] {
  return read<Seat[]>(localStorage, ownedKey, []).filter(
    (s) => s && typeof s.token === "string" && typeof s.room === "string",
  );
}
function availableOffers(list: Offer[] = []) {
  const recent = [...owned()].reverse();
  return recent
    .map((s) => list.find((o) => o.token === s.token))
    .filter((o): o is Offer => !!o)
    .slice(0, 1);
}
function save(s: Seat) {
  seat = s;
  sessionStorage.setItem(key, JSON.stringify(s));
  localStorage.setItem(
    ownedKey,
    JSON.stringify(
      [...owned().filter((x) => x.token !== s.token), s].slice(-36),
    ),
  );
}
function forget(removeOwned = false) {
  if (removeOwned && seat)
    localStorage.setItem(
      ownedKey,
      JSON.stringify(owned().filter((s) => s.token !== seat!.token)),
    );
  seat = null;
  sessionStorage.removeItem(key);
  room = null;
  offers = [];
}
function address(c: string) {
  const url = new URL(location.href);
  url.search = "";
  if (c) url.searchParams.set("room", c);
  history.replaceState(null, "", url);
}
function invite() {
  return `${location.origin}/?room=${room?.code ?? code}`;
}
function request(
  type: string,
  fields: Record<string, unknown> = {},
): Promise<Result> {
  return new Promise((resolve, reject) => {
    if (socket?.readyState !== WebSocket.OPEN)
      return reject(
        new Error("Connecting to the street. Try again in a moment."),
      );
    const id = crypto.randomUUID();
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error("No reply yet. Please try again."));
    }, 8000);
    pending.set(id, { resolve, reject, timer: timeout });
    socket.send(JSON.stringify({ id, type, ...fields }));
  });
}
async function restore() {
  if (recovering) return;
  recovering = true;
  street?.setConnection(false);
  try {
    if (seat) {
      const candidate = seat;
      const result = await request("resume", {
        code: candidate.room,
        token: candidate.token,
        bootId: candidate.bootId,
      });
      if (seat?.token !== candidate.token) return;
      if (result.ok && result.seat) {
        save(result.seat);
        room = result.room!;
        const restored = room.players.find(player => player.id === result.seat!.playerId);
        if (restored) street?.restorePose(restored);
        code = room.code;
        address(code);
        notice = "";
      } else {
        notice = result.error?.message ?? "That night has ended.";
        forget(true);
        code = "";
        address("");
      }
    } else if (code) {
      const result = await request("recover", {
        code,
        tokens: owned()
          .filter((s) => s.room === code)
          .map((s) => s.token),
      });
      offers = availableOffers(result.offers);
    }
  } catch {
  } finally {
    recovering = false;
    render();
  }
}
function receiveRadio(message:RadioMessage){
  if(!room)return;room.radio=[...(room.radio??[]).filter(entry=>entry.id!==message.id),message].slice(-24);render();
}
function connect() {
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  )
    return;
  clearTimeout(timer);
  const current = new WebSocket(
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/live`,
  );
  socket = current;
  connected = false;
  render();
  current.onmessage = (e) => {
    if (socket !== current) return;
    const message = JSON.parse(e.data);
    if (message.type === "hello") {
      connected = true;
      bootId = message.bootId;
      retry = 0;
      render();
      void restore();
    } else if (message.type === "result") {
      const p = pending.get(message.id);
      if (p) {
        clearTimeout(p.timer);
        pending.delete(message.id);
        p.resolve(message);
      }
    } else if (message.type === "radio") {
      receiveRadio(message.message);
    } else if (message.type === "search_noise") {
      sound.searchNoise();
    } else if (message.type === "seat_replaced") {
      continuedElsewhere();
    } else if(message.type==='pose_rejected'){
      // Resume from the accepted pose when a report is rejected; do not keep sending an invalid position.
      street?.restorePose(message);
    } else if (message.type === "room") {
      room = message.room;
      render();
    } else if (message.type === "shutdown") {
      notice = "The street is reconnecting.";
      render();
    }
  };
  current.onclose = (event) => {
    if (socket !== current) return;
    if (event.code === 4001) continuedElsewhere();
    connected = false;
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(
        new Error(
          event.code === 4001
            ? "Your seat continued in another tab."
            : "Connection lost. Reconnecting.",
        ),
      );
    }
    pending.clear();
    render();
    timer = setTimeout(
      connect,
      Math.min(5000, 500 * 2 ** retry++) + Math.random() * 200,
    );
  };
  current.onerror = () => current.close();
}
function continuedElsewhere() {
  // Keep browser ownership for the new tab; clear only this tab's auto-resume.
  forget();
  code = "";
  address("");
  notice = "Your seat continued in another tab.";
  render();
}
async function action(type: string, fields: Record<string, unknown> = {}) {
  if (busy) return;
  busy = true;
  notice = "";
  render();
  try {
    const r = await request(type, fields);
    if (!r.ok) throw new Error(r.error?.message ?? "Please try again.");
    if (r.seat) {
      save(r.seat);
      room = r.room!;
      code = room.code;
      address(code);
      offers = [];
    } else if (r.room) room = r.room;
  } catch (e) {
    notice = (e as Error).message;
  } finally {
    busy = false;
    render();
  }
}
async function leave() {
  const old = seat;
  forget(true);
  code = "";
  address("");
  notice = "";
  copied = false;
  showLink = false;
  render();
  if (old && connected)
    await request("leave", { token: old.token }).catch(() => {});
}
async function copy() {
  const link = invite();
  try {
    await navigator.clipboard.writeText(link);
    copied = true;
    notice = "";
  } catch {
    showLink = true;
    notice = "Select and copy the invite link.";
  }
  render();
  if (showLink) {
    const input = app.querySelector<HTMLInputElement>("#invite");
    input?.focus();
    input?.select();
  }
}
const mark =
  '<svg class="street-mark" viewBox="0 0 120 80" aria-hidden="true"><path d="M20 65V33L48 12l28 21v32M76 65V42l17-13 17 13v23M35 65V44h23v21"/><path class="window" d="M42 28h12v10H42z"/></svg>';
function render() {
  if(room?.phase==='started'&&seat){renderStreet();return;}
  if(street){radioControls?.dispose();radioControls=null;roundControls?.dispose();roundControls=null;street.dispose();street=null;sceneSeat='';}
  sound.setRoom();
  const status = connected
    ? ""
    : `<div class="connection" role="status">Reconnecting to the street...</div>`;
  const message = notice
    ? `<p class="notice" role="status">${esc(notice)}</p>`
    : "";
  if (room && seat) {
    app.innerHTML = `<main class="screen room-screen"><header><button class="back" id="leave">← Back to title</button><span class="date">SUMMER 2002</span></header><section class="room-body"><div class="room-heading">${mark}<p class="eyebrow">LAST NIGHT ON MAPLE STREET</p><h1>${room.phase === "started" ? "The night is open." : "Bring your friends."}</h1><div class="invite"><div><span class="label">ROOM CODE</span><strong data-testid="room-code">${room.code}</strong></div><button id="copy">${copied ? "Link copied" : "Copy invite"}</button></div>${showLink ? `<input id="invite" aria-label="Invite link" readonly value="${esc(invite())}">` : ""}${message}</div><div class="room-panel"><ul aria-label="Players">${room.players.map((p) => `<li><span class="avatar" aria-hidden="true">${esc(p.name.slice(0, 1))}</span><span>${esc(p.name)}${p.id === seat!.playerId ? " <small>(you)</small>" : ""}</span><span class="presence">${p.connected ? "Here" : "Reconnecting"}</span></li>`).join("")}</ul>${room.hostId === seat.playerId ? `<button class="primary" id="start" ${!connected || busy || room.phase === "started" ? "disabled" : ""}>${room.phase === "started" ? "Night started" : "Start the night"}</button>` : `<p class="host-note">${room.phase === "started" ? "Night started" : `${esc(room.players.find((p) => p.id === room!.hostId)?.name ?? "Your friend")} can start the night.`}</p>`}</div></section>${status}</main>`;
    app.querySelector("#leave")?.addEventListener("click", () => void leave());
    app.querySelector("#copy")?.addEventListener("click", () => void copy());
    app
      .querySelector("#start")
      ?.addEventListener("click", () => void action("start"));
    return;
  }
  app.innerHTML = `<main class="screen title-screen"><section class="title-copy">${mark}<p class="eyebrow">THE LAST NIGHT OF SUMMER</p><h1>Last Night<br><span>on Maple Street</span></h1><p class="date">2002</p></section><section class="menu ${offers.length || seat ? "compact" : ""}" aria-label="Join the night"><label for="name">Your name</label><input id="name" autocomplete="nickname" maxlength="24" value="${esc(name)}" placeholder="Name"><button class="primary" id="create" ${!connected || busy ? "disabled" : ""}>Create a night</button><div class="divider"><span>or</span></div><label for="code">Room code</label><div class="join-row"><input id="code" autocapitalize="characters" autocomplete="off" maxlength="5" value="${esc(code)}" placeholder="ABCDE"><button id="join" ${!connected || busy ? "disabled" : ""}>Join</button></div>${offers.map((o) => `<button class="recover" data-token="${esc(o.token)}">Return as ${esc(o.name)}</button>`).join("")}${seat ? '<button id="fresh" class="back">Join as another player</button>' : ""}${message}</section>${status}</main>`;
  app
    .querySelector<HTMLInputElement>("#name")!
    .addEventListener("input", (e) => {
      name = (e.target as HTMLInputElement).value;
      localStorage.setItem("maple:name", name);
    });
  app
    .querySelector<HTMLInputElement>("#code")!
    .addEventListener("input", (e) => {
      code = (e.target as HTMLInputElement).value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      (e.target as HTMLInputElement).value = code;
    });
  const join = async () => {
    if (!name.trim()) {
      notice = "Enter your name to join the night.";
      render();
      return;
    }
    const credentials = owned().filter((s) => s.room === code);
    if (credentials.length && !offers.length) {
      try {
        const result = await request("recover", {
          code,
          tokens: credentials.map((s) => s.token),
        });
        offers = availableOffers(result.offers);
        if (offers.length) {
          render();
          return;
        }
      } catch {
        notice = "Connecting to the street. Try again in a moment.";
        render();
        return;
      }
    }
    void action("join", { name: name.trim(), code: code.trim() });
  };
  app.querySelector("#create")!.addEventListener("click", () => {
    if (!name.trim()) {
      notice = "Enter your name to start a night.";
      render();
      return;
    }
    void action("create", { name: name.trim() });
  });
  app.querySelector("#join")!.addEventListener("click", join);
  app.querySelector("#code")!.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") join();
  });
  app.querySelectorAll<HTMLButtonElement>("[data-token]").forEach((b) =>
    b.addEventListener(
      "click",
      () =>
        void action("resume", {
          code,
          token: b.dataset.token,
          bootId:
            owned().find((s) => s.token === b.dataset.token)?.bootId ?? bootId,
        }),
    ),
  );
  app.querySelector("#fresh")?.addEventListener("click", () => {
    forget();
    notice = "";
    render();
  });
}
function renderStreet(){
  if(!room||!seat)return;
  if(!street||sceneSeat!==seat.playerId){
    radioControls?.dispose();roundControls?.dispose();street?.dispose();sceneSeat=seat.playerId;rosterSignature='';
    app.innerHTML=`<main class="game-screen"><div id="street-view"></div><header class="game-hud"><button id="leave" class="back">← Back to title</button><span id="street-code">${room.code}</span><button id="mute">${sound.muted?'Sound off':'Sound on'}</button></header><ul id="street-players" class="sr-only" aria-label="Players"></ul><p id="street-status" role="status"></p><div id="street-loading">Opening Maple Street...</div></main>`;
    app.querySelector('#leave')!.addEventListener('click',()=>void leave());
    app.querySelector('#mute')!.addEventListener('click',()=>{sound.toggle();app.querySelector('#mute')!.textContent=sound.muted?'Sound off':'Sound on';});
    street=new Street(app.querySelector<HTMLElement>('#street-view')!,pose=>{
      if(connected&&socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({id:`move-${pose.seq}`,type:'move',...pose}));
    },(moving,place)=>sound.setMovement(moving,place));
    const controlsPlayerId=seat.playerId,controlsRoomCode=room.code;
    roundControls=new RoundControls(app.querySelector<HTMLElement>('.game-screen')!,street,seat.playerId,async(type,fields={})=>{
      try {const r=await request(type,{roundNumber:room?.round?.number,...fields});if(seat?.playerId!==controlsPlayerId||room?.code!==controlsRoomCode)return r;if(r.ok&&r.room){notice="";room=r.room;render();}else if(!r.ok&&r.error?.code!=="stale_round"){notice=r.error?.message??"Try again.";render();}return r;}
      catch {return {ok:false};}
    },()=>void leave());
    radioControls=new RadioControls(app.querySelector<HTMLElement>('.game-screen')!,seat.playerId,async(type,fields)=>{
      try{const result=await request(type,fields);if(seat?.playerId===controlsPlayerId&&room?.code===controlsRoomCode&&result.ok&&result.radio)receiveRadio(result.radio);return result;}catch{return {ok:false,error:{message:'Radio is reconnecting. Try again shortly.'}};}
    });
    const current=street;
    void current.initialize(seat.playerId,room).then(()=>{if(street===current)app.querySelector('#street-loading')?.remove();}).catch(()=>{if(street===current){const loading=app.querySelector('#street-loading')!;loading.innerHTML='<p>The street could not load.</p><button id="retry-scene">Try again</button>';loading.querySelector('#retry-scene')?.addEventListener('click',()=>location.reload());}});
  }
  street.update(room);roundControls?.update(room);street.setConnection(connected&&!recovering);radioControls?.update(room);sound.setRoom(room,seat.playerId);
  const status=app.querySelector('#street-status')!;
  const next=connected?notice:'Reconnecting to the street...';if(status.textContent!==next)status.textContent=next;
  const roster=room.roster??room.players;
  const signature=roster.map(p=>`${p.id}:${p.name}:${p.connected}`).join('|');
  if(signature!==rosterSignature){rosterSignature=signature;app.querySelector('#street-players')!.innerHTML=roster.map(p=>`<li>${esc(p.name)}${p.id===seat!.playerId?' (you)':''} <span>${p.connected?'Here':'Reconnecting'}</span></li>`).join('');}
}
window.addEventListener("online", () => {
  if (!connected) connect();
});
window.addEventListener("pagehide", () => socket?.close());
window.addEventListener("pageshow", (event) => {
  if (event.persisted) connect();
});
render();
connect();
