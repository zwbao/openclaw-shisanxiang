export const SHISANXIANG_PERSONAS = [
  "rational",
  "ambitious",
  "energy_saving",
  "emotional",
  "risk_averse",
  "risk_seeking",
  "social",
  "solitary",
  "creative",
  "skeptical",
  "dutiful",
  "status_seeking",
  "shadow",
] as const;

export const SHISANXIANG_MODEL_TARGETS = ["current", "ideal"] as const;
export const SHISANXIANG_DECISION_MODES = ["mirror", "current", "ideal", "hybrid"] as const;
export const SHISANXIANG_AUTONOMY_MODES = ["balanced"] as const;

export type ShisanxiangPersona = (typeof SHISANXIANG_PERSONAS)[number];
export type SelfModelTarget = (typeof SHISANXIANG_MODEL_TARGETS)[number];
export type ShisanxiangDecisionMode = (typeof SHISANXIANG_DECISION_MODES)[number];
export type ShisanxiangAutonomyMode = (typeof SHISANXIANG_AUTONOMY_MODES)[number];

export type TraitBlock = {
  directness?: number;
  warmth?: number;
  brevity?: number;
  humor?: number;
  risk?: number;
  speed?: number;
  evidence?: number;
  assertiveness?: number;
  openness?: number;
  conflictHandling?: number;
  followUpTendency?: number;
  planning?: number;
  ambition?: number;
  energyConservation?: number;
};

export type SelfModelSnapshot = {
  version: 1;
  mode: SelfModelTarget;
  generatedAt: number;
  observationCount: number;
  values: string[];
  replyStyle: {
    directness: number;
    warmth: number;
    brevity: number;
    humor: number;
  };
  decisionStyle: {
    risk: number;
    speed: number;
    evidence: number;
    assertiveness: number;
  };
  socialStyle: {
    openness: number;
    conflictHandling: number;
    followUpTendency: number;
  };
  workStyle: {
    planning: number;
    ambition: number;
    energyConservation: number;
  };
  redLines: string[];
  confidenceByField: Record<string, number>;
  evidenceRefs: Record<string, string[]>;
  personaWeights: Record<ShisanxiangPersona, number>;
};

export type ShisanxiangObservationKind =
  | "value_signal"
  | "red_line"
  | "trait_delta"
  | "feedback"
  | "event";

export type StoredObservation = {
  id: number;
  agentId: string;
  sessionKey?: string;
  targetModel: SelfModelTarget;
  source: string;
  kind: ShisanxiangObservationKind;
  field?: string;
  value: unknown;
  evidence?: string;
  confidence: number;
  createdAt: number;
};

export type ObservationInput = Omit<StoredObservation, "id">;

export type ShisanxiangResolvedConfig = {
  enabled: boolean;
  learning: {
    enabled: boolean;
    scope: "main_private_only";
  };
  models: {
    defaultMode: "mirror";
    aspirationalWeight: number;
  };
  autonomy: {
    mode: "balanced";
    autoSendEnabled: boolean;
    autoSendConfidenceThreshold: number;
  };
  storage: {
    path: string;
  };
};

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type CouncilStance = "support" | "caution" | "oppose";
export type FeedbackOutcome = "accepted" | "edited" | "rejected";
export type FeedbackItemType = "decision" | "draft_reply" | "message_reply" | "other";

export type PersonaStance = {
  persona: ShisanxiangPersona;
  weight: number;
  score: number;
  stance: CouncilStance;
  rationale: string;
};

export type ShisanxiangStatusResult = {
  learningEnabled: boolean;
  scope: "main_private_only";
  observationCount: number;
  pendingObservationCount: number;
  lastUpdatedAt?: number;
  activeMode: "mirror";
  currentSummary: string;
  idealSummary: string;
  current: SelfModelSnapshot;
  ideal: SelfModelSnapshot;
};

export type ShisanxiangDecisionResult = {
  recommendation: string;
  recommendedOption?: string;
  reasons: string[];
  riskLevel: RiskLevel;
  confidence: number;
  personaBreakdown: PersonaStance[];
  optionScores?: Array<{ option: string; score: number }>;
};

export type ShisanxiangDraftReplyResult = {
  shouldReply: boolean;
  draft: string;
  toneNotes: string[];
  riskLevel: RiskLevel;
  confidence: number;
  autoSendEligible: boolean;
};

export type ShisanxiangCouncilResult = {
  summary: string;
  finalRecommendation: string;
  disagreements: string[];
  personaBreakdown: PersonaStance[];
  currentVsIdealDelta: string[];
  riskLevel: RiskLevel;
  confidence: number;
};

export type ShisanxiangFeedbackResult = {
  learned: string[];
  updatedFields: string[];
  targetModel: SelfModelTarget;
};
