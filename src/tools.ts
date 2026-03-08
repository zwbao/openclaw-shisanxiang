import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import type { AnyAgentTool } from "./sdk-compat.js";
import type { ShisanxiangServiceManager } from "./service.js";
import { normalizeDecisionMode } from "./config.js";
import type { FeedbackItemType, FeedbackOutcome, SelfModelTarget } from "./types.js";

function stringEnum<T extends readonly string[]>(values: T, description: string) {
  return Type.Unsafe<T[number]>({
    type: "string",
    enum: [...values],
    description,
  });
}

const DecideSchema = Type.Object(
  {
    question: Type.String({ minLength: 1, description: "Decision question to evaluate." }),
    options: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })),
    mode: Type.Optional(
      stringEnum(["mirror", "current", "ideal", "hybrid"], "Twin mode override."),
    ),
  },
  { additionalProperties: false },
);

const DraftReplySchema = Type.Object(
  {
    message: Type.String({ minLength: 1, description: "Inbound message to reply to." }),
    recipient: Type.Optional(Type.String({ minLength: 1 })),
    channel: Type.Optional(Type.String({ minLength: 1 })),
    mode: Type.Optional(
      stringEnum(["mirror", "current", "ideal", "hybrid"], "Twin mode override."),
    ),
  },
  { additionalProperties: false },
);

const CouncilSchema = Type.Object(
  {
    question: Type.String({ minLength: 1, description: "Question for the persona council." }),
    mode: Type.Optional(
      stringEnum(["mirror", "current", "ideal", "hybrid"], "Twin mode override."),
    ),
  },
  { additionalProperties: false },
);

const FeedbackSchema = Type.Object(
  {
    itemType: stringEnum(
      ["decision", "draft_reply", "message_reply", "other"],
      "What kind of output the feedback refers to.",
    ),
    outcome: stringEnum(["accepted", "edited", "rejected"], "Feedback outcome."),
    userEdit: Type.Optional(
      Type.String({
        minLength: 1,
        description: "Optional user-edited text to learn from.",
      }),
    ),
    targetModel: Type.Optional(
      stringEnum(["current", "ideal"], "Which self-model should be updated."),
    ),
  },
  { additionalProperties: false },
);

type DecideParams = Static<typeof DecideSchema>;
type DraftReplyParams = Static<typeof DraftReplySchema>;
type CouncilParams = Static<typeof CouncilSchema>;
type FeedbackParams = Static<typeof FeedbackSchema>;

export function createShisanxiangTools(params: {
  manager: ShisanxiangServiceManager;
  agentId: string;
  sessionKey?: string;
}): AnyAgentTool[] {
  return [
    {
      name: "shisanxiang_status",
      description:
        "Return the current 十三香 message-twin status, observation counts, and current/ideal summaries.",
      parameters: Type.Object({}, { additionalProperties: false }),
      execute: async () => jsonResult(params.manager.getStatus(params.agentId)),
    },
    {
      name: "shisanxiang_decide",
      description:
        "Secondary helper for how the user's twin would decide, including risk, confidence, and persona breakdown.",
      parameters: DecideSchema,
      execute: async (_toolCallId, rawParams) => {
        const toolParams = rawParams as DecideParams;
        return jsonResult(
          params.manager.decide({
            agentId: params.agentId,
            question: toolParams.question,
            options: toolParams.options,
            mode: normalizeDecisionMode(toolParams.mode),
          }),
        );
      },
    },
    {
      name: "shisanxiang_draft_reply",
      description:
        "Primary MVP tool: generate a private-message reply draft that matches the current user twin, with should-reply, tone notes, risk, and confidence.",
      parameters: DraftReplySchema,
      execute: async (_toolCallId, rawParams) => {
        const toolParams = rawParams as DraftReplyParams;
        return jsonResult(
          params.manager.draftReply({
            agentId: params.agentId,
            message: toolParams.message,
            recipient: toolParams.recipient,
            channel: toolParams.channel,
            mode: normalizeDecisionMode(toolParams.mode),
          }),
        );
      },
    },
    {
      name: "shisanxiang_council",
      description:
        "Run the explicit 十三香 council analysis for explanation, disagreement mapping, and current-vs-ideal comparison.",
      parameters: CouncilSchema,
      execute: async (_toolCallId, rawParams) => {
        const toolParams = rawParams as CouncilParams;
        return jsonResult(
          params.manager.council({
            agentId: params.agentId,
            question: toolParams.question,
            mode: normalizeDecisionMode(toolParams.mode),
          }),
        );
      },
    },
    {
      name: "shisanxiang_feedback",
      description:
        "Record explicit feedback about a decision or reply so the twin can update its current or ideal self-model.",
      parameters: FeedbackSchema,
      execute: async (_toolCallId, rawParams) => {
        const toolParams = rawParams as FeedbackParams;
        return jsonResult(
          params.manager.applyFeedback({
            agentId: params.agentId,
            sessionKey: params.sessionKey,
            itemType: toolParams.itemType as FeedbackItemType,
            outcome: toolParams.outcome as FeedbackOutcome,
            userEdit: toolParams.userEdit,
            targetModel: (toolParams.targetModel as SelfModelTarget | undefined) ?? "current",
          }),
        );
      },
    },
  ];
}

function jsonResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
    details: payload,
  };
}
