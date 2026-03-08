import path from "node:path";
import type { OpenClawConfig, PluginLogger } from "./sdk-compat.js";
import { buildAgentMainSessionKey } from "./sdk-compat.js";
import { resolveShisanxiangConfig, resolveStoragePathTemplate } from "./config.js";
import { buildCouncil, buildDecision, buildDraftReply } from "./decision.js";
import { extractFeedbackObservations, extractPassiveObservations } from "./learning.js";
import { blendSnapshots, buildSnapshotFromObservations, createEmptySnapshot } from "./modeling.js";
import { buildTwinPromptSummary } from "./prompting.js";
import { resolveAgentId } from "./session-scope.js";
import { ShisanxiangStore } from "./store.js";
import { buildIdealSnapshotHeadline, buildSnapshotHeadline } from "./utils.js";
import type {
  FeedbackItemType,
  FeedbackOutcome,
  SelfModelTarget,
  ShisanxiangCouncilResult,
  ShisanxiangDecisionMode,
  ShisanxiangDecisionResult,
  ShisanxiangDraftReplyResult,
  ShisanxiangFeedbackResult,
  ShisanxiangResolvedConfig,
  ShisanxiangStatusResult,
} from "./types.js";

export class ShisanxiangServiceManager {
  private readonly stores = new Map<string, ShisanxiangStore>();
  private readonly recomputeLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly params: {
      logger: PluginLogger;
      pluginConfig: Record<string, unknown> | undefined;
      resolvePath: (input: string) => string;
    },
  ) {}

  resolveConfig(): ShisanxiangResolvedConfig {
    return resolveShisanxiangConfig(this.params.pluginConfig);
  }

  closeAll(): void {
    for (const store of this.stores.values()) {
      store.close();
    }
    this.stores.clear();
  }

  getAgentId(ctx: Partial<{ agentId?: string; sessionKey?: string }> & { sessionKey?: string }): string {
    return resolveAgentId({ agentId: ctx.agentId, sessionKey: ctx.sessionKey, fallback: "main" });
  }

  recordInboundLearning(params: {
    agentId?: string;
    sessionKey?: string;
    text: string;
    source: string;
    targetModel?: SelfModelTarget;
  }): number {
    const config = this.resolveConfig();
    if (!config.enabled || !config.learning.enabled) {
      return 0;
    }
    const agentId = resolveAgentId({
      agentId: params.agentId,
      sessionKey: params.sessionKey,
      fallback: "main",
    });
    const store = this.getStore(agentId);
    const observations = extractPassiveObservations({
      agentId,
      sessionKey: params.sessionKey,
      text: params.text,
      source: params.source,
      targetModel: params.targetModel ?? "current",
    });
    for (const observation of observations) {
      store.recordObservation(observation);
    }
    store.recordEvent({
      agentId,
      sessionKey: params.sessionKey,
      type: "inbound_learning",
      payload: {
        source: params.source,
        observationCount: observations.length,
      },
    });
    void this.recomputeIfNeeded(agentId, false);
    return observations.length;
  }

  applyFeedback(params: {
    agentId?: string;
    sessionKey?: string;
    itemType: FeedbackItemType;
    outcome: FeedbackOutcome;
    userEdit?: string;
    targetModel?: SelfModelTarget;
  }): ShisanxiangFeedbackResult {
    const agentId = resolveAgentId({
      agentId: params.agentId,
      sessionKey: params.sessionKey,
      fallback: "main",
    });
    const targetModel = params.targetModel ?? "current";
    const store = this.getStore(agentId);
    const extracted = extractFeedbackObservations({
      agentId,
      sessionKey: params.sessionKey,
      itemType: params.itemType,
      outcome: params.outcome,
      userEdit: params.userEdit,
      targetModel,
    });
    for (const observation of extracted.observations) {
      store.recordObservation(observation);
    }
    store.recordEvent({
      agentId,
      sessionKey: params.sessionKey,
      type: "feedback",
      payload: {
        itemType: params.itemType,
        outcome: params.outcome,
        targetModel,
      },
    });
    void this.recomputeIfNeeded(agentId, true);
    return {
      learned: extracted.learned,
      updatedFields: extracted.observations.map((observation) => observation.field ?? observation.kind),
      targetModel,
    };
  }

  getStatus(agentId: string): ShisanxiangStatusResult {
    const config = this.resolveConfig();
    const store = this.getStore(agentId);
    const snapshots = this.ensureSnapshots(agentId);
    return {
      learningEnabled: config.learning.enabled,
      scope: config.learning.scope,
      observationCount: store.getObservationCount(agentId),
      pendingObservationCount: store.getPendingObservationCount(agentId),
      lastUpdatedAt: store.getLastUpdatedAt(agentId),
      activeMode: config.models.defaultMode,
      currentSummary: buildSnapshotHeadline(snapshots.current),
      idealSummary: buildIdealSnapshotHeadline(snapshots.ideal),
      current: snapshots.current,
      ideal: snapshots.ideal,
    };
  }

  decide(params: {
    agentId: string;
    question: string;
    options?: string[];
    mode: ShisanxiangDecisionMode;
  }): ShisanxiangDecisionResult {
    const config = this.resolveConfig();
    const snapshots = this.ensureSnapshots(params.agentId);
    const snapshot = blendSnapshots({
      current: snapshots.current,
      ideal: snapshots.ideal,
      mode: params.mode,
      aspirationalWeight: config.models.aspirationalWeight,
    });
    return buildDecision({
      question: params.question,
      options: params.options,
      snapshot,
    });
  }

  draftReply(params: {
    agentId: string;
    message: string;
    recipient?: string;
    channel?: string;
    mode: ShisanxiangDecisionMode;
  }): ShisanxiangDraftReplyResult {
    const config = this.resolveConfig();
    const snapshots = this.ensureSnapshots(params.agentId);
    const snapshot = blendSnapshots({
      current: snapshots.current,
      ideal: snapshots.ideal,
      mode: params.mode,
      aspirationalWeight: config.models.aspirationalWeight,
    });
    return buildDraftReply({
      message: params.message,
      snapshot,
      autoSendEnabled: config.autonomy.autoSendEnabled,
      autoSendConfidenceThreshold: config.autonomy.autoSendConfidenceThreshold,
      recipient: params.recipient,
      channel: params.channel,
    });
  }

  council(params: {
    agentId: string;
    question: string;
    mode: ShisanxiangDecisionMode;
  }): ShisanxiangCouncilResult {
    const config = this.resolveConfig();
    const snapshots = this.ensureSnapshots(params.agentId);
    const current =
      params.mode === "ideal"
        ? snapshots.ideal
        : params.mode === "hybrid"
          ? blendSnapshots({
              current: snapshots.current,
              ideal: snapshots.ideal,
              mode: "hybrid",
              aspirationalWeight: config.models.aspirationalWeight,
            })
          : snapshots.current;
    return buildCouncil({
      question: params.question,
      current,
      ideal: snapshots.ideal,
    });
  }

  exportModel(agentId: string): Record<string, unknown> {
    const status = this.getStatus(agentId);
    return {
      agentId,
      config: this.resolveConfig(),
      status,
    };
  }

  resetModel(agentId: string): void {
    const store = this.getStore(agentId);
    store.resetAgent(agentId);
    store.writeSnapshot(agentId, "current", createEmptySnapshot("current"));
    store.writeSnapshot(agentId, "ideal", createEmptySnapshot("ideal"));
  }

  setAutonomyConfig(params: {
    config: OpenClawConfig;
    autoSendEnabled?: boolean;
    threshold?: number;
  }): OpenClawConfig {
    const current = this.resolveConfig();
    return {
      ...params.config,
      plugins: {
        ...params.config.plugins,
        entries: {
          ...(params.config.plugins?.entries ?? {}),
          shisanxiang: {
            ...(params.config.plugins?.entries?.shisanxiang ?? {}),
            enabled: true,
            config: {
              ...current,
              autonomy: {
                ...current.autonomy,
                ...(params.autoSendEnabled !== undefined
                  ? { autoSendEnabled: params.autoSendEnabled }
                  : {}),
                ...(params.threshold !== undefined
                  ? { autoSendConfidenceThreshold: params.threshold }
                  : {}),
              },
            },
          },
        },
      },
    };
  }

  buildPromptSummary(params: {
    agentId: string;
    mode: ShisanxiangDecisionMode;
  }): string {
    const config = this.resolveConfig();
    const snapshots = this.ensureSnapshots(params.agentId);
    const snapshot = blendSnapshots({
      current: snapshots.current,
      ideal: snapshots.ideal,
      mode: params.mode,
      aspirationalWeight: config.models.aspirationalWeight,
    });
    return buildTwinPromptSummary({
      snapshot,
      mode: params.mode,
    });
  }

  async recomputeIfNeeded(agentId: string, force: boolean): Promise<void> {
    const store = this.getStore(agentId);
    const pendingCount = store.getPendingObservationCount(agentId);
    if (!force && pendingCount < 10) {
      return;
    }
    const existing = this.recomputeLocks.get(agentId);
    if (existing) {
      await existing;
      return;
    }
    const next = (async () => {
      const currentObservations = store.listObservations(agentId, "current");
      const idealObservations = store.listObservations(agentId, "ideal");
      const current = buildSnapshotFromObservations("current", currentObservations);
      const ideal =
        idealObservations.length > 0
          ? buildSnapshotFromObservations("ideal", idealObservations)
          : store.readSnapshot(agentId, "ideal") ?? createEmptySnapshot("ideal");
      store.writeSnapshot(agentId, "current", current);
      store.writeSnapshot(agentId, "ideal", ideal);
      store.markRecomputed(agentId, store.getLastObservationId(agentId));
    })();

    this.recomputeLocks.set(agentId, next);
    try {
      await next;
    } finally {
      this.recomputeLocks.delete(agentId);
    }
  }

  private ensureSnapshots(agentId: string): { current: ReturnType<typeof createEmptySnapshot>; ideal: ReturnType<typeof createEmptySnapshot> } {
    const store = this.getStore(agentId);
    const current = store.readSnapshot(agentId, "current") ?? createEmptySnapshot("current");
    const ideal = store.readSnapshot(agentId, "ideal") ?? createEmptySnapshot("ideal");
    if (!store.readSnapshot(agentId, "current")) {
      store.writeSnapshot(agentId, "current", current);
    }
    if (!store.readSnapshot(agentId, "ideal")) {
      store.writeSnapshot(agentId, "ideal", ideal);
    }
    return { current, ideal };
  }

  private getStore(agentId: string): ShisanxiangStore {
    const resolvedAgentId = agentId.trim() || "main";
    const config = this.resolveConfig();
    const template = resolveStoragePathTemplate(resolvedAgentId, config.storage.path);
    const resolvedPath = this.params.resolvePath(template);
    const key = path.resolve(resolvedPath);
    let store = this.stores.get(key);
    if (!store) {
      store = new ShisanxiangStore(key);
      this.stores.set(key, store);
    }
    return store;
  }
}

export function defaultSessionKeyForAgent(agentId: string): string {
  return buildAgentMainSessionKey({ agentId });
}
