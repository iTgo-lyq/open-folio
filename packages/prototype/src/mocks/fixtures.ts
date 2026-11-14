import type {
  ChangeGroup,
  ChangeState,
  DocumentRef,
  PreviewDescriptor,
  Workbench,
} from "../../../../src/lib/model";
import type { PrototypeCatalog } from "../../../../src/lib/prototypes";
import type { PersonalSession } from "../../../../src/components/personal-context";
import type { DiscoveredRepository } from "../../../../src/server/discovery";
import type { PublicPreview } from "../../../../src/server/public-previews";

export const revision = "a".repeat(40);
export const timestamp = "2026-11-01T09:00:00Z";
export const identity = {
  providerId: "github",
  instanceId: "github.com",
  subjectId: "demo-lin",
  login: "demo-lin",
  displayName: "林（虚构）",
};
export const repository = {
  providerId: "github",
  instanceId: "github.com",
  repositoryId: "demo-atlas",
  fullName: "demo/atlas",
  displayName: "Atlas 旅行应用（虚构）",
  webUrl: "https://example.invalid/demo/atlas",
  cloneUrl: "https://example.invalid/demo/atlas.git",
  defaultBranch: "main",
};
export const repositories: DiscoveredRepository[] = [
  { key: "atlas", repository, state: "ready", integrationBranch: "develop" },
  {
    key: "notes",
    repository: {
      ...repository,
      repositoryId: "demo-notes",
      fullName: "demo/notes",
      displayName: "旅行笔记（虚构）",
    },
    state: "attention",
    message: "尚未找到集成分支，请核对配置。",
    integrationBranch: "develop",
  },
];
export function initialSession(): PersonalSession {
  return {
    authenticated: true,
    connected: true,
    account: { id: "demo-account", username: "demo-lin" },
    deviceSessionId: "demo-browser",
    browserRevision: 1,
    selectionRevision: 1,
    connections: [
      { id: "demo-token", identity, label: "演示 Token", revision: 1 },
    ],
    workspace: {
      id: "demo-token",
      identity,
      label: "演示 Token",
      gitUsername: "demo-lin",
      preferences: { railCollapsed: false },
    },
    providers: [],
  };
}
export const thumbnail = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600"><rect width="960" height="600" fill="#e5ede7"/><rect x="80" y="80" width="800" height="440" rx="24" fill="#fff"/><text x="120" y="165" font-size="36" fill="#264d3b">Atlas · 虚构行程</text><path d="M120 240h500M120 300h620M120 360h420" stroke="#c1d5c7" stroke-width="24"/><circle cx="785" cy="430" r="30" fill="#a8502c"/></svg>')}`;
export const preview: PublicPreview = {
  schemaVersion: 1,
  id: "b".repeat(64),
  title: "Atlas 行程表单（虚构）",
  kind: "page",
  devices: ["pc-web", "ipad", "mobile"],
  revision,
  digest: `sha256:${"c".repeat(64)}`,
  type: "hosted",
  url: "https://example.invalid/mock-preview",
  files: {},
  thumbnails: ["pc-web", "ipad", "mobile"].map((device) => ({
    device: device as "pc-web" | "ipad" | "mobile",
    url: thumbnail,
  })),
};
const entry = {
  id: "atlas-form",
  title: preview.title,
  kind: "page" as const,
  devices: preview.devices,
  sourcePath: "packages/prototype/src/pages/quiet-public.tsx",
  description: "演示行程表单，资源由原型包内存 mock 提供。",
  artifact: {
    type: "hosted" as const,
    version: "demo-version",
    url: preview.url!,
    sourceCommit: revision,
    digest: preview.digest,
    thumbnails: preview.thumbnails,
  },
};
const policy = { status: "enabled" as const, branch: "develop", message: "" };
export const catalog: PrototypeCatalog = {
  snapshotId: "demo-snapshot",
  revision,
  policy,
  items: [entry],
  issues: [],
};
export const descriptor: PreviewDescriptor = {
  changeId: "offline-map",
  revision,
  pinned: false,
  policy,
  entries: [
    { ...entry, url: preview.url, available: true, sourceAvailable: true },
  ],
};
export const bodies: Record<string, string> = {};
function document(id: string, title: string, path: string): DocumentRef {
  bodies[id] =
    `# ${title}\n\n这是一份原型专用的虚构材料，所有状态仅在本页内存中运行。\n\n## 使用场景\n\n出发前下载地图，在没有网络时仍可查看行程。\n\n## 验收要点\n\n- 可以选择离线区域。\n- 下载失败时保留已完成内容。\n- 不上传位置或真实凭据。\n\n## 相关说明\n\n| 状态 | 行为 |\n| --- | --- |\n| 就绪 | 可阅读 |\n| 离线 | 保留内容 |\n`;
  return {
    id,
    title,
    path,
    branch: "develop",
    commit: revision,
    blob: revision,
    bytes: bodies[id].length,
    kind: "markdown",
    readable: true,
    diagnostics: [],
    headings: [
      { id: "使用场景", text: "使用场景", depth: 2, line: 5 },
      { id: "验收要点", text: "验收要点", depth: 2, line: 9 },
      { id: "相关说明", text: "相关说明", depth: 2, line: 15 },
    ],
  };
}
const spec = document(
  "spec-map",
  "离线地图",
  "docs/project/specs/travel/offline-map/spec.md",
);
const secondSpec = document(
  "spec-plan",
  "行程规划",
  "docs/project/specs/travel/planning/spec.md",
);
const documents = [spec, secondSpec];
const scenarios = [
  ["offline-map", "支持离线地图", "confirmation"],
  ["trip-notes", "为行程添加旅行笔记", "doing"],
  ["map-download", "修复地图下载失败", "blocked"],
  ["trip-template", "从历史行程生成模板", "pause"],
  ["share-trip", "分享只读行程", "completed"],
  ["released-trip", "已发布的行程规划", "archived"],
  ["old-export", "旧版行程导出", "cancelled"],
] as const;
const changes: ChangeGroup[] = scenarios.map(([id, title, scenario]) => {
  const completed = scenario === "completed" || scenario === "archived";
  const directory = completed
    ? `docs/project/archive/2026-11-01-${id}`
    : `docs/project/changes/${id}`;
  const materials = ["requirement", "technical", "plan"].map((name) =>
    document(`${id}-${name}`, `${title} · ${name}`, `${directory}/${name}.md`),
  );
  documents.push(...materials);
  const state: ChangeState = {
    schemaVersion: 1 as const,
    id,
    title,
    size: "medium" as const,
    types: [scenario === "blocked" ? "修复" : "新功能"],
    urgency: scenario === "blocked" ? ("high" as const) : ("normal" as const),
    status: completed
      ? "completed"
      : scenario === "cancelled"
        ? "cancelled"
        : "active",
    stage: completed
      ? "close"
      : scenario === "pause"
        ? "requirement"
        : "execution",
    branch: `change/${id}`,
    confirmations: {},
    closure: completed
      ? {
          verification: {
            result: "passed",
            at: timestamp,
            summary: "虚构检查通过",
          },
          acceptance: {
            result: "accepted",
            at: timestamp,
            summary: "虚构验收记录",
          },
          specs: {
            result: "synced",
            at: timestamp,
            summary: "虚构能力同步记录",
          },
          archive: {
            result: "done",
            at: timestamp,
            summary: "虚构归档记录",
            path: directory,
          },
        }
      : {},
    tasks:
      scenario === "pause"
        ? {}
        : {
            T1: {
              title: "实现离线阅读",
              status: completed
                ? "done"
                : scenario === "blocked"
                  ? "blocked"
                  : "doing",
              ...(scenario === "blocked"
                ? { reason: "等待地图数据接口恢复。" }
                : {}),
            },
          },
    ...(scenario === "confirmation" || scenario === "pause"
      ? {
          waitingFor: {
            kind: scenario,
            summary:
              scenario === "pause"
                ? "需求已记录，待下一轮排期恢复。"
                : "等待确认离线区域方案。",
          },
        }
      : {}),
    previews: [entry],
  };
  const json = document(
    `${id}-state`,
    "Change 状态",
    `${directory}/change.json`,
  );
  json.kind = "json";
  bodies[json.id] = JSON.stringify(state, null, 2);
  documents.push(json);
  const candidate = {
    key: id,
    id,
    title,
    branch: state.branch,
    commit: revision,
    directory,
    archived: completed,
    jsonDocumentId: json.id,
    documentIds: [...materials.map((item) => item.id), json.id],
    state,
    diagnostics: [],
    validCompleted: completed,
    taskGraph: {
      status: "valid" as const,
      source: "default" as const,
      edges: { T1: [] },
      diagnostics: [],
    },
    relatedSpecs: ["travel/offline-map"],
    specReferences: [],
  };
  return {
    id,
    title,
    primary: id,
    candidates: [candidate],
    diagnostics: [],
    relations: [],
    creator: {
      name: "林（虚构）",
      login: "demo-lin",
      subjectId: identity.subjectId,
    },
    collaborators: [
      { name: "林（虚构）", login: "demo-lin", subjectId: identity.subjectId },
      { name: "陈（虚构）", login: "demo-chen" },
    ],
    createdAt: timestamp,
  };
});
export function makeWorkbench(empty = false): Workbench {
  return {
    cacheSchemaVersion: 11,
    id: "demo-snapshot",
    projectId: "atlas",
    fingerprint: revision,
    capturedAt: timestamp,
    selectedBranch: "develop",
    projectName: repository.displayName,
    integrationBranch: "develop",
    specBranch: "develop",
    releaseBranch: "main",
    branches: [{ name: "develop", commit: revision }],
    documents,
    specs: empty
      ? []
      : [
          {
            id: "travel/offline-map",
            title: spec.title,
            branch: "develop",
            documentId: spec.id,
          },
          {
            id: "travel/planning",
            title: secondSpec.title,
            branch: "develop",
            documentId: secondSpec.id,
          },
        ],
    changes: empty ? [] : changes,
    diagnostics: [],
    sourceDiagnostics: [],
    routes: [],
    deliveryByChange: {
      "released-trip": {
        stage: "releaseMerged",
        changePrs: [],
        releasePrs: [],
        stale: false,
        diagnostics: [],
      },
    },
    integrations: {
      version: 1,
      tip: revision,
      complete: true,
      records: {},
      issues: [],
    },
    prototype: policy,
    currentPrototype: {
      revision,
      packagePath: "packages/prototype",
      entries: empty ? [] : [entry],
      issues: [],
    },
  };
}
