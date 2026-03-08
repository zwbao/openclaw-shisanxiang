import type {
  FeedbackItemType,
  FeedbackOutcome,
  ObservationInput,
  SelfModelTarget,
} from "./types.js";
import { uniqueNonEmpty } from "./utils.js";

const POSITIVE_VALUE_PATTERNS = [
  /\b(i value|we value|important to me is)\s+([^.!?\n]+)/i,
  /\b(i prefer|we prefer|prefer)\s+([^.!?\n]+)/i,
  /(我看重|我更看重|我更倾向|我喜欢|我想要)\s*([^。！？\n]+)/,
] as const;

const NEGATIVE_VALUE_PATTERNS = [
  /\b(i don't want|i dislike|i hate|don't)\s+([^.!?\n]+)/i,
  /(不要|别|不想|不喜欢|讨厌)\s*([^。！？\n]+)/,
] as const;

const TRAIT_KEYWORDS = [
  { regex: /\b(brie[fv]|short|concise|简短|直接)\b/i, field: "replyStyle.brevity", delta: 0.08 },
  { regex: /\b(direct|straight|明确|直接)\b/i, field: "replyStyle.directness", delta: 0.08 },
  { regex: /\b(warm|friendly|polite|礼貌|客气|温和)\b/i, field: "replyStyle.warmth", delta: 0.08 },
  { regex: /\b(fun|funny|joke|幽默|轻松)\b/i, field: "replyStyle.humor", delta: 0.08 },
  { regex: /\b(careful|cautious|稳妥|谨慎|保守|风险)\b/i, field: "decisionStyle.risk", delta: -0.08 },
  { regex: /\b(bold|aggressive|冒险|试试|冲)\b/i, field: "decisionStyle.risk", delta: 0.08 },
  { regex: /\b(fast|quick|asap|尽快|马上)\b/i, field: "decisionStyle.speed", delta: 0.08 },
  { regex: /\b(data|evidence|proof|依据|证据|数据)\b/i, field: "decisionStyle.evidence", delta: 0.08 },
  { regex: /\b(decide|clear|拍板|明确)\b/i, field: "decisionStyle.assertiveness", delta: 0.06 },
  { regex: /\b(open|social|聊聊|沟通|社交)\b/i, field: "socialStyle.openness", delta: 0.08 },
  { regex: /\b(follow up|remind|跟进|提醒)\b/i, field: "socialStyle.followUpTendency", delta: 0.08 },
  { regex: /\b(plan|roadmap|步骤|计划)\b/i, field: "workStyle.planning", delta: 0.08 },
  { regex: /\b(growth|ambition|挑战|进取|更大)\b/i, field: "workStyle.ambition", delta: 0.08 },
  { regex: /\b(simple|lazy|省事|轻松|少折腾)\b/i, field: "workStyle.energyConservation", delta: 0.08 },
] as const;

export function extractPassiveObservations(params: {
  agentId: string;
  sessionKey?: string;
  text: string;
  source: string;
  targetModel?: SelfModelTarget;
}): ObservationInput[] {
  const text = params.text.trim();
  if (!text) {
    return [];
  }

  const observations: ObservationInput[] = [];
  const targetModel = params.targetModel ?? "current";

  for (const pattern of POSITIVE_VALUE_PATTERNS) {
    const match = pattern.exec(text);
    if (!match?.[2]) {
      continue;
    }
    observations.push({
      agentId: params.agentId,
      sessionKey: params.sessionKey,
      targetModel,
      source: params.source,
      kind: "value_signal",
      field: "values",
      value: normalizePreference(match[2]),
      evidence: text.slice(0, 200),
      confidence: 0.72,
      createdAt: Date.now(),
    });
  }

  for (const pattern of NEGATIVE_VALUE_PATTERNS) {
    const match = pattern.exec(text);
    if (!match?.[2]) {
      continue;
    }
    observations.push({
      agentId: params.agentId,
      sessionKey: params.sessionKey,
      targetModel,
      source: params.source,
      kind: "red_line",
      field: "redLines",
      value: normalizePreference(match[2]),
      evidence: text.slice(0, 200),
      confidence: 0.76,
      createdAt: Date.now(),
    });
  }

  for (const trait of TRAIT_KEYWORDS) {
    if (!trait.regex.test(text)) {
      continue;
    }
    observations.push({
      agentId: params.agentId,
      sessionKey: params.sessionKey,
      targetModel,
      source: params.source,
      kind: "trait_delta",
      field: trait.field,
      value: trait.delta,
      evidence: text.slice(0, 200),
      confidence: 0.58,
      createdAt: Date.now(),
    });
  }

  return dedupeObservations(observations);
}

export function extractFeedbackObservations(params: {
  agentId: string;
  sessionKey?: string;
  itemType: FeedbackItemType;
  outcome: FeedbackOutcome;
  userEdit?: string;
  targetModel: SelfModelTarget;
}): { observations: ObservationInput[]; learned: string[] } {
  const learned: string[] = [`feedback:${params.outcome}`];
  const observations: ObservationInput[] = [
    {
      agentId: params.agentId,
      sessionKey: params.sessionKey,
      targetModel: params.targetModel,
      source: "feedback",
      kind: "feedback",
      field: params.itemType,
      value: {
        itemType: params.itemType,
        outcome: params.outcome,
        userEdit: params.userEdit,
      },
      evidence: params.userEdit?.slice(0, 200),
      confidence: 0.9,
      createdAt: Date.now(),
    },
  ];

  if (params.userEdit?.trim()) {
    const editText = params.userEdit.trim();
    const editSignals = extractPassiveObservations({
      agentId: params.agentId,
      sessionKey: params.sessionKey,
      text: editText,
      source: "feedback:user_edit",
      targetModel: params.targetModel,
    });
    observations.push(...editSignals);
    if (editText.length <= 70) {
      observations.push({
        agentId: params.agentId,
        sessionKey: params.sessionKey,
        targetModel: params.targetModel,
        source: "feedback:user_edit",
        kind: "trait_delta",
        field: "replyStyle.brevity",
        value: 0.08,
        evidence: editText.slice(0, 200),
        confidence: 0.7,
        createdAt: Date.now(),
      });
      learned.push("replyStyle.brevity");
    }
    learned.push(...editSignals.map((signal) => signal.field ?? signal.kind));
  }

  if (params.outcome === "rejected") {
    observations.push({
      agentId: params.agentId,
      sessionKey: params.sessionKey,
      targetModel: params.targetModel,
      source: "feedback",
      kind: "trait_delta",
      field: "decisionStyle.evidence",
      value: 0.05,
      confidence: 0.55,
      evidence: "rejected => needs more evidence or confirmation",
      createdAt: Date.now(),
    });
    learned.push("decisionStyle.evidence");
  }

  return {
    observations: dedupeObservations(observations),
    learned: uniqueNonEmpty(learned, 8),
  };
}

function normalizePreference(raw: string): string {
  return raw.replace(/\s+/g, " ").replace(/[。.!?]+$/u, "").trim().slice(0, 80);
}

function dedupeObservations(observations: ObservationInput[]): ObservationInput[] {
  const seen = new Set<string>();
  const result: ObservationInput[] = [];
  for (const observation of observations) {
    const key = JSON.stringify([
      observation.kind,
      observation.field ?? "",
      observation.value ?? null,
      observation.targetModel,
      observation.source,
    ]);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(observation);
  }
  return result;
}
