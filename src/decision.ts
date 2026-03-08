import type {
  PersonaStance,
  RiskLevel,
  SelfModelSnapshot,
  ShisanxiangCouncilResult,
  ShisanxiangDecisionResult,
  ShisanxiangDraftReplyResult,
} from "./types.js";
import { SHISANXIANG_PERSONAS } from "./types.js";
import { average, buildSnapshotHeadline, clamp01, roundTo } from "./utils.js";

const HIGH_RISK_PATTERNS: Array<{ regex: RegExp; reason: string; level: RiskLevel }> = [
  {
    regex: /\b(pay|wire|transfer|invoice|refund|price|buy|sell|checkout|order)\b|付款|转账|下单|买入|卖出/u,
    reason: "money or purchase action",
    level: "critical",
  },
  {
    regex: /\b(contract|legal|lawyer|nda|terms)\b|法律|合同|协议/u,
    reason: "legal commitment",
    level: "critical",
  },
  {
    regex: /\b(quit|resign|job offer|career move)\b|离职|跳槽|换工作/u,
    reason: "career or job decision",
    level: "high",
  },
  {
    regex: /\b(account|password|permission|delete|publish)\b|账号|权限|删除|发布/u,
    reason: "account or irreversible action",
    level: "critical",
  },
  {
    regex: /\b(marry|wedding|sign up|subscribe|commitment)\b|承诺|订阅|结婚/u,
    reason: "long-term commitment",
    level: "high",
  },
];

const LOW_SIGNAL_REPLY_PATTERNS = [/^\s*(ok|okay|noted|收到|好哦|嗯嗯)\s*$/i, /^\s*thanks[.! ]*$/i];

type QuestionSignals = {
  risk: number;
  ambition: number;
  effort: number;
  social: number;
  creativity: number;
  duty: number;
};

export function classifyRisk(text: string): { level: RiskLevel; reasons: string[] } {
  const reasons = HIGH_RISK_PATTERNS.filter((entry) => entry.regex.test(text)).map(
    (entry) => entry.reason,
  );
  if (reasons.some((reason) => reason.includes("money") || reason.includes("legal"))) {
    return { level: "critical", reasons };
  }
  if (reasons.length > 0) {
    return { level: "high", reasons };
  }
  if (/\b(deadline|urgent|asap|马上|紧急)\b/i.test(text)) {
    return { level: "medium", reasons: ["urgency"] };
  }
  return { level: "low", reasons: [] };
}

export function buildDraftReply(params: {
  message: string;
  snapshot: SelfModelSnapshot;
  autoSendEnabled: boolean;
  autoSendConfidenceThreshold: number;
  recipient?: string;
  channel?: string;
}): ShisanxiangDraftReplyResult {
  const text = params.message.trim();
  const risk = classifyRisk(text);
  const shouldReply =
    text.length > 0 &&
    !LOW_SIGNAL_REPLY_PATTERNS.some((pattern) => pattern.test(text)) &&
    !/^\s*(thumbs up|👍|👌)\s*$/u.test(text);
  const toneNotes = describeTone(params.snapshot);
  const draft = composeReply(text, params.snapshot, risk.level, shouldReply);
  const confidence = calculateConfidence({
    snapshot: params.snapshot,
    riskLevel: risk.level,
    baseBoost: shouldReply ? 0.08 : -0.06,
  });

  return {
    shouldReply,
    draft,
    toneNotes,
    riskLevel: risk.level,
    confidence,
    autoSendEligible:
      shouldReply &&
      risk.level === "low" &&
      params.autoSendEnabled &&
      Boolean(params.recipient?.trim()) &&
      Boolean(params.channel?.trim()) &&
      confidence >= params.autoSendConfidenceThreshold,
  };
}

export function buildDecision(params: {
  question: string;
  options?: string[];
  snapshot: SelfModelSnapshot;
}): ShisanxiangDecisionResult {
  const council = buildCouncil({
    question: params.question,
    current: params.snapshot,
    ideal: params.snapshot,
  });
  const optionScores = params.options?.map((option) => ({
    option,
    score: scoreOption(option, params.snapshot),
  }));
  const recommendedOption = optionScores?.toSorted((a, b) => b.score - a.score)[0]?.option;

  return {
    recommendation: recommendedOption
      ? `Most aligned option: ${recommendedOption}`
      : council.finalRecommendation,
    recommendedOption,
    reasons: council.summary.split("; ").filter(Boolean),
    riskLevel: council.riskLevel,
    confidence: council.confidence,
    personaBreakdown: council.personaBreakdown,
    optionScores,
  };
}

export function buildCouncil(params: {
  question: string;
  current: SelfModelSnapshot;
  ideal: SelfModelSnapshot;
}): ShisanxiangCouncilResult {
  const risk = classifyRisk(params.question);
  const signals = detectQuestionSignals(params.question);
  const stances = SHISANXIANG_PERSONAS.map((persona) =>
    evaluatePersona({
      persona,
      question: params.question,
      signals,
      current: params.current,
      ideal: params.ideal,
    }),
  );
  const weightedScore = stances.reduce((sum, stance) => sum + stance.score * stance.weight, 0);
  const finalRecommendation =
    weightedScore >= 0.58
      ? "Lean toward doing it, but keep optionality."
      : weightedScore <= 0.42
        ? "Lean toward not doing it."
        : "Lean toward delaying and collecting more signal.";
  const disagreements = stances
    .filter((stance) => Math.abs(stance.score - weightedScore) >= 0.18)
    .toSorted((a, b) => Math.abs(b.score - weightedScore) - Math.abs(a.score - weightedScore))
    .slice(0, 4)
    .map((stance) => `${stance.persona}: ${stance.rationale}`);
  const confidence = calculateConfidence({
    snapshot: params.current,
    riskLevel: risk.level,
    baseBoost: 0,
  });

  return {
    summary: buildSummary(params.current, signals, risk.level),
    finalRecommendation,
    disagreements,
    personaBreakdown: stances,
    currentVsIdealDelta: buildDelta(params.current, params.ideal),
    riskLevel: risk.level,
    confidence,
  };
}

function composeReply(
  message: string,
  snapshot: SelfModelSnapshot,
  riskLevel: RiskLevel,
  shouldReply: boolean,
): string {
  if (!shouldReply) {
    return "No reply needed right now.";
  }
  if (riskLevel === "high" || riskLevel === "critical") {
    return snapshot.replyStyle.directness >= 0.55
      ? "收到。这件事风险较高，我需要先确认细节后再正式回复。"
      : "收到，这件事我想先把细节确认清楚，再给你一个正式、稳妥的回复。";
  }
  if (/\b(thanks|thank you)\b|谢谢/u.test(message)) {
    return snapshot.replyStyle.warmth >= 0.55 ? "不客气，收到。有需要继续发我。" : "不客气，收到。";
  }
  if (/\?|？|can you|could you|要不要|能不能/i.test(message)) {
    return snapshot.replyStyle.brevity >= 0.6
      ? "收到，我先看一下，稍后给你明确答复。"
      : "收到，我先看一下细节，整理清楚后尽快给你一个明确回复。";
  }
  if (snapshot.replyStyle.warmth >= 0.6) {
    return "收到，谢谢你发来这个。我先过一下内容，稍后给你回复。";
  }
  return "收到，我先处理一下，稍后回复。";
}

function describeTone(snapshot: SelfModelSnapshot): string[] {
  const notes: string[] = [];
  notes.push(snapshot.replyStyle.directness >= 0.55 ? "prefer direct phrasing" : "prefer measured phrasing");
  notes.push(snapshot.replyStyle.warmth >= 0.55 ? "keep warmth" : "keep some distance");
  notes.push(snapshot.replyStyle.brevity >= 0.55 ? "keep it concise" : "allow a bit more explanation");
  if (snapshot.replyStyle.humor >= 0.6) {
    notes.push("a light touch is acceptable");
  }
  return notes;
}

function calculateConfidence(params: {
  snapshot: SelfModelSnapshot;
  riskLevel: RiskLevel;
  baseBoost: number;
}): number {
  const averageConfidence = average(Object.values(params.snapshot.confidenceByField));
  const observationBoost = Math.min(0.2, params.snapshot.observationCount / 50);
  const riskPenalty =
    params.riskLevel === "critical"
      ? 0.35
      : params.riskLevel === "high"
        ? 0.22
        : params.riskLevel === "medium"
          ? 0.1
          : 0;
  return roundTo(clamp01(0.35 + averageConfidence * 0.45 + observationBoost + params.baseBoost - riskPenalty));
}

function detectQuestionSignals(text: string): QuestionSignals {
  const source = text.toLowerCase();
  return {
    risk: matchAny(source, ["risk", "risky", "uncertain", "冒险", "风险", "创业"]) ? 1 : 0.35,
    ambition: matchAny(source, ["growth", "promotion", "career", "ambition", "挑战", "更大"]) ? 1 : 0.4,
    effort: matchAny(source, ["hard", "effort", "busy", "复杂", "很多事", "麻烦"]) ? 1 : 0.45,
    social: matchAny(source, ["team", "people", "relationship", "社交", "沟通", "邀约"]) ? 1 : 0.35,
    creativity: matchAny(source, ["creative", "novel", "side project", "创意", "尝试"]) ? 1 : 0.35,
    duty: matchAny(source, ["responsibility", "promise", "deadline", "责任", "承诺", "交付"]) ? 1 : 0.45,
  };
}

function evaluatePersona(params: {
  persona: PersonaStance["persona"];
  question: string;
  signals: QuestionSignals;
  current: SelfModelSnapshot;
  ideal: SelfModelSnapshot;
}): PersonaStance {
  const { current, signals } = params;
  const baseWeight = current.personaWeights[params.persona];
  let score = 0.5;
  let rationale = "";

  switch (params.persona) {
    case "rational":
      score = average([current.decisionStyle.evidence, 1 - signals.risk * 0.5, current.workStyle.planning]);
      rationale = "wants evidence, reversibility, and structure";
      break;
    case "ambitious":
      score = average([current.workStyle.ambition, signals.ambition, current.decisionStyle.assertiveness]);
      rationale = "pulls toward upside and momentum";
      break;
    case "energy_saving":
      score = average([current.workStyle.energyConservation, 1 - signals.effort, current.replyStyle.brevity]);
      rationale = "avoids unnecessary complexity or energy drain";
      break;
    case "emotional":
      score = average([current.replyStyle.warmth, signals.social, current.replyStyle.humor]);
      rationale = "cares about immediate emotional comfort and relational tone";
      break;
    case "risk_averse":
      score = average([1 - current.decisionStyle.risk, 1 - signals.risk, current.decisionStyle.evidence]);
      rationale = "prefers downside protection";
      break;
    case "risk_seeking":
      score = average([current.decisionStyle.risk, signals.ambition, signals.creativity]);
      rationale = "leans into novelty and upside";
      break;
    case "social":
      score = average([current.socialStyle.openness, signals.social, current.replyStyle.warmth]);
      rationale = "optimizes for connection and social ease";
      break;
    case "solitary":
      score = average([1 - current.socialStyle.openness, 1 - signals.social, current.workStyle.energyConservation]);
      rationale = "protects autonomy and personal bandwidth";
      break;
    case "creative":
      score = average([current.replyStyle.humor, signals.creativity, current.workStyle.ambition]);
      rationale = "likes expressive or unconventional paths";
      break;
    case "skeptical":
      score = average([current.decisionStyle.evidence, 1 - signals.risk * 0.4, 1 - current.replyStyle.humor * 0.2]);
      rationale = "questions surface narratives and asks for proof";
      break;
    case "dutiful":
      score = average([current.workStyle.planning, signals.duty, current.socialStyle.followUpTendency]);
      rationale = "leans toward reliability and follow-through";
      break;
    case "status_seeking":
      score = average([current.workStyle.ambition, signals.social, signals.ambition]);
      rationale = "notices prestige, leverage, and how the move looks";
      break;
    case "shadow":
      score = average([
        Math.abs(current.workStyle.ambition - current.workStyle.energyConservation),
        signals.risk,
        1 - average(Object.values(current.confidenceByField)),
      ]);
      rationale = "surfaces hidden conflict and mixed motives";
      break;
  }

  const normalized = clamp01(score);
  return {
    persona: params.persona,
    weight: baseWeight,
    score: roundTo(normalized),
    stance: normalized >= 0.58 ? "support" : normalized <= 0.42 ? "oppose" : "caution",
    rationale,
  };
}

function scoreOption(option: string, snapshot: SelfModelSnapshot): number {
  const signals = detectQuestionSignals(option);
  return roundTo(
    average([
      average([snapshot.workStyle.ambition, signals.ambition]),
      average([1 - Math.abs(snapshot.decisionStyle.risk - signals.risk)]),
      average([1 - Math.abs(snapshot.socialStyle.openness - signals.social)]),
      average([1 - Math.abs(snapshot.workStyle.energyConservation - (1 - signals.effort))]),
    ]),
  );
}

function buildSummary(snapshot: SelfModelSnapshot, signals: QuestionSignals, riskLevel: RiskLevel): string {
  return [
    buildSnapshotHeadline(snapshot),
    `risk=${riskLevel}`,
    `ambition signal=${signals.ambition.toFixed(2)}`,
    `effort signal=${signals.effort.toFixed(2)}`,
  ].join("; ");
}

function buildDelta(current: SelfModelSnapshot, ideal: SelfModelSnapshot): string[] {
  if (ideal.observationCount === 0) {
    return ["No explicit ideal-self signal recorded yet."];
  }
  const deltas = [
    ["replyStyle.directness", ideal.replyStyle.directness - current.replyStyle.directness],
    ["replyStyle.warmth", ideal.replyStyle.warmth - current.replyStyle.warmth],
    ["decisionStyle.risk", ideal.decisionStyle.risk - current.decisionStyle.risk],
    ["workStyle.ambition", ideal.workStyle.ambition - current.workStyle.ambition],
  ] as const;
  return deltas
    .filter((entry) => Math.abs(entry[1]) >= 0.1)
    .map(
      (entry) =>
        `${entry[0]}: ideal is ${entry[1] > 0 ? "higher" : "lower"} by ${Math.abs(entry[1]).toFixed(2)}`,
    );
}

function matchAny(text: string, tokens: string[]): boolean {
  return tokens.some((token) => text.includes(token));
}
