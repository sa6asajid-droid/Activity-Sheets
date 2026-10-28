/**
 * Persistence. `Store` is the interface the app depends on; `SqliteStore` is
 * the local implementation using Node's built-in `node:sqlite` (no native
 * build step). A PostgreSQL implementation can satisfy the same interface —
 * every query here is parameterized and uses portable SQL.
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { WorksheetDocument } from "../schema/document";

export type ProjectStatus = "draft" | "needs-review" | "approved" | "exported";

export interface ProjectRow {
  id: string;
  title: string;
  question: string;
  status: ProjectStatus;
  folder: string;
  archived: boolean;
  isSample: boolean;
  createdAt: string;
  updatedAt: string;
  currentRevisionId: string | null;
  draftVersion: number;
  settings: ProjectSettings;
  hasDraft: boolean;
}

/** Inputs captured on the creation screen. */
export interface ProjectSettings {
  question: string;
  supportingQuestions: string[];
  subject: string;
  scope: string;
  requiredConcepts: string[];
  excludedConcepts: string[];
  realWorldContext: string;
  learnerInterests: string;
  audience: WorksheetDocument["audience"];
  format: WorksheetDocument["format"];
  layout: WorksheetDocument["layout"];
  contentMode: "research" | "user-sources" | "mixed" | "unverified-draft";
  options: {
    investigation: boolean;
    discussion: boolean;
    retrievalCard: boolean;
    extension: boolean;
    vocabulary: boolean;
    assessmentEmphasis: "light" | "balanced" | "strong";
    supportLevel: "more-support" | "standard" | "extension";
    curriculumReference: string;
  };
  budget: { maxCostUsd: number };
  clarifications: { question: string; answer: string }[];
  /** Sources supplied by the editor (pasted text, uploaded files, fetched URLs). Full text lives in storage. */
  userSources: UserSourceRef[];
}

export interface UserSourceRef {
  id: string;
  title: string;
  authorOrOrganization: string;
  kind: "pasted" | "upload" | "url";
  url: string;
  publicationDate: string;
  storageKey: string;
  addedAt: string;
  licenceStatus: "unknown" | "read-only" | "quotable-short-excerpt" | "open-licence" | "public-domain" | "owned";
  chars: number;
}

export interface RevisionRow {
  id: string;
  projectId: string;
  number: number;
  kind: "generated" | "snapshot" | "approved" | "restored" | "regenerated";
  label: string;
  createdAt: string;
  approvedBy: string | null;
  doc: WorksheetDocument;
}

export type JobKind = "plan" | "build" | "regenerate-section";
export type JobStatus = "queued" | "running" | "awaiting-input" | "awaiting-budget" | "succeeded" | "failed" | "cancelled";

export interface JobRow {
  id: string;
  projectId: string;
  kind: JobKind;
  stage: string;
  status: JobStatus;
  attempts: number;
  input: Record<string, unknown>;
  /** Saved outputs of completed stages, so a failure later does not lose earlier work. */
  stages: Record<string, unknown>;
  providerMetadata: Record<string, unknown>;
  costEstimateUsd: number;
  actualUsage: { inputTokens: number; outputTokens: number; searches: number; costUsd: number };
  error: string | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExportRow {
  id: string;
  projectId: string;
  revisionId: string;
  kind: string;
  settings: Record<string, unknown>;
  filePath: string;
  sha256: string;
  draft: boolean;
  unresolved: { code: string; severity: string; message: string }[];
  createdAt: string;
}

export interface WorkbookRow {
  id: string;
  title: string;
  projectIds: string[];
  settings: { cumulativeReview: boolean; includeAnswerKey: boolean };
  createdAt: string;
  updatedAt: string;
}

export interface AssetRow {
  id: string;
  projectId: string;
  kind: "image" | "source-text";
  filename: string;
  mime: string;
  size: number;
  storageKey: string;
  rights: "owned" | "licensed" | "unknown";
  createdAt: string;
}

export interface DecisionRow {
  id: string;
  projectId: string;
  action: string;
  subject: string;
  reason: string;
  reviewer: string;
  createdAt: string;
}

const now = () => new Date().toISOString();

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE projects (
     id TEXT PRIMARY KEY, title TEXT NOT NULL, question TEXT NOT NULL, status TEXT NOT NULL,
     folder TEXT NOT NULL DEFAULT '', archived INTEGER NOT NULL DEFAULT 0, is_sample INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL, updated_at TEXT NOT NULL, current_revision_id TEXT,
     settings_json TEXT NOT NULL, draft_json TEXT, draft_version INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE revisions (
     id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     number INTEGER NOT NULL, kind TEXT NOT NULL, label TEXT NOT NULL, created_at TEXT NOT NULL,
     approved_by TEXT, doc_json TEXT NOT NULL);
   CREATE INDEX revisions_project ON revisions(project_id, number);
   CREATE TABLE jobs (
     id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     kind TEXT NOT NULL, stage TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
     input_json TEXT NOT NULL, stages_json TEXT NOT NULL, provider_json TEXT NOT NULL,
     cost_estimate REAL NOT NULL DEFAULT 0, usage_json TEXT NOT NULL, error TEXT, message TEXT,
     created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE INDEX jobs_project ON jobs(project_id, created_at);
   CREATE TABLE usage (
     id TEXT PRIMARY KEY, project_id TEXT NOT NULL, job_id TEXT, stage TEXT NOT NULL, model TEXT NOT NULL,
     input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL, searches INTEGER NOT NULL, cost_usd REAL NOT NULL,
     created_at TEXT NOT NULL);
   CREATE TABLE exports (
     id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, revision_id TEXT NOT NULL,
     kind TEXT NOT NULL, settings_json TEXT NOT NULL, file_path TEXT NOT NULL, sha256 TEXT NOT NULL,
     draft INTEGER NOT NULL, unresolved_json TEXT NOT NULL, created_at TEXT NOT NULL);
   CREATE TABLE workbooks (
     id TEXT PRIMARY KEY, title TEXT NOT NULL, project_ids_json TEXT NOT NULL, settings_json TEXT NOT NULL,
     created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE TABLE assets (
     id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, kind TEXT NOT NULL,
     filename TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, storage_key TEXT NOT NULL,
     rights TEXT NOT NULL, created_at TEXT NOT NULL);
   CREATE TABLE decisions (
     id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, action TEXT NOT NULL,
     subject TEXT NOT NULL, reason TEXT NOT NULL, reviewer TEXT NOT NULL, created_at TEXT NOT NULL);
   CREATE TABLE cache (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, created_at TEXT NOT NULL);`,
];

type Row = Record<string, unknown>;

export class SqliteStore {
  readonly db: DatabaseSync;

  constructor(file: string) {
    if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    this.migrate();
  }

  private migrate() {
    this.db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);");
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'schema'").get() as Row | undefined;
    let version = row ? Number(row.value) : 0;
    while (version < MIGRATIONS.length) {
      this.db.exec("BEGIN");
      try {
        this.db.exec(MIGRATIONS[version]);
        version++;
        this.db.prepare("INSERT INTO meta (key, value) VALUES ('schema', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(version));
        this.db.exec("COMMIT");
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
    }
  }

  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      this.db.exec("COMMIT");
      return out;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  // ------------------------------------------------------------ projects

  private toProject(r: Row): ProjectRow {
    return {
      id: String(r.id),
      title: String(r.title),
      question: String(r.question),
      status: r.status as ProjectStatus,
      folder: String(r.folder),
      archived: Boolean(r.archived),
      isSample: Boolean(r.is_sample),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
      currentRevisionId: (r.current_revision_id as string) ?? null,
      draftVersion: Number(r.draft_version),
      settings: JSON.parse(String(r.settings_json)),
      hasDraft: r.draft_json != null,
    };
  }

  createProject(input: { title: string; settings: ProjectSettings; folder?: string; isSample?: boolean; id?: string }): ProjectRow {
    const id = input.id ?? randomUUID();
    const t = now();
    this.db
      .prepare(
        "INSERT INTO projects (id, title, question, status, folder, archived, is_sample, created_at, updated_at, settings_json) VALUES (?, ?, ?, 'draft', ?, 0, ?, ?, ?, ?)",
      )
      .run(id, input.title, input.settings.question, input.folder ?? "", input.isSample ? 1 : 0, t, t, JSON.stringify(input.settings));
    return this.getProject(id)!;
  }

  getProject(id: string): ProjectRow | null {
    const r = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Row | undefined;
    return r ? this.toProject(r) : null;
  }

  listProjects(filter: { search?: string; status?: string; folder?: string; includeArchived?: boolean } = {}): ProjectRow[] {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (!filter.includeArchived) where.push("archived = 0");
    if (filter.status) {
      where.push("status = ?");
      args.push(filter.status);
    }
    if (filter.folder) {
      where.push("folder = ?");
      args.push(filter.folder);
    }
    if (filter.search) {
      where.push("(title LIKE ? ESCAPE '\\' OR question LIKE ? ESCAPE '\\')");
      const like = `%${filter.search.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
      args.push(like, like);
    }
    const sql = `SELECT * FROM projects ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY updated_at DESC LIMIT 500`;
    return (this.db.prepare(sql).all(...args) as Row[]).map((r) => this.toProject(r));
  }

  updateProject(id: string, patch: Partial<Pick<ProjectRow, "title" | "status" | "folder" | "archived" | "settings" | "currentRevisionId">>) {
    const p = this.getProject(id);
    if (!p) throw new Error("Project not found");
    const next = { ...p, ...patch };
    this.db
      .prepare("UPDATE projects SET title = ?, question = ?, status = ?, folder = ?, archived = ?, settings_json = ?, current_revision_id = ?, updated_at = ? WHERE id = ?")
      .run(next.title, next.settings.question, next.status, next.folder, next.archived ? 1 : 0, JSON.stringify(next.settings), next.currentRevisionId, now(), id);
    return this.getProject(id)!;
  }

  deleteProject(id: string) {
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    this.db.prepare("DELETE FROM usage WHERE project_id = ?").run(id);
  }

  folders(): string[] {
    return (this.db.prepare("SELECT DISTINCT folder FROM projects WHERE folder != '' ORDER BY folder").all() as Row[]).map((r) => String(r.folder));
  }

  // ------------------------------------------------------------ working draft

  getDraft(projectId: string): { doc: WorksheetDocument; version: number } | null {
    const r = this.db.prepare("SELECT draft_json, draft_version FROM projects WHERE id = ?").get(projectId) as Row | undefined;
    if (!r || r.draft_json == null) return null;
    return { doc: JSON.parse(String(r.draft_json)), version: Number(r.draft_version) };
  }

  /**
   * Optimistic-concurrency save. Returns the new version, or null when the
   * caller's base version is stale (another tab or job wrote first).
   */
  saveDraft(projectId: string, doc: WorksheetDocument, baseVersion: number | null): number | null {
    const res = this.db
      .prepare(
        `UPDATE projects SET draft_json = ?, draft_version = draft_version + 1, updated_at = ?,
         status = CASE WHEN status IN ('approved','exported') THEN 'needs-review' ELSE status END
         WHERE id = ? ${baseVersion === null ? "" : "AND draft_version = ?"}`,
      )
      .run(...([JSON.stringify(doc), now(), projectId, ...(baseVersion === null ? [] : [baseVersion])] as (string | number)[]));
    if (Number(res.changes) === 0) return null;
    return this.getDraft(projectId)!.version;
  }

  // ------------------------------------------------------------ revisions

  private toRevision(r: Row): RevisionRow {
    return {
      id: String(r.id),
      projectId: String(r.project_id),
      number: Number(r.number),
      kind: r.kind as RevisionRow["kind"],
      label: String(r.label),
      createdAt: String(r.created_at),
      approvedBy: (r.approved_by as string) ?? null,
      doc: JSON.parse(String(r.doc_json)),
    };
  }

  createRevision(projectId: string, doc: WorksheetDocument, kind: RevisionRow["kind"], label: string, approvedBy: string | null = null): RevisionRow {
    const id = randomUUID();
    const row = this.db.prepare("SELECT COALESCE(MAX(number), 0) AS n FROM revisions WHERE project_id = ?").get(projectId) as Row;
    const number = Number(row.n) + 1;
    this.db
      .prepare("INSERT INTO revisions (id, project_id, number, kind, label, created_at, approved_by, doc_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, projectId, number, kind, label, now(), approvedBy, JSON.stringify(doc));
    this.db.prepare("UPDATE projects SET current_revision_id = ?, updated_at = ? WHERE id = ?").run(id, now(), projectId);
    return this.getRevision(id)!;
  }

  getRevision(id: string): RevisionRow | null {
    const r = this.db.prepare("SELECT * FROM revisions WHERE id = ?").get(id) as Row | undefined;
    return r ? this.toRevision(r) : null;
  }

  listRevisions(projectId: string): Omit<RevisionRow, "doc">[] {
    return (this.db.prepare("SELECT id, project_id, number, kind, label, created_at, approved_by, '{}' AS doc_json FROM revisions WHERE project_id = ? ORDER BY number DESC").all(projectId) as Row[]).map((r) => {
      const { doc: _doc, ...rest } = this.toRevision(r);
      void _doc;
      return rest;
    });
  }

  latestApproved(projectId: string): RevisionRow | null {
    const r = this.db.prepare("SELECT * FROM revisions WHERE project_id = ? AND kind = 'approved' ORDER BY number DESC LIMIT 1").get(projectId) as Row | undefined;
    return r ? this.toRevision(r) : null;
  }

  // ------------------------------------------------------------ jobs

  private toJob(r: Row): JobRow {
    return {
      id: String(r.id),
      projectId: String(r.project_id),
      kind: r.kind as JobKind,
      stage: String(r.stage),
      status: r.status as JobStatus,
      attempts: Number(r.attempts),
      input: JSON.parse(String(r.input_json)),
      stages: JSON.parse(String(r.stages_json)),
      providerMetadata: JSON.parse(String(r.provider_json)),
      costEstimateUsd: Number(r.cost_estimate),
      actualUsage: JSON.parse(String(r.usage_json)),
      error: (r.error as string) ?? null,
      message: (r.message as string) ?? null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  createJob(projectId: string, kind: JobKind, input: Record<string, unknown>, stages: Record<string, unknown> = {}): JobRow {
    const id = randomUUID();
    const t = now();
    this.db
      .prepare("INSERT INTO jobs (id, project_id, kind, stage, status, attempts, input_json, stages_json, provider_json, cost_estimate, usage_json, created_at, updated_at) VALUES (?, ?, ?, 'queued', 'queued', 0, ?, ?, '{}', 0, ?, ?, ?)")
      .run(id, projectId, kind, JSON.stringify(input), JSON.stringify(stages), JSON.stringify({ inputTokens: 0, outputTokens: 0, searches: 0, costUsd: 0 }), t, t);
    return this.getJob(id)!;
  }

  getJob(id: string): JobRow | null {
    const r = this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Row | undefined;
    return r ? this.toJob(r) : null;
  }

  activeJob(projectId: string): JobRow | null {
    const r = this.db.prepare("SELECT * FROM jobs WHERE project_id = ? AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1").get(projectId) as Row | undefined;
    return r ? this.toJob(r) : null;
  }

  latestJob(projectId: string, kind?: JobKind): JobRow | null {
    const r = (kind
      ? this.db.prepare("SELECT * FROM jobs WHERE project_id = ? AND kind = ? ORDER BY created_at DESC LIMIT 1").get(projectId, kind)
      : this.db.prepare("SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1").get(projectId)) as Row | undefined;
    return r ? this.toJob(r) : null;
  }

  updateJob(id: string, patch: Partial<Omit<JobRow, "id" | "projectId" | "kind" | "createdAt">>) {
    const j = this.getJob(id);
    if (!j) throw new Error("Job not found");
    const n = { ...j, ...patch };
    this.db
      .prepare("UPDATE jobs SET stage = ?, status = ?, attempts = ?, input_json = ?, stages_json = ?, provider_json = ?, cost_estimate = ?, usage_json = ?, error = ?, message = ?, updated_at = ? WHERE id = ?")
      .run(n.stage, n.status, n.attempts, JSON.stringify(n.input), JSON.stringify(n.stages), JSON.stringify(n.providerMetadata), n.costEstimateUsd, JSON.stringify(n.actualUsage), n.error, n.message, now(), id);
    return this.getJob(id)!;
  }

  /** Jobs left 'running' by a crashed process. */
  staleRunningJobs(): JobRow[] {
    return (this.db.prepare("SELECT * FROM jobs WHERE status IN ('running','queued')").all() as Row[]).map((r) => this.toJob(r));
  }

  // ------------------------------------------------------------ usage

  recordUsage(u: { projectId: string; jobId: string | null; stage: string; model: string; inputTokens: number; outputTokens: number; searches: number; costUsd: number }) {
    this.db
      .prepare("INSERT INTO usage (id, project_id, job_id, stage, model, input_tokens, output_tokens, searches, cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), u.projectId, u.jobId, u.stage, u.model, u.inputTokens, u.outputTokens, u.searches, u.costUsd, now());
  }

  projectUsage(projectId: string) {
    const r = this.db
      .prepare("SELECT COALESCE(SUM(input_tokens),0) AS i, COALESCE(SUM(output_tokens),0) AS o, COALESCE(SUM(searches),0) AS s, COALESCE(SUM(cost_usd),0) AS c, COUNT(*) AS calls FROM usage WHERE project_id = ?")
      .get(projectId) as Row;
    return { inputTokens: Number(r.i), outputTokens: Number(r.o), searches: Number(r.s), costUsd: Number(r.c), calls: Number(r.calls) };
  }

  // ------------------------------------------------------------ exports

  createExport(e: Omit<ExportRow, "id" | "createdAt">): ExportRow {
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO exports (id, project_id, revision_id, kind, settings_json, file_path, sha256, draft, unresolved_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, e.projectId, e.revisionId, e.kind, JSON.stringify(e.settings), e.filePath, e.sha256, e.draft ? 1 : 0, JSON.stringify(e.unresolved), now());
    return this.getExport(id)!;
  }

  getExport(id: string): ExportRow | null {
    const r = this.db.prepare("SELECT * FROM exports WHERE id = ?").get(id) as Row | undefined;
    if (!r) return null;
    return {
      id: String(r.id),
      projectId: String(r.project_id),
      revisionId: String(r.revision_id),
      kind: String(r.kind),
      settings: JSON.parse(String(r.settings_json)),
      filePath: String(r.file_path),
      sha256: String(r.sha256),
      draft: Boolean(r.draft),
      unresolved: JSON.parse(String(r.unresolved_json)),
      createdAt: String(r.created_at),
    };
  }

  listExports(projectId: string): ExportRow[] {
    return (this.db.prepare("SELECT id FROM exports WHERE project_id = ? ORDER BY created_at DESC LIMIT 100").all(projectId) as Row[]).map((r) => this.getExport(String(r.id))!);
  }

  // ------------------------------------------------------------ workbooks

  private toWorkbook(r: Row): WorkbookRow {
    return {
      id: String(r.id),
      title: String(r.title),
      projectIds: JSON.parse(String(r.project_ids_json)),
      settings: JSON.parse(String(r.settings_json)),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  createWorkbook(title: string, projectIds: string[], settings: WorkbookRow["settings"]): WorkbookRow {
    const id = randomUUID();
    const t = now();
    this.db.prepare("INSERT INTO workbooks (id, title, project_ids_json, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, title, JSON.stringify(projectIds), JSON.stringify(settings), t, t);
    return this.getWorkbook(id)!;
  }

  getWorkbook(id: string): WorkbookRow | null {
    const r = this.db.prepare("SELECT * FROM workbooks WHERE id = ?").get(id) as Row | undefined;
    return r ? this.toWorkbook(r) : null;
  }

  listWorkbooks(): WorkbookRow[] {
    return (this.db.prepare("SELECT * FROM workbooks ORDER BY updated_at DESC").all() as Row[]).map((r) => this.toWorkbook(r));
  }

  updateWorkbook(id: string, patch: Partial<Pick<WorkbookRow, "title" | "projectIds" | "settings">>) {
    const w = this.getWorkbook(id);
    if (!w) throw new Error("Workbook not found");
    const n = { ...w, ...patch };
    this.db.prepare("UPDATE workbooks SET title = ?, project_ids_json = ?, settings_json = ?, updated_at = ? WHERE id = ?").run(n.title, JSON.stringify(n.projectIds), JSON.stringify(n.settings), now(), id);
    return this.getWorkbook(id)!;
  }

  deleteWorkbook(id: string) {
    this.db.prepare("DELETE FROM workbooks WHERE id = ?").run(id);
  }

  // ------------------------------------------------------------ assets

  createAsset(a: Omit<AssetRow, "id" | "createdAt">): AssetRow {
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO assets (id, project_id, kind, filename, mime, size, storage_key, rights, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, a.projectId, a.kind, a.filename, a.mime, a.size, a.storageKey, a.rights, now());
    return this.getAsset(id)!;
  }

  getAsset(id: string): AssetRow | null {
    const r = this.db.prepare("SELECT * FROM assets WHERE id = ?").get(id) as Row | undefined;
    if (!r) return null;
    return {
      id: String(r.id),
      projectId: String(r.project_id),
      kind: r.kind as AssetRow["kind"],
      filename: String(r.filename),
      mime: String(r.mime),
      size: Number(r.size),
      storageKey: String(r.storage_key),
      rights: r.rights as AssetRow["rights"],
      createdAt: String(r.created_at),
    };
  }

  listAssets(projectId: string): AssetRow[] {
    return (this.db.prepare("SELECT id FROM assets WHERE project_id = ? ORDER BY created_at").all(projectId) as Row[]).map((r) => this.getAsset(String(r.id))!);
  }

  deleteAsset(id: string) {
    this.db.prepare("DELETE FROM assets WHERE id = ?").run(id);
  }

  // ------------------------------------------------------------ decisions (audit)

  recordDecision(d: Omit<DecisionRow, "id" | "createdAt">) {
    this.db.prepare("INSERT INTO decisions (id, project_id, action, subject, reason, reviewer, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(randomUUID(), d.projectId, d.action, d.subject, d.reason, d.reviewer, now());
  }

  listDecisions(projectId: string): DecisionRow[] {
    return (this.db.prepare("SELECT * FROM decisions WHERE project_id = ? ORDER BY created_at DESC").all(projectId) as Row[]).map((r) => ({
      id: String(r.id),
      projectId: String(r.project_id),
      action: String(r.action),
      subject: String(r.subject),
      reason: String(r.reason),
      reviewer: String(r.reviewer),
      createdAt: String(r.created_at),
    }));
  }

  // ------------------------------------------------------------ cache

  cacheGet<T>(key: string): T | null {
    const r = this.db.prepare("SELECT value_json FROM cache WHERE key = ?").get(key) as Row | undefined;
    return r ? (JSON.parse(String(r.value_json)) as T) : null;
  }

  cacheSet(key: string, value: unknown) {
    this.db.prepare("INSERT INTO cache (key, value_json, created_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, created_at = excluded.created_at").run(key, JSON.stringify(value), now());
  }

  close() {
    this.db.close();
  }
}

export type Store = SqliteStore;
