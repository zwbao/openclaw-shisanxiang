import type { OpenClawPluginApi } from "./src/sdk-compat.js";
import { shisanxiangPluginConfigSchema } from "./src/config.js";
import { normalizeDecisionMode } from "./src/config.js";
import { registerShisanxiangCli } from "./src/cli.js";
import { isMainPrivateMessageContext, isMainPrivateSessionKey } from "./src/session-scope.js";
import { ShisanxiangServiceManager } from "./src/service.js";
import { textFromMessage } from "./src/utils.js";
import { createShisanxiangTools } from "./src/tools.js";

const plugin = {
  id: "shisanxiang",
  name: "十三香小龙虾",
  description: "Message-twin plugin with persistent self-modeling, reply drafting, and explicit council analysis.",
  configSchema: shisanxiangPluginConfigSchema,
  register(api: OpenClawPluginApi) {
    const manager = new ShisanxiangServiceManager({
      logger: api.logger,
      pluginConfig: api.pluginConfig,
      resolvePath: api.resolvePath,
    });

    api.registerTool(
      (ctx) => {
        const agentId = manager.getAgentId(ctx);
        return createShisanxiangTools({
          manager,
          agentId,
          sessionKey: ctx.sessionKey,
        });
      },
      {
        names: [
          "shisanxiang_status",
          "shisanxiang_decide",
          "shisanxiang_draft_reply",
          "shisanxiang_council",
          "shisanxiang_feedback",
        ],
      },
    );

    api.registerCli(
      ({ program }) =>
        registerShisanxiangCli({
          program,
          manager,
          logger: api.logger,
          loadConfig: api.runtime.config.loadConfig,
          writeConfig: api.runtime.config.writeConfigFile,
        }),
      { commands: ["shisanxiang"] },
    );

    api.on("message_received", async (event, ctx) => {
      const config = manager.resolveConfig();
      if (!config.enabled || !config.learning.enabled) {
        return;
      }
      if (
        config.learning.scope !== "main_private_only" ||
        !isMainPrivateMessageContext({
          conversationId: ctx.conversationId,
          metadata: event.metadata,
        })
      ) {
        return;
      }
      manager.recordInboundLearning({
        agentId: "main",
        text: event.content,
        source: "message_received",
      });
    });

    api.on("agent_end", async (event, ctx) => {
      const config = manager.resolveConfig();
      if (!config.enabled || !config.learning.enabled || !isMainPrivateSessionKey(ctx.sessionKey)) {
        return;
      }
      const userMessages = event.messages.filter(
        (message) => message && typeof message === "object" && (message as { role?: string }).role === "user",
      );
      const lastUser = userMessages.at(-1);
      const text = textFromMessage(lastUser);
      if (!text) {
        return;
      }
      manager.recordInboundLearning({
        agentId: ctx.agentId,
        sessionKey: ctx.sessionKey,
        text,
        source: "agent_end",
      });
    });

    api.on("before_prompt_build", async (_event, ctx) => {
      const config = manager.resolveConfig();
      if (!config.enabled || !isMainPrivateSessionKey(ctx.sessionKey)) {
        return;
      }
      const agentId = manager.getAgentId({
        agentId: ctx.agentId,
        sessionKey: ctx.sessionKey,
      });
      return {
        prependContext: manager.buildPromptSummary({
          agentId,
          mode: normalizeDecisionMode(config.models.defaultMode),
        }),
      };
    });

    api.registerService({
      id: "shisanxiang",
      start: async () => {},
      stop: async () => {
        manager.closeAll();
      },
    });
  },
};

export default plugin;
