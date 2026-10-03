import type { Phase } from "../shared/protocol.js";

/** Authored captions, kept outside the authoritative transition rules. */
export function phaseTransmission(
  phase: Phase,
  disclosed: boolean,
): string | undefined {
  const lines: Partial<Record<Phase, string>> = {
    opening:
      "August 30, 2002. 11:52 PM. Maple Street. The summer is almost over.",
    flashlights:
      "The whole block goes dark. Find your flashlight. Two flashes mean: I am here. We will use them again at the tower.",
    shelf:
      "Alex: Can you find the route card in your garage? I can light the shelves from here.",
    key: "Sam: Your gate key is by the side passage. Let me light it for you.",
    passage:
      "A figure carries a taped box toward the van. The path is dark; guide each other around the loose boards.",
    latch:
      "Alex has reached the corner. Now help Sam reach the back-door latch.",
    disclosure:
      "Sam passes the packed shelves. There is something Alex still does not know.",
    route:
      "The old route card leads to the water tower. Read the shapes together.",
    marker:
      "The final marker is below the tower fence. Exchange the light once more.",
    capsule: disclosed
      ? "The figure turns: it is Sam’s dad carrying a moving box. Alex recognizes what Sam already shared: this is their last night across the street. Two flashes mean I am here: Alex signals, then Sam, then Alex, then Sam."
      : "The figure turns: it is Sam’s dad carrying a moving box. “We leave in the morning.” Sam: I’m moving away, Alex. I wanted one last night here with you. Two flashes mean I am here: Alex signals, then Sam, then Alex, then Sam.",
    keepsakes: disclosed
      ? "Inside: a photograph, a hand-drawn map, and the friendship token. The words Sam said earlier settle between them. All those summers fit in one small tin."
      : "Inside: a photograph, a hand-drawn map, and the friendship token. Alex finally understands the packed shelves. There is still time to answer Sam. All those summers fit in one small tin.",
    goodbye:
      "Porch lights glow back to life down Maple Street. Hold your lights together for one last goodbye.",
    ending: "The capsule is safe. The street will remember you both.",
  };
  return lines[phase];
}
