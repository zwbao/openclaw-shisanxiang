import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { requireNodeSqlite } from "./sdk-compat.js";
import type { ObservationInput, SelfModelSnapshot, SelfModelTarget, StoredObservation } from "./types.js";

type EventInput = {
  agentId: string;
  sessionKey?: string;
  type: string;
  payload: unknown;
  createdAt?: number;
};

export class ShisanxiangStore {
  private db: DatabaseSync;

  constructor(private readonly dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const { DatabaseSync } = requireNodeSqlite();
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        session_key TEXT,
        target_model TEXT NOT NULL,
        source TEXT NOT NULL,
        kind TEXT NOT NULL,
        field TEXT,
        value_json TEXT NOT NULL,
        evidence TEXT,
        confidence REAL NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_observations_agent_id ON observations(agent_id, id);
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        session_key TEXT,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS snapshots (
        agent_id TEXT NOT NULL,
        target_model TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (agent_id, target_model)
      );
      CREATE TABLE IF NOT EXISTS meta (
        agent_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (agent_id, key)
      );
    `);
  }

  get path(): string {
    return this.dbPath;
  }

  close(): void {
    this.db.close();
  }

  recordObservation(input: ObservationInput): StoredObservation {
    const createdAt = input.createdAt ?? Date.now();
    const stmt = this.db.prepare(
      `INSERT INTO observations (
        agent_id,
        session_key,
        target_model,
        source,
        kind,
        field,
        value_json,
        evidence,
        confidence,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    stmt.run(
      input.agentId,
      input.sessionKey ?? null,
      input.targetModel,
      input.source,
      input.kind,
      input.field ?? null,
      JSON.stringify(input.value ?? null),
      input.evidence ?? null,
      input.confidence,
      createdAt,
    );
    const row = this.db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number };
    return {
      id: row.id,
      agentId: input.agentId,
      sessionKey: input.sessionKey,
      targetModel: input.targetModel,
      source: input.source,
      kind: input.kind,
      field: input.field,
      value: input.value,
      evidence: input.evidence,
      confidence: input.confidence,
      createdAt,
    };
  }

  recordEvent(input: EventInput): void {
    const createdAt = input.createdAt ?? Date.now();
    this.db
      .prepare(
        "INSERT INTO events (agent_id, session_key, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        input.agentId,
        input.sessionKey ?? null,
        input.type,
        JSON.stringify(input.payload ?? null),
        createdAt,
      );
  }

  listObservations(agentId: string, targetModel?: SelfModelTarget): StoredObservation[] {
    const rows = targetModel
      ? (this.db
          .prepare(
            `SELECT * FROM observations WHERE agent_id = ? AND target_model = ? ORDER BY id ASC`,
          )
          .all(agentId, targetModel) as Array<Record<string, unknown>>)
      : (this.db
          .prepare(`SELECT * FROM observations WHERE agent_id = ? ORDER BY id ASC`)
          .all(agentId) as Array<Record<string, unknown>>);

    return rows.map((row) => ({
      id: Number(row.id),
      agentId: String(row.agent_id),
      sessionKey: typeof row.session_key === "string" ? row.session_key : undefined,
      targetModel: String(row.target_model) as SelfModelTarget,
      source: String(row.source),
      kind: String(row.kind) as StoredObservation["kind"],
      field: typeof row.field === "string" ? row.field : undefined,
      value: parseJson(String(row.value_json)),
      evidence: typeof row.evidence === "string" ? row.evidence : undefined,
      confidence: Number(row.confidence),
      createdAt: Number(row.created_at),
    }));
  }

  getObservationCount(agentId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM observations WHERE agent_id = ?")
      .get(agentId) as { count: number };
    return row.count;
  }

  getLastObservationId(agentId: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(id), 0) AS id FROM observations WHERE agent_id = ?")
      .get(agentId) as { id: number };
    return row.id;
  }

  getPendingObservationCount(agentId: string): number {
    const lastRecomputeId = Number(this.getMeta(agentId, "last_recompute_observation_id") ?? "0");
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM observations WHERE agent_id = ? AND id > ?")
      .get(agentId, lastRecomputeId) as { count: number };
    return row.count;
  }

  markRecomputed(agentId: string, lastObservationId: number): void {
    this.setMeta(agentId, "last_recompute_observation_id", String(lastObservationId));
  }

  writeSnapshot(agentId: string, targetModel: SelfModelTarget, snapshot: SelfModelSnapshot): void {
    const updatedAt = snapshot.generatedAt;
    this.db
      .prepare(
        `INSERT INTO snapshots (agent_id, target_model, snapshot_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(agent_id, target_model) DO UPDATE SET
           snapshot_json = excluded.snapshot_json,
           updated_at = excluded.updated_at`,
      )
      .run(agentId, targetModel, JSON.stringify(snapshot), updatedAt);
  }

  readSnapshot(agentId: string, targetModel: SelfModelTarget): SelfModelSnapshot | undefined {
    const row = this.db
      .prepare("SELECT snapshot_json FROM snapshots WHERE agent_id = ? AND target_model = ?")
      .get(agentId, targetModel) as { snapshot_json?: string } | undefined;
    if (!row?.snapshot_json) {
      return undefined;
    }
    return parseJson(row.snapshot_json) as SelfModelSnapshot;
  }

  readSnapshots(agentId: string): Partial<Record<SelfModelTarget, SelfModelSnapshot>> {
    const rows = this.db
      .prepare("SELECT target_model, snapshot_json FROM snapshots WHERE agent_id = ?")
      .all(agentId) as Array<{ target_model: SelfModelTarget; snapshot_json: string }>;
    const result: Partial<Record<SelfModelTarget, SelfModelSnapshot>> = {};
    for (const row of rows) {
      result[row.target_model] = parseJson(row.snapshot_json) as SelfModelSnapshot;
    }
    return result;
  }

  getLastUpdatedAt(agentId: string): number | undefined {
    const row = this.db
      .prepare("SELECT MAX(updated_at) AS updated_at FROM snapshots WHERE agent_id = ?")
      .get(agentId) as { updated_at?: number | null };
    return typeof row.updated_at === "number" ? row.updated_at : undefined;
  }

  resetAgent(agentId: string): void {
    this.db.prepare("DELETE FROM observations WHERE agent_id = ?").run(agentId);
    this.db.prepare("DELETE FROM events WHERE agent_id = ?").run(agentId);
    this.db.prepare("DELETE FROM snapshots WHERE agent_id = ?").run(agentId);
    this.db.prepare("DELETE FROM meta WHERE agent_id = ?").run(agentId);
  }

  private getMeta(agentId: string, key: string): string | undefined {
    const row = this.db
      .prepare("SELECT value FROM meta WHERE agent_id = ? AND key = ?")
      .get(agentId, key) as { value?: string } | undefined;
    return row?.value;
  }

  private setMeta(agentId: string, key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO meta (agent_id, key, value)
         VALUES (?, ?, ?)
         ON CONFLICT(agent_id, key) DO UPDATE SET value = excluded.value`,
      )
      .run(agentId, key, value);
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
