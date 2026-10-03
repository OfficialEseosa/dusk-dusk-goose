import type { Snapshot, Phase } from "../shared/protocol";
export interface SceneAsset {
  background: string | null;
  foreground: string | null;
}
/** Add exported layered artwork URLs here; interaction coordinates stay unchanged. */
export const ASSETS: Record<
  "bedroom" | "garage" | "street" | "tower",
  SceneAsset
> = {
  bedroom: { background: null, foreground: null },
  garage: { background: null, foreground: null },
  street: { background: null, foreground: null },
  tower: { background: null, foreground: null },
};
export const TITLES: Record<Phase, string> = {
  lobby: "Two windows. One last summer.",
  opening: "August 30, 2002",
  flashlights: "01 / Lights out",
  shelf: "01 / A light across the street",
  key: "01 / Return the favor",
  passage: "02 / The side passage",
  latch: "02 / Meet me outside",
  disclosure: "02 / The things we carry",
  route: "02 / The old way home",
  marker: "02 / Beneath the tower",
  capsule: "03 / Our summer, buried",
  keepsakes: "03 / Things worth keeping",
  goodbye: "03 / Until next summer",
  ending: "Some things travel with you.",
};
export function quickMessages(s: Snapshot): string[] {
  const common = ["I’m here.", "Give me a moment."];
  const byPhase: Partial<Record<Phase, string[]>> = {
    flashlights: ["I found my flashlight.", "Look near your bed."],
    shelf: [
      "Light shelf 1.",
      "Light shelf 2.",
      "Light shelf 3.",
      "Hold your light there.",
    ],
    key: ["Light the side passage.", "I’m getting the key."],
    passage: [
      "Light safe point 1.",
      "Light safe point 2.",
      "Light safe point 3.",
      "Hold your light there.",
    ],
    latch: ["I’m at the gate.", "Shine on the latch."],
    route: [
      "Next shape: triangle.",
      "Next shape: circle.",
      "Next shape: star.",
      "Hold your light there.",
    ],
    marker: ["Light the capsule marker."],
    capsule: [
      "Light Alex’s signal point.",
      "Light Sam’s signal point.",
      "Your turn.",
    ],
    goodbye: ["Ready when you are.", "Hold your signal with mine."],
  };
  return [...(byPhase[s.phase] ?? ["Let’s get our capsule."]), ...common];
}
export function actorCanInteract(s: Snapshot): boolean {
  if (s.phase === "shelf" || s.phase === "latch" || s.phase === "route")
    return s.you.role === "sam";
  if (s.phase === "key" || s.phase === "passage" || s.phase === "marker")
    return s.you.role === "alex";
  return ["flashlights", "capsule"].includes(s.phase);
}
