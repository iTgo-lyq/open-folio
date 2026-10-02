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
  specBranch?: string;
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
export type AppConfig = {
  schemaVersion: 1;
  projects: ProjectConfig[];
  allowedOrigins?: string[];
  limits?: Partial<Limits>;
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
  decision: Confirmation;
};
export type Device = "pc-web" | "ipad" | "mobile";
export type PreviewEntry = {
  id: string;
  title: string;
  path: string;
  kind: "page" | "component";
  devices?: Device[];
  viewport?: { width: number; height: number };
};
export type ChangeState = {
  schemaVersion: 1;
  id: string;
  title: string;
  size: "small" | "medium" | "large" | "xlarge";
  status: "active" | "completed" | "cancelled";
  stage: "requirement" | "technical" | "plan" | "execution" | "close";
  branch: string;
  previews?: PreviewEntry[];
  dependsOn?: string[];
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
  process: "satisfied" | "unsatisfied" | "unknown";
  ancestry: "found" | "unknown";
  diagnostics: string[];
};
export type ChangeGroup = {
  id: string;
  title: string;
  primary: string | null;
  candidates: ChangeCandidate[];
  diagnostics: Diagnostic[];
  relations: Relation[];
};
export type Snapshot = {
  cacheSchemaVersion: 2;
  archiveRefs: { id: string; commit: string }[];
  archivePins: Record<string, string>;
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
  defaultBranch: string | null;
  specBranch: string | null;
  protectedBranches: string[];
  branches: Branch[];
  documents: DocumentRef[];
  specs: SpecRef[];
  changes: ChangeGroup[];
  diagnostics: Diagnostic[];
};
export type ProjectSummary = {
  id: string;
  name: string;
  snapshotId?: string;
  capturedAt?: string;
  defaultBranch?: string | null;
  lastError?: string;
};
export type Workbench = Snapshot & {
  selectedBranch: string | null;
  projectName: string;
};
export type SearchResult = {
  documentId?: string;
  changeId?: string;
  taskId?: string;
  title: string;
  path: string;
  excerpt: string;
  branch: string;
  specId?: string;
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
  entries: (PreviewEntry & {
    available: boolean;
    message?: string;
    bytes?: number;
    url?: string;
  })[];
};
