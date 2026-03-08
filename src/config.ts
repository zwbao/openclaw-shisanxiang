import type { OpenClawPluginConfigSchema } from "./sdk-compat.js";
import type { ShisanxiangDecisionMode, ShisanxiangResolvedConfig } from "./types.js";

export const DEFAULT_SHISANXIANG_STORAGE_PATH = "~/.openclaw/agents/{agentId}/shisanxiang.sqlite";

export const defaultShisanxiangConfig: ShisanxiangResolvedConfig = {
  enabled: true,
  learning: {
    enabled: true,
    scope: "main_private_only",
  },
  models: {
    defaultMode: "mirror",
    aspirationalWeight: 0.25,
  },
  autonomy: {
    mode: "balanced",
    autoSendEnabled: false,
    autoSendConfidenceThreshold: 0.9,
  },
  storage: {
    path: DEFAULT_SHISANXIANG_STORAGE_PATH,
  },
};

export const shisanxiangPluginConfigJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    enabled: {
      type: "boolean",
      default: true,
    },
    learning: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        scope: {
          type: "string",
          enum: ["main_private_only"],
          default: "main_private_only",
        },
      },
    },
    models: {
      type: "object",
      additionalProperties: false,
      properties: {
        defaultMode: {
          type: "string",
          enum: ["mirror"],
          default: "mirror",
        },
        aspirationalWeight: {
          type: "number",
          minimum: 0,
          maximum: 1,
          default: 0.25,
        },
      },
    },
    autonomy: {
      type: "object",
      additionalProperties: false,
      properties: {
        mode: {
          type: "string",
          enum: ["balanced"],
          default: "balanced",
        },
        autoSendEnabled: {
          type: "boolean",
          default: false,
        },
        autoSendConfidenceThreshold: {
          type: "number",
          minimum: 0,
          maximum: 1,
          default: 0.9,
        },
      },
    },
    storage: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: {
          type: "string",
          default: DEFAULT_SHISANXIANG_STORAGE_PATH,
        },
      },
    },
  },
} as const;

export const shisanxiangPluginConfigSchema: OpenClawPluginConfigSchema = {
  jsonSchema: shisanxiangPluginConfigJsonSchema,
  uiHints: {
    "enabled": {
      label: "Enabled",
      help: "Enable the 十三香 message-twin engine.",
    },
    "learning.enabled": {
      label: "Learning Enabled",
      help: "Allow the twin to learn from eligible conversations and explicit feedback.",
    },
    "learning.scope": {
      label: "Learning Scope",
      help: "Conversation scope that may feed the twin model.",
    },
    "models.defaultMode": {
      label: "Default Mode",
      help: "Default model-selection mode for decision and draft tools.",
    },
    "models.aspirationalWeight": {
      label: "Aspirational Weight",
      help: "How strongly the ideal-self model affects hybrid decisions.",
    },
    "autonomy.mode": {
      label: "Autonomy Mode",
      help: "Execution guardrail policy.",
    },
    "autonomy.autoSendEnabled": {
      label: "Auto Send Enabled",
      help: "Allow low-risk private reply drafts to become auto-send candidates.",
    },
    "autonomy.autoSendConfidenceThreshold": {
      label: "Auto Send Threshold",
      help: "Minimum confidence required before a reply draft is auto-send eligible.",
    },
    "storage.path": {
      label: "Storage Path",
      help: "SQLite path template used per agent.",
    },
  },
};

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function resolveShisanxiangConfig(raw: unknown): ShisanxiangResolvedConfig {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const learning =
    input.learning && typeof input.learning === "object"
      ? (input.learning as Record<string, unknown>)
      : {};
  const models =
    input.models && typeof input.models === "object"
      ? (input.models as Record<string, unknown>)
      : {};
  const autonomy =
    input.autonomy && typeof input.autonomy === "object"
      ? (input.autonomy as Record<string, unknown>)
      : {};
  const storage =
    input.storage && typeof input.storage === "object"
      ? (input.storage as Record<string, unknown>)
      : {};

  return {
    enabled: readBoolean(input.enabled, defaultShisanxiangConfig.enabled),
    learning: {
      enabled: readBoolean(learning.enabled, defaultShisanxiangConfig.learning.enabled),
      scope: "main_private_only",
    },
    models: {
      defaultMode: "mirror",
      aspirationalWeight: Math.min(
        1,
        Math.max(0, readNumber(models.aspirationalWeight, defaultShisanxiangConfig.models.aspirationalWeight)),
      ),
    },
    autonomy: {
      mode: "balanced",
      autoSendEnabled: readBoolean(
        autonomy.autoSendEnabled,
        defaultShisanxiangConfig.autonomy.autoSendEnabled,
      ),
      autoSendConfidenceThreshold: Math.min(
        1,
        Math.max(
          0,
          readNumber(
            autonomy.autoSendConfidenceThreshold,
            defaultShisanxiangConfig.autonomy.autoSendConfidenceThreshold,
          ),
        ),
      ),
    },
    storage: {
      path: readString(storage.path, DEFAULT_SHISANXIANG_STORAGE_PATH),
    },
  };
}

export function resolveStoragePathTemplate(agentId: string, template: string): string {
  return template.replaceAll("{agentId}", agentId);
}

export function normalizeDecisionMode(
  rawMode: unknown,
  fallback: ShisanxiangDecisionMode = defaultShisanxiangConfig.models.defaultMode,
): ShisanxiangDecisionMode {
  const value = typeof rawMode === "string" ? rawMode.trim().toLowerCase() : "";
  if (value === "current" || value === "ideal" || value === "hybrid" || value === "mirror") {
    return value;
  }
  return fallback;
}
