import type { SelfModelSnapshot } from "./types.js";

export function buildTwinPromptSummary(params: {
  snapshot: SelfModelSnapshot;
  mode: string;
}): string {
  const { snapshot } = params;
  const values = snapshot.values.slice(0, 4).join(", ") || "still learning";
  const redLines = snapshot.redLines.slice(0, 4).join(", ") || "none learned yet";
  return [
    "Shisanxiang twin summary:",
    `- Mode: ${params.mode}`,
    `- Values: ${values}`,
    `- Reply style: direct=${pct(snapshot.replyStyle.directness)}, warm=${pct(
      snapshot.replyStyle.warmth,
    )}, brief=${pct(snapshot.replyStyle.brevity)}, humor=${pct(snapshot.replyStyle.humor)}`,
    `- Decision style: risk=${pct(snapshot.decisionStyle.risk)}, speed=${pct(
      snapshot.decisionStyle.speed,
    )}, evidence=${pct(snapshot.decisionStyle.evidence)}, assertiveness=${pct(
      snapshot.decisionStyle.assertiveness,
    )}`,
    `- Social style: openness=${pct(snapshot.socialStyle.openness)}, conflict=${pct(
      snapshot.socialStyle.conflictHandling,
    )}, follow-up=${pct(snapshot.socialStyle.followUpTendency)}`,
    `- Work style: planning=${pct(snapshot.workStyle.planning)}, ambition=${pct(
      snapshot.workStyle.ambition,
    )}, energy=${pct(snapshot.workStyle.energyConservation)}`,
    `- Red lines: ${redLines}`,
    "- Default to the user's current self. Only use ideal-self behavior when the user explicitly asks for it.",
    "- Treat this as a probabilistic user model, not ground truth. High-risk actions still require explicit confirmation.",
  ].join("\n");
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}
