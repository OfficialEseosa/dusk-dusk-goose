import type { Snapshot } from "../shared/protocol";
import { ASSETS } from "./content";
export const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const trees = `<g fill="#101f29"><path d="M0 0H85L42 92 97 89 32 154 91 149 0 210ZM1000 0H915L958 92 903 89 968 154 909 149 1000 210Z"/><path d="M0 348q75-125 150 0v192H0Zm1000 0q-75-125-150 0v192h150Z"/></g>`;
const sky = `<rect width="1000" height="560" fill="url(#sky)"/><g fill="#c6d4d6" opacity=".7"><circle cx="143" cy="83" r="1.5"/><circle cx="302" cy="39" r="1"/><circle cx="625" cy="71" r="1.5"/><circle cx="836" cy="112" r="1"/><circle cx="708" cy="31" r="1"/></g><circle cx="808" cy="66" r="30" fill="#d9e5db"/><circle cx="794" cy="57" r="28" fill="#1d3646"/>`;
function house(x: number, color: string): string {
  return `<g transform="translate(${x},150)"><path d="M0 116 153 8 305 116Z" fill="#172332" stroke="#4b6069" stroke-width="3"/><path d="M22 116h266v197H22Z" fill="${color}"/><path d="M22 145h266M22 176h266M22 208h266M22 240h266M22 274h266" stroke="#94a7a3" opacity=".1"/><path d="M106 215h65v98h-65Z" fill="#162730"/><rect x="49" y="151" width="65" height="65" fill="#192c38" stroke="#8ba6a4" stroke-width="4"/><path d="M81 151v65m-32-32h65" stroke="#78908e"/><rect x="189" y="151" width="65" height="65" fill="#273f4e" stroke="#8ba6a4" stroke-width="4"/><path d="M221 151v65m-32-32h65" stroke="#78908e"/><path d="M7 316h299" stroke="#56666a" stroke-width="8"/><circle cx="82" cy="185" r="6" fill="#e6b96f"/><path d="M77 193h10l7 21H70Z" fill="#ccb9a0"/></g>`;
}
function bedroom(s: Snapshot): string {
  return `${sky}<path d="M0 0h1000v560H0Z M558 72v258h275V72Z" fill="#172731" fill-rule="evenodd"/><path d="M0 460 558 330h275l167 130v100H0Z" fill="#243333"/><path d="M558 72h275v258H558Z" fill="none" stroke="#678184" stroke-width="12"/><path d="M695 72v258M558 201h275" stroke="#658080" stroke-width="8"/><svg x="558" y="72" width="275" height="258" viewBox="558 72 275 258">${house(570, "#294c62")}</svg><path d="M546 54v289h32V54ZM812 54v289h38V54Z" fill="#394c51"/><path d="M30 345 272 303l144 99-5 124H31Z" fill="#33484b"/><path d="M29 337 273 298l132 88-244 42Z" fill="#687677"/><path d="M61 332 147 319l58 35-89 17Z" fill="#aab0a0"/><path d="M67 380 291 337l93 57-223 34Z" fill="#4a6665"/><path d="M361 435h129v85H361Z" fill="#415254"/><path d="M354 432h142" stroke="#71807b" stroke-width="7"/><path d="M417 419v-49m-30 5h59l-11-47h-34Z" stroke="#7b8375" fill="${s.phase === "opening" ? "#e3c18b" : "#65756e"}" stroke-width="4"/><rect x="382" y="406" width="17" height="27" rx="3" fill="#172831" stroke="#8e9a7d"/><circle cx="390" cy="412" r="3" fill="#d4b573"/><path d="M86 201h192v75H86Z" fill="#526967"/><text x="109" y="232" fill="#bbc0a5" font-family="monospace" font-size="17">SUMMER / 2002</text><path d="M111 252h139" stroke="#adbda9"/><g fill="#84755d"><path d="M868 362h90v77h-90Z"/><path d="M852 442h127v86H852Z"/></g><path d="M914 362v77m-25 3v86" stroke="#c8ad7d" stroke-width="8"/>`;
}
function street(s: Snapshot): string {
  return `${sky}<path d="M0 360q300-80 550 2t450-5v203H0Z" fill="#263d40"/>${house(135, "#4a5b50")}${house(570, "#315267")}<path d="M0 490 1000 458v102H0Z" fill="#152831"/><path d="M10 533 980 505" stroke="#78857c" stroke-width="3" stroke-dasharray="45 42" opacity=".5"/><path d="M389 352 476 352 580 494 401 502Z" fill="#172c31"/><g stroke="#6d7d73" stroke-width="4" fill="#3b4f49"><path d="M424 370h44l12 20h-51Z"/><path d="M435 407h56l16 24h-65Z"/><path d="M447 451h72l17 25h-75Z"/></g><path d="M725 390h130v72H725Z" fill="#273f43" stroke="#889481" stroke-width="4"/><path d="M758 390v72m33-72v72m32-72v72" stroke="#809184"/><g transform="translate(650 475)"><circle cy="-32" r="10" fill="#141f27"/><path d="M-7-21h16l13 39h-40Z" fill="#182630"/><path d="M11-12h28v28H11Z" fill="#7d745e"/></g><g transform="translate(602 366)"><rect width="112" height="92" fill="#25383b" stroke="#7a8c84"/><path d="M0 31h112M0 62h112" stroke="#8d9a85" stroke-width="4"/><g fill="#87886a"><rect x="12" y="8" width="33" height="20"/><rect x="62" y="39" width="31" height="20"/><rect x="20" y="71" width="40" height="17"/></g></g>${trees}`;
}
function tower(s: Snapshot): string {
  return `${sky}<path d="M0 393q290-80 540-8t460 7v168H0Z" fill="#294346"/><g stroke="#5b7c83" stroke-width="9" fill="none"><path d="M399 236 334 473m267-237 64 237M398 239l268 234m-64-234L335 473M353 407h296M371 340h260"/></g><path d="M374 87q126-52 252 0v146q-126 50-252 0Z" fill="#385867" stroke="#779297" stroke-width="4"/><ellipse cx="500" cy="87" rx="126" ry="33" fill="#466b77"/><text x="500" y="168" text-anchor="middle" font-size="24" letter-spacing="5" fill="#9bb1ad" font-family="serif">MAPLE</text><path d="M389 107v125m-13-75h248" stroke="#193c4c" opacity=".5"/><path d="M0 443h1000" stroke="#6c8178" stroke-width="5"/><path d="M110 420v87m180-87v83m415-83v83m180-83v87" stroke="#7c9286" stroke-width="7"/><path d="M423 487q76-41 154 0l-4 31H425Z" fill="#775f43" stroke="#bd9c6c" stroke-width="3"/><rect x="474" y="474" width="56" height="25" rx="5" fill="#858879"/><path d="M502 474v25" stroke="#d6bf87" stroke-width="3"/><g transform="translate(${s.you.role === "alex" ? 700 : 270},460)"><circle cy="-35" r="11" fill="#b5b498"/><path d="M-9-23h18l12 43h-42Z" fill="#708e8a"/><path d="M-9 17-3 45m12-28 3 28" stroke="#172831" stroke-width="8"/></g><g transform="translate(821,393)"><path d="M-56 0-30-33h88L88 0v37H-56Z" fill="#496263"/><circle cx="-27" cy="37" r="16" fill="#14262d"/><circle cx="59" cy="37" r="16" fill="#14262d"/><rect x="-16" y="-25" width="31" height="23" fill="#91a4a0"/></g>${trees}`;
}
function garage(): string {
  return `<rect width="1000" height="560" fill="#182e38"/><path d="M0 458 100 410h800l100 48v102H0Z" fill="#283d40"/><rect x="100" y="35" width="800" height="380" fill="#263e44" stroke="#6d8986" stroke-width="10"/><path d="M145 55v350m710-350v350M100 120h800" stroke="#536f6c" stroke-width="8"/><rect x="382" y="44" width="236" height="78" fill="#102735" stroke="#88a39b" stroke-width="6"/><circle cx="500" cy="72" r="11" fill="#a9b7a0"/><path d="M492 84h16l10 24h-36Z" fill="#879d94"/><path d="M247 190h506v165H247" fill="#23383b" stroke="#8a9d89" stroke-width="7"/><path d="M247 284h506M247 350h506" stroke="#9aa38c" stroke-width="9"/><g fill="#7b7c63" stroke="#b2ab86" stroke-width="2"><rect x="274" y="301" width="95" height="43"/><rect x="416" y="310" width="135" height="34"/><rect x="624" y="295" width="94" height="49"/></g><path d="M319 301v43m166-34v34m186-49v49" stroke="#b6a67c" stroke-width="8"/><path d="M170 419h126v98H170Z" fill="#586459"/><path d="M170 450h126m-63-31v98" stroke="#91a28a" stroke-width="4"/><path d="M803 413v102m-20-79h40m-40 17h40m-40 17h40" stroke="#9bab93" stroke-width="5"/><path d="M65 503h93m580-19h63" stroke="#63827c" stroke-width="3"/>`;
}
export function renderScene(s: Snapshot | null): string {
  const room = s && ["opening", "flashlights"].includes(s.phase);
  const inGarage = s?.phase === "shelf" && s.you.role === "sam";
  const finale =
    s &&
    ["route", "marker", "capsule", "keepsakes", "goodbye", "ending"].includes(
      s.phase,
    );
  const sceneKey = room
    ? "bedroom"
    : inGarage
      ? "garage"
      : finale
        ? "tower"
        : "street";
  const asset = ASSETS[sceneKey];
  const background = room
    ? bedroom(s!)
    : inGarage
      ? garage()
      : finale
        ? tower(s!)
        : s
          ? street(s)
          : `${sky}${house(135, "#4a5b50")}${house(570, "#315267")}<path d="M0 490h1000v70H0Z" fill="#152831"/>${trees}`;
  return `<svg class="world" data-art="${sceneKey}" viewBox="0 0 1000 560" preserveAspectRatio="none" role="img" aria-label="${room ? "Your moonlit bedroom" : inGarage ? "Sam’s garage, with storage shelves and Alex at the distant window" : finale ? "The old Maple Street water tower" : "Two houses across a quiet Maple Street"}"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#152535"/><stop offset="1" stop-color="#3c616b"/></linearGradient><radialGradient id="beamGrad"><stop stop-color="#ffe2a1" stop-opacity=".65"/><stop offset=".65" stop-color="#edd294" stop-opacity=".25"/><stop offset="1" stop-color="#ffe2a1" stop-opacity="0"/></radialGradient><radialGradient id="localGrad"><stop stop-color="#cde6de" stop-opacity=".28"/><stop offset="1" stop-color="#cee4d9" stop-opacity="0"/></radialGradient></defs><g id="background" transform="${s?.you.role === "sam" && !inGarage ? "translate(-70,0) scale(1.07,1)" : ""}">${background}</g>${asset.background ? `<image href="${escapeHtml(asset.background)}" width="1000" height="560" preserveAspectRatio="none"/>` : ""}${s ? props(s) : ""}${s?.phase === "keepsakes" ? keepsakes() : ""}${s && ["goodbye", "ending"].includes(s.phase) ? restoredLights(s) : ""}<g id="lighting" pointer-events="none"><ellipse id="partner-light" cx="500" cy="300" rx="145" ry="112" fill="url(#beamGrad)"/><ellipse id="local-light" cx="500" cy="300" rx="105" ry="90" fill="url(#localGrad)"/></g>${asset.foreground ? `<image href="${escapeHtml(asset.foreground)}" width="1000" height="560" preserveAspectRatio="none" pointer-events="none"/>` : ""}<g opacity=".12" stroke="#bdd0ba" stroke-width="2"><path d="M36 535l8-18 8 18m862 0 8-18 8 18m-210 0 8-18 8 18"/></g></svg>`;
}

/** Interactive props are separate from background artwork and use shared target geometry. */
function props(s: Snapshot): string {
  return `<g id="interactive-props">${s.targets
    .map((t, i) => {
      let prop = "";
      if (s.phase === "flashlights")
        prop =
          '<path d="M-25-9h40v18h-40Z" fill="#a8b99c" stroke="#e2d6a8" stroke-width="2"/><path d="M15-13h10v26H15Z" fill="#c5bf8c"/>';
      else if (s.phase === "shelf")
        prop =
          s.you.role === "sam"
            ? `<path d="M-72-26h144v52H-72Z" fill="#324c4e" stroke="#94a38d" stroke-width="3"/><path d="M-67 21H67" stroke="#b4b08c" stroke-width="5"/><rect x="-30" y="-10" width="60" height="29" rx="4" fill="#667775"/>`
            : `<rect x="-48" y="-34" width="96" height="68" fill="#223a45" stroke="#95a99b" stroke-width="4"/><path d="M0-34v68m-48-2h96" stroke="#95a99b" stroke-width="3"/>`;
      else if (s.phase === "key")
        prop =
          '<path d="M-13-4a12 12 0 1 0 0 1m12-1h33m-9 0v12m-11-12v9" fill="none" stroke="#e8c98c" stroke-width="5"/>';
      else if (s.phase === "passage")
        prop = `<path d="M-53-10 38-20 56 15-43 25Z" fill="#5d776d" stroke="#abb59b" stroke-width="3"/><text y="3" text-anchor="middle" fill="#e2d6a8" font-size="19">${i + 1}</text>`;
      else if (s.phase === "latch")
        prop =
          '<path d="M-47-35h94v80h-94Z" fill="#4d6a5c" stroke="#a1b298" stroke-width="4"/><path d="M-23-35v80m46-80v80" stroke="#899d88" stroke-width="5"/><path d="M-15 4h30" stroke="#e5c887" stroke-width="8"/>';
      else if (s.phase === "route") {
        const shape = t.label.split(" ")[0];
        prop = `<path d="M-33-28h66v58h-66Z" fill="#3b575a" stroke="#849e91" stroke-width="3"/>${s.you.role === "sam" ? `<text y="13" text-anchor="middle" fill="#e7d3a2" font-size="36">${shape === "triangle" ? "△" : shape === "circle" ? "○" : "☆"}</text>` : `<text y="8" text-anchor="middle" fill="#b8c4b0" font-size="20">${i + 1}</text>`}`;
      } else if (s.phase === "marker")
        prop =
          '<path d="M0-29 27 0 0 29-27 0Z" fill="#58716b" stroke="#b5b49a" stroke-width="3"/>';
      else if (s.phase === "capsule")
        prop =
          '<circle r="29" fill="#4b6560" stroke="#c4b384" stroke-width="3"/><path d="M-13 0h26m-13-13v26" stroke="#e5cea0" stroke-width="3"/>';
      return `<g transform="translate(${t.x * 1000},${t.y * 560})">${prop}</g>`;
    })
    .join("")}</g>`;
}

function keepsakes(): string {
  return `<g id="keepsake-cards" transform="translate(235,255)"><g transform="rotate(-6,80,80)"><rect width="155" height="160" rx="4" fill="#d6d2b7"/><rect x="12" y="12" width="131" height="108" fill="#516f71"/><path d="M14 95 55 44 100 78 141 50v68H14Z" fill="#94a091"/><circle cx="50" cy="69" r="12" fill="#d4c9a4"/><circle cx="93" cy="67" r="12" fill="#c2b98f"/><text x="78" y="143" text-anchor="middle" font-size="13" fill="#45544e">SUMMER ’02</text></g><g transform="translate(190,0) rotate(3,80,80)"><rect width="155" height="160" rx="4" fill="#d4c899"/><path d="M25 30 63 75 37 113 115 83 133 129" fill="none" stroke="#5d7c78" stroke-width="4" stroke-dasharray="7 4"/><path d="M20 18 42 18 31 38Z" fill="none" stroke="#627875" stroke-width="3"/><text x="78" y="145" text-anchor="middle" font-size="13" fill="#45544e">OUR SECRET MAP</text></g><g transform="translate(380,0) rotate(-2,80,80)"><rect width="155" height="160" rx="4" fill="#c6c6a9"/><circle cx="77" cy="66" r="38" fill="#6b8b81" stroke="#45675d" stroke-width="4"/><path d="M77 36 88 58 111 62 94 80 98 103 77 92 55 103 60 80 43 62 67 58Z" fill="#d7c691"/><text x="78" y="145" text-anchor="middle" font-size="13" fill="#45544e">SAME SIGNAL</text></g></g>`;
}

function restoredLights(s: Snapshot): string {
  return `<g class="restored-lights" aria-label="Neighborhood porch lights returning">${[65, 135, 205, 780, 855, 925].map((x, i) => `<rect x="${x}" y="355" width="22" height="14" rx="2" fill="#ebc788" style="animation-delay:${i * 0.15 - (s.serverTime - s.phaseStartedAt) / 1000}s"/>`).join("")}</g>`;
}
