import type { SelfModelSnapshot } from "./types.js";

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

export function roundTo(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function uniqueNonEmpty(values: string[], limit = 8): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const normalized = raw.trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

export function textFromUnknownContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }
        if (!entry || typeof entry !== "object") {
          return "";
        }
        const text = (entry as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  if (content && typeof content === "object") {
    const text = (content as { text?: unknown }).text;
    return typeof text === "string" ? text : "";
  }
  return "";
}

export function roleFromMessage(message: unknown): string | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }
  const role = (message as { role?: unknown }).role;
  return typeof role === "string" ? role : undefined;
}

export function textFromMessage(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }
  const content = (message as { content?: unknown }).content;
  return textFromUnknownContent(content);
}

export function summarizeTrait(value: number, low: string, high: string): string {
  return value >= 0.55 ? high : low;
}

export function buildSnapshotHeadline(snapshot: SelfModelSnapshot): string {
  if (snapshot.observationCount === 0) {
    return "still learning; no confirmed signal yet";
  }
  const replyTone = [
    summarizeTrait(snapshot.replyStyle.directness, "measured", "direct"),
    summarizeTrait(snapshot.replyStyle.warmth, "reserved", "warm"),
    summarizeTrait(snapshot.replyStyle.brevity, "detailed", "brief"),
  ].join(", ");
  const values = snapshot.values.slice(0, 3).join(", ") || "still learning";
  return `${replyTone}; values: ${values}`;
}

export function buildIdealSnapshotHeadline(snapshot: SelfModelSnapshot): string {
  if (snapshot.observationCount === 0) {
    return "no explicit ideal-self signal yet";
  }
  return buildSnapshotHeadline(snapshot);
}
