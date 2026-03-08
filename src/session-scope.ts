import {
  parseAgentSessionKey,
  resolveAgentIdFromSessionKey,
} from "./sdk-compat.js";

export function resolveAgentId(params: {
  agentId?: string;
  sessionKey?: string;
  fallback?: string;
}): string {
  const explicit = params.agentId?.trim();
  if (explicit) {
    return explicit;
  }
  const fromSession = params.sessionKey?.trim();
  if (fromSession) {
    return resolveAgentIdFromSessionKey(fromSession);
  }
  return params.fallback ?? "main";
}

export function isMainPrivateSessionKey(sessionKey: string | undefined): boolean {
  const parsed = parseAgentSessionKey(sessionKey ?? "");
  if (!parsed) {
    return false;
  }
  const rest = parsed.rest.toLowerCase();
  if (rest === "main") {
    return true;
  }
  if (rest.startsWith("subagent:") || rest.startsWith("cron:") || rest.startsWith("acp:")) {
    return false;
  }
  return /(^|:)direct:/.test(rest);
}

export function isMainPrivateMessageContext(params: {
  conversationId?: string;
  metadata?: Record<string, unknown>;
}): boolean {
  if (!params.conversationId?.trim()) {
    return false;
  }
  const metadata = params.metadata ?? {};
  const groupSignals = [
    metadata.guildId,
    metadata.channelName,
    metadata.originatingChannel,
    metadata.threadId,
  ].filter((value) => value !== undefined && value !== null);

  return groupSignals.length === 0;
}
