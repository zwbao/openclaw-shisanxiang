import type {
  SelfModelSnapshot,
  SelfModelTarget,
  ShisanxiangPersona,
  StoredObservation,
} from "./types.js";
import { SHISANXIANG_PERSONAS } from "./types.js";
import { average, clamp01, roundTo, uniqueNonEmpty } from "./utils.js";

type MutableSnapshot = SelfModelSnapshot;

const DEFAULT_TRAIT = 0.5;

const TRAIT_PATHS = {
  "replyStyle.directness": ["replyStyle", "directness"],
  "replyStyle.warmth": ["replyStyle", "warmth"],
  "replyStyle.brevity": ["replyStyle", "brevity"],
  "replyStyle.humor": ["replyStyle", "humor"],
  "decisionStyle.risk": ["decisionStyle", "risk"],
  "decisionStyle.speed": ["decisionStyle", "speed"],
  "decisionStyle.evidence": ["decisionStyle", "evidence"],
  "decisionStyle.assertiveness": ["decisionStyle", "assertiveness"],
  "socialStyle.openness": ["socialStyle", "openness"],
  "socialStyle.conflictHandling": ["socialStyle", "conflictHandling"],
  "socialStyle.followUpTendency": ["socialStyle", "followUpTendency"],
  "workStyle.planning": ["workStyle", "planning"],
  "workStyle.ambition": ["workStyle", "ambition"],
  "workStyle.energyConservation": ["workStyle", "energyConservation"],
} as const satisfies Record<string, readonly [string, string]>;

export function createEmptySnapshot(mode: SelfModelTarget): SelfModelSnapshot {
  const snapshot: SelfModelSnapshot = {
    version: 1,
    mode,
    generatedAt: Date.now(),
    observationCount: 0,
    values: [],
    replyStyle: {
      directness: DEFAULT_TRAIT,
      warmth: DEFAULT_TRAIT,
      brevity: DEFAULT_TRAIT,
      humor: DEFAULT_TRAIT,
    },
    decisionStyle: {
      risk: DEFAULT_TRAIT,
      speed: DEFAULT_TRAIT,
      evidence: DEFAULT_TRAIT,
      assertiveness: DEFAULT_TRAIT,
    },
    socialStyle: {
      openness: DEFAULT_TRAIT,
      conflictHandling: DEFAULT_TRAIT,
      followUpTendency: DEFAULT_TRAIT,
    },
    workStyle: {
      planning: DEFAULT_TRAIT,
      ambition: DEFAULT_TRAIT,
      energyConservation: DEFAULT_TRAIT,
    },
    redLines: [],
    confidenceByField: {},
    evidenceRefs: {},
    personaWeights: Object.fromEntries(
      SHISANXIANG_PERSONAS.map((persona) => [persona, roundTo(1 / SHISANXIANG_PERSONAS.length)]),
    ) as Record<ShisanxiangPersona, number>,
  };
  snapshot.personaWeights = derivePersonaWeights(snapshot);
  return snapshot;
}

export function buildSnapshotFromObservations(
  mode: SelfModelTarget,
  observations: StoredObservation[],
): SelfModelSnapshot {
  const snapshot = createEmptySnapshot(mode);
  const traitEvidence: Record<string, number[]> = {};
  const valueSignals: string[] = [];
  const redLines: string[] = [];

  for (const observation of observations) {
    const evidenceKey = observation.field ?? observation.kind;
    pushEvidence(snapshot, evidenceKey, observation.id);
    traitEvidence[evidenceKey] ??= [];
    traitEvidence[evidenceKey].push(observation.confidence);

    if (observation.kind === "trait_delta" && observation.field) {
      applyTraitDelta(snapshot, observation.field, Number(observation.value), observation.confidence);
      continue;
    }
    if (observation.kind === "value_signal") {
      valueSignals.push(String(observation.value ?? ""));
      continue;
    }
    if (observation.kind === "red_line") {
      redLines.push(String(observation.value ?? ""));
      continue;
    }
  }

  snapshot.generatedAt = Date.now();
  snapshot.observationCount = observations.length;
  snapshot.values = uniqueNonEmpty(valueSignals, 12);
  snapshot.redLines = uniqueNonEmpty(redLines, 12);

  for (const [field, evidence] of Object.entries(traitEvidence)) {
    snapshot.confidenceByField[field] = roundTo(clamp01(0.2 + average(evidence) * 0.8));
  }

  snapshot.personaWeights = derivePersonaWeights(snapshot);
  return snapshot;
}

export function derivePersonaWeights(snapshot: SelfModelSnapshot): Record<ShisanxiangPersona, number> {
  const averageConfidence = average(Object.values(snapshot.confidenceByField));
  const shadowConflict = average([
    Math.abs(snapshot.workStyle.ambition - snapshot.workStyle.energyConservation),
    Math.abs(snapshot.decisionStyle.risk - 0.5) * 2,
    1 - averageConfidence,
  ]);

  const raw: Record<ShisanxiangPersona, number> = {
    rational: average([
      snapshot.decisionStyle.evidence,
      snapshot.workStyle.planning,
      snapshot.replyStyle.directness,
    ]),
    ambitious: average([snapshot.workStyle.ambition, snapshot.decisionStyle.assertiveness]),
    energy_saving: average([
      snapshot.workStyle.energyConservation,
      snapshot.replyStyle.brevity,
    ]),
    emotional: average([snapshot.replyStyle.warmth, snapshot.replyStyle.humor]),
    risk_averse: 1 - snapshot.decisionStyle.risk,
    risk_seeking: snapshot.decisionStyle.risk,
    social: average([
      snapshot.socialStyle.openness,
      snapshot.socialStyle.followUpTendency,
      snapshot.replyStyle.warmth,
    ]),
    solitary: 1 - snapshot.socialStyle.openness,
    creative: average([snapshot.replyStyle.humor, snapshot.workStyle.ambition]),
    skeptical: average([snapshot.decisionStyle.evidence, 1 - snapshot.replyStyle.warmth * 0.35]),
    dutiful: average([
      snapshot.workStyle.planning,
      snapshot.socialStyle.followUpTendency,
      snapshot.decisionStyle.assertiveness,
    ]),
    status_seeking: average([snapshot.workStyle.ambition, snapshot.socialStyle.openness]),
    shadow: shadowConflict,
  };

  const total = Object.values(raw).reduce((sum, value) => sum + Math.max(value, 0.001), 0);
  return Object.fromEntries(
    SHISANXIANG_PERSONAS.map((persona) => [persona, roundTo(Math.max(raw[persona], 0.001) / total)]),
  ) as Record<ShisanxiangPersona, number>;
}

export function blendSnapshots(params: {
  current: SelfModelSnapshot;
  ideal: SelfModelSnapshot;
  mode: "mirror" | "current" | "ideal" | "hybrid";
  aspirationalWeight: number;
}): SelfModelSnapshot {
  if (params.mode === "current" || params.mode === "mirror") {
    return params.current;
  }
  if (params.mode === "ideal") {
    return params.ideal;
  }
  const weight = clamp01(params.aspirationalWeight);
  const current = params.current;
  const ideal = params.ideal;
  const blended = createEmptySnapshot("current");
  blended.generatedAt = Date.now();
  blended.observationCount = Math.max(current.observationCount, ideal.observationCount);
  blended.values = uniqueNonEmpty([...current.values, ...ideal.values], 12);
  blended.redLines = uniqueNonEmpty([...current.redLines, ...ideal.redLines], 12);
  for (const key of Object.keys(TRAIT_PATHS)) {
    const currentValue = getTraitValue(current, key);
    const idealValue = getTraitValue(ideal, key);
    setTraitValue(blended, key, currentValue * (1 - weight) + idealValue * weight);
    blended.confidenceByField[key] = roundTo(
      Math.max(current.confidenceByField[key] ?? 0, ideal.confidenceByField[key] ?? 0),
    );
    blended.evidenceRefs[key] = uniqueNonEmpty(
      [...(current.evidenceRefs[key] ?? []), ...(ideal.evidenceRefs[key] ?? [])],
      6,
    );
  }
  blended.personaWeights = derivePersonaWeights(blended);
  return blended;
}

export function describeCurrentVsIdealDelta(
  current: SelfModelSnapshot,
  ideal: SelfModelSnapshot,
): string[] {
  const deltas = Object.keys(TRAIT_PATHS)
    .map((field) => ({
      field,
      delta: roundTo(getTraitValue(ideal, field) - getTraitValue(current, field)),
    }))
    .filter((entry) => Math.abs(entry.delta) >= 0.12)
    .toSorted((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 4);

  return deltas.map((entry) =>
    `${entry.field}: ideal is ${entry.delta > 0 ? "higher" : "lower"} by ${Math.abs(
      entry.delta,
    ).toFixed(2)}`,
  );
}

function applyTraitDelta(
  snapshot: MutableSnapshot,
  field: string,
  rawDelta: number,
  confidence: number,
): void {
  if (!(field in TRAIT_PATHS)) {
    return;
  }
  const delta = Number.isFinite(rawDelta) ? rawDelta : 0;
  const weightedDelta = delta * clamp01(confidence);
  const currentValue = getTraitValue(snapshot, field);
  setTraitValue(snapshot, field, clamp01(currentValue + weightedDelta));
}

function getTraitValue(snapshot: SelfModelSnapshot, field: string): number {
  const path = TRAIT_PATHS[field as keyof typeof TRAIT_PATHS];
  if (!path) {
    return DEFAULT_TRAIT;
  }
  const block = snapshot[path[0] as keyof SelfModelSnapshot] as Record<string, number>;
  return Number(block[path[1]] ?? DEFAULT_TRAIT);
}

function setTraitValue(snapshot: SelfModelSnapshot, field: string, value: number): void {
  const path = TRAIT_PATHS[field as keyof typeof TRAIT_PATHS];
  if (!path) {
    return;
  }
  const block = snapshot[path[0] as keyof SelfModelSnapshot] as Record<string, number>;
  block[path[1]] = roundTo(clamp01(value));
}

function pushEvidence(snapshot: SelfModelSnapshot, field: string, observationId: number): void {
  snapshot.evidenceRefs[field] ??= [];
  const token = `obs:${observationId}`;
  if (!snapshot.evidenceRefs[field].includes(token)) {
    snapshot.evidenceRefs[field].push(token);
  }
}
