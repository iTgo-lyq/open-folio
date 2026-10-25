export type {
  IntegrationIndex,
  IntegrationRecord,
  IntegrationResult,
} from "../../.agents/skills/spec-trail/scripts/integration-records.mjs";
import type { IntegrationIndex } from "../../.agents/skills/spec-trail/scripts/integration-records.mjs";
export type Diagnostic = {
  code: string;
  message: string;
  path?: string;
  line?: number;
  severity: "error" | "warning";
};
export type Heading = { id: string; text: string; depth: number; line: number };
export type DocumentRef = {
  id: string;
  branch: string;
  commit: string;
  path: string;
  blob: string;
  bytes: number;
  kind: "markdown" | "json" | "image" | "unsupported";
  title: string;
  headings: Heading[];
  readable: boolean;
  mime?: string;
  diagnostics: Diagnostic[];
};
export type Branch = { name: string; commit: string };
export type ProjectConfig = {
  id: string;
  name: string;
  repositoryUrl: string;
  integrationBranch: string;
};
export type Limits = {
  refreshMs: number;
  markdownBytes: number;
  jsonBytes: number;
  imageBytes: number;
  branches: number;
  documents: number;
  totalBytes: number;
  previewBytes: number;
  previewTotalBytes: number;
  previewEntries: number;
};
export const DEFAULT_LIMITS: Limits = {
  refreshMs: 120_000,
  markdownBytes: 1024 * 1024,
  jsonBytes: 256 * 1024,
  imageBytes: 5 * 1024 * 1024,
  branches: 256,
  documents: 10_000,
  totalBytes: 64 * 1024 * 1024,
  previewBytes: 10 * 1024 * 1024,
  previewTotalBytes: 100 * 1024 * 1024,
  previewEntries: 2000,
};
export const AUTO_REFRESH_MS = 60_000;
export type AppConfig = {
  schemaVersion: 2;
  limits?: Partial<Limits>;
};
export type ConfigSnapshot = {
  config: AppConfig;
  revision: string;
  path: string;
  defaults: Limits;
};
export type SpecRef = {
  id: string;
  title: string;
  branch: string;
  documentId: string;
};
export type Confirmation = { at: string; summary: string; source?: string };
export type Task = {
  title: string;
  status: "todo" | "doing" | "done" | "blocked";
  branch?: string;
  reason?: string;
  verification?: string;
  commitTitle?: string;
};
export type ClosureStep = {
  result: string;
  at: string;
  summary: string;
  source?: string;
  path?: string;
};
export type PrototypeConfig = {
  status: "disabled" | "pending" | "enabled";
  packagePath?: string;
  hosting?: { provider: "openfolio" | "custom" | "git"; uploadUrl?: string };
};
export type Device = "pc-web" | "ipad" | "mobile";
export type PreviewThumbnail = { device?: Device; url: string };
export type PreviewArtifact =
  | {
      type: "hosted";
      version: string;
      url: string;
      sourceCommit: string;
      digest: string;
      thumbnails?: PreviewThumbnail[];
    }
  | { type: "git"; path: string; sourceCommit: string };
export type PreviewEntry = {
  id: string;
  title: string;
  artifact?: PreviewArtifact;
  kind: "page" | "component";
  devices?: Device[];
  viewport?: { width: number; height: number };
};
export type Clarification = {
  round: number;
  question: string;
  recommendation: string;
  answer?: string;
  source?: string;
  withdrawn?: string;
};
export type ChangeState = {
  schemaVersion: 1;
  id: string;
  title: string;
  size: "small" | "medium" | "large" | "xlarge";
  types?: string[];
  urgency?: "urgent" | "high" | "normal" | "low";
  deliveryOverride?: "releaseMerged";
  status: "active" | "completed" | "cancelled";
  stage: "requirement" | "technical" | "plan" | "execution" | "close";
  branch: string;
  previews?: PreviewEntry[];
  clarifications?: Record<`Q${number}`, Clarification>;
  dependsOn?: string[];
  followUpOf?: string;
  followUpTitle?: string;
  parent?: string;
  children?: string[];
  confirmations: Partial<
    Record<"requirement" | "technical" | "plan", Confirmation>
  > & {
    merge?: Confirmation & {
      sourceCommit?: string;
      targetCommit?: string;
      baseCommit?: string;
    };
  };
  tasks: Record<string, Task>;
  waitingFor?: {
    kind: "confirmation" | "dependency" | "pause";
    summary: string;
  };
  rework?: { at: string; reason: string; approach: string };
  closure: Partial<
    Record<"verification" | "acceptance" | "specs" | "archive", ClosureStep>
  >;
  cancellation?: { at: string; reason: string };
};
export type TaskGraph = {
  status: "valid" | "missing" | "invalid" | "not-applicable";
  source?: "default" | "plan";
  edges: Record<string, string[]>;
  diagnostics: Diagnostic[];
  documentId?: string;
  line?: number;
};
export type ChangeCandidate = {
  key: string;
  id: string;
  owner?: string;
  title: string;
  branch: string;
  commit: string;
  directory: string;
  archived: boolean;
  jsonDocumentId: string;
  documentIds: string[];
  state: ChangeState | null;
  diagnostics: Diagnostic[];
  validCompleted: boolean;
  taskGraph: TaskGraph;
  relatedSpecs: string[];
  specReferences: { specId: string; documentId: string; line: number }[];
};
export type Relation = {
  kind: "dependency" | "child" | "parent";
  target: string;
  exists: boolean;
  pendingCreation?: boolean;
  process: "satisfied" | "unsatisfied" | "unknown";
  ancestry: "found" | "unknown";
  diagnostics: string[];
};
/** Change 首次提交的作者：显示名，GitHub 隐私邮箱可识别时附登录名；不含邮箱。 */
export type ChangeCreator = {
  name: string;
  login?: string;
  subjectId?: string;
};
export type ChangeGroup = {
  /** First Git commit time, absent when history cannot establish it. */
  createdAt?: string;
  /** Author of that first commit, absent with createdAt. */
  creator?: ChangeCreator;
  source?: {
    entryBranch: string;
    entryPath: string;
    entryCommit: string;
    recordBranch: string | null;
  };
  id: string;
  title: string;
  primary: string | null;
  candidates: ChangeCandidate[];
  diagnostics: Diagnostic[];
  relations: Relation[];
};
export type CurrentPrototypeEntry = PreviewEntry & {
  sourcePath: string;
  description?: string;
};
export type CurrentPrototype = {
  manifestBytes?: number;
  configuration?: PrototypeConfig;
  revision: string | null;
  packagePath?: string;
  entries: CurrentPrototypeEntry[];
  issues: string[];
  message?: string;
};
export type ChangeRoute = {
  id: string;
  entryPath: string;
  branch: string | null;
  kind: "planning" | "target" | "archive" | "invalid";
  errors: string[];
};
export type PullRequest = {
  number: number;
  title: string;
  url: string;
  state: "open" | "closed" | "merged";
  draft: boolean;
  base: { repositoryId: string; branch: string; commit: string };
  head: { repositoryId: string | null; branch: string; commit: string };
  mergeCommit: string | null;
  updatedAt: string;
  version?: string;
};
export type Delivery = {
  stage?: "pendingIntegration" | "pendingRelease" | "releaseMerged" | "unknown";
  changePrs: PullRequest[];
  releasePrs: PullRequest[];
  diagnostics: string[];
  stale: boolean;
  changePrsStale?: boolean;
  releasePrsStale?: boolean;
};
export type ReleaseSource = {
  branch: string | null;
  commit: string | null;
  message?: string;
};
export type Snapshot = {
  cacheSchemaVersion: 9;
  releaseSource?: ReleaseSource;
  deliveryByChange?: Record<string, Delivery>;
  integrations: IntegrationIndex;
  integrationBranch: string | null;
  routes: ChangeRoute[];
  sourceDiagnostics: Diagnostic[];
  scanFingerprint?: string;
  currentPrototype: CurrentPrototype;
  prototype: {
    status: "unconfigured" | "disabled" | "pending" | "enabled" | "invalid";
    branch: string | null;
    commit?: string;
    message: string;
  };
  id: string;
  projectId: string;
  fingerprint: string;
  capturedAt: string;
  specBranch: string | null;
  releaseBranch: string | null;
  branches: Branch[];
  documents: DocumentRef[];
  specs: SpecRef[];
  changes: ChangeGroup[];
  diagnostics: Diagnostic[];
};
export type ProjectSummary = {
  locked?: boolean;
  id: string;
  name: string;
  snapshotId?: string;
  capturedAt?: string;
  integrationBranch?: string | null;
  lastError?: string;
};
export type Workbench = Snapshot & {
  deliveryLastSuccess?: string;
  selectedBranch: string | null;
  projectName: string;
};
export const STAGES = [
  "requirement",
  "technical",
  "plan",
  "execution",
  "close",
] as const;
export const STAGE_LABELS: Record<ChangeState["stage"], string> = {
  requirement: "需求",
  technical: "技术方案",
  plan: "计划",
  execution: "执行",
  close: "验收",
};
export const STATUS_LABELS = {
  active: "进行中",
  completed: "已完成",
  cancelled: "已取消",
};
export const TASK_LABELS = {
  todo: "待开始",
  doing: "进行中",
  done: "已完成",
  blocked: "已阻塞",
};
export const WAIT_LABELS = {
  confirmation: "等待确认",
  dependency: "等待依赖",
  pause: "已暂停",
};
export const primaryRecord = (g: ChangeGroup) =>
  g.candidates.find((c) => c.key === g.primary) ?? null;

export type PreviewDescriptor = {
  changeId: string;
  revision: string | null;
  pinned: boolean;
  policy: Snapshot["prototype"];
  message?: string;
  failed?: boolean;
  entries: (PreviewEntry & {
    available: boolean;
    message?: string;
    bytes?: number;
    blob?: string;
    url?: string;
    thumbnails?: PreviewThumbnail[];
    sourceAvailable?: boolean;
  })[];
};
