import type { Command } from "commander";
import type { OpenClawConfig, PluginLogger } from "./sdk-compat.js";
import type { ShisanxiangServiceManager } from "./service.js";

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function resolveAgentOption(agent: string | undefined): string {
  return agent?.trim() || "main";
}

export function registerShisanxiangCli(params: {
  program: Command;
  manager: ShisanxiangServiceManager;
  logger: PluginLogger;
  loadConfig: () => OpenClawConfig;
  writeConfig: (config: OpenClawConfig) => Promise<void>;
}): void {
  const root = params.program
    .command("shisanxiang")
    .description("十三香小龙虾 message-twin commands");

  root
    .command("status")
    .option("--agent <id>", "Agent id", "main")
    .description("Show current learning state and current/ideal twin summaries")
    .action((opts: { agent: string }) => {
      printJson(params.manager.getStatus(resolveAgentOption(opts.agent)));
    });

  root
    .command("council")
    .argument("<question>", "Question for the council")
    .option("--agent <id>", "Agent id", "main")
    .option("--mode <mode>", "mirror/current/ideal/hybrid", "mirror")
    .description("Run the explicit council analysis (not the default message flow)")
    .action((question: string, opts: { agent: string; mode: string }) => {
      printJson(
        params.manager.council({
          agentId: resolveAgentOption(opts.agent),
          question,
          mode: opts.mode as "mirror" | "current" | "ideal" | "hybrid",
        }),
      );
    });

  root
    .command("feedback")
    .requiredOption("--item-type <type>", "decision|draft_reply|message_reply|other")
    .requiredOption("--outcome <outcome>", "accepted|edited|rejected")
    .option("--user-edit <text>", "User-edited text")
    .option("--target-model <model>", "current|ideal", "current")
    .option("--agent <id>", "Agent id", "main")
    .description("Record explicit feedback for the twin")
    .action(
      (opts: {
        itemType: "decision" | "draft_reply" | "message_reply" | "other";
        outcome: "accepted" | "edited" | "rejected";
        userEdit?: string;
        targetModel: "current" | "ideal";
        agent: string;
      }) => {
        printJson(
          params.manager.applyFeedback({
            agentId: resolveAgentOption(opts.agent),
            itemType: opts.itemType,
            outcome: opts.outcome,
            userEdit: opts.userEdit,
            targetModel: opts.targetModel,
          }),
        );
      },
    );

  root
    .command("export-model")
    .option("--agent <id>", "Agent id", "main")
    .description("Export current and ideal self-model snapshots")
    .action((opts: { agent: string }) => {
      printJson(params.manager.exportModel(resolveAgentOption(opts.agent)));
    });

  root
    .command("reset-model")
    .option("--agent <id>", "Agent id", "main")
    .description("Reset 十三香 data for one agent")
    .action((opts: { agent: string }) => {
      const agentId = resolveAgentOption(opts.agent);
      params.manager.resetModel(agentId);
      printJson({ ok: true, agentId });
    });

  root
    .command("autonomy")
    .option("--auto-send <state>", "on/off")
    .option("--threshold <value>", "0-1 threshold")
    .description("Show or update future auto-send candidate settings")
    .action(async (opts: { autoSend?: string; threshold?: string }) => {
      const currentConfig = params.loadConfig();
      const autoSendValue =
        opts.autoSend === undefined ? undefined : ["on", "true", "1"].includes(opts.autoSend);
      const thresholdValue =
        opts.threshold === undefined ? undefined : Number.parseFloat(opts.threshold);

      if (autoSendValue === undefined && thresholdValue === undefined) {
        printJson(params.manager.resolveConfig().autonomy);
        return;
      }

      const nextConfig = params.manager.setAutonomyConfig({
        config: currentConfig,
        autoSendEnabled: autoSendValue,
        threshold: Number.isFinite(thresholdValue) ? thresholdValue : undefined,
      });
      await params.writeConfig(nextConfig);
      printJson(nextConfig.plugins?.entries?.shisanxiang?.config ?? {});
    });
}
