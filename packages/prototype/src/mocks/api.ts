import {
  defaultRepositoryViews,
  saveViewsSchema,
  selectViewSchema,
} from "../../../../src/lib/change-views.ts";
import {
  catalog,
  descriptor,
  initialSession,
  preview,
  repositories,
} from "./fixtures.ts";

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
let session = initialSession();
let views = defaultRepositoryViews();
let scene = "default";
let nextToken = 2;
export function resetMock(next: string, module = "") {
  scene = next;
  session = initialSession();
  views = defaultRepositoryViews();
  nextToken = 2;
  if (next === "login")
    session = {
      ...session,
      authenticated: false,
      connected: false,
      workspace: undefined,
    };
  // 未绑定 Token 时业务只显示个人页；阅读模块的空态保持连接、仅清空数据。
  if (next === "empty" && ["home", "connections"].includes(module))
    session = {
      ...session,
      connections: [],
      connected: false,
      workspace: undefined,
    };
}
export const readSession = () => structuredClone(session);
export const setPersonalRevision = () => {};
export const reportSharedResourceFailure = async () => {};
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  init.signal?.throwIfAborted();
  const method = init.method ?? "GET";
  const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
  const route = path.split("?")[0];
  // 仓库同步失败不影响个人视图读取，业务仍保留上次内容。
  if (scene === "error" && route !== "/mock/change-views")
    throw new ApiError("MOCK_FAILED", "演示请求失败，请切换正常场景重试。");
  let result: unknown;
  if (route === "/mock/change-views") {
    if (method === "PATCH")
      views = { ...views, ...selectViewSchema.parse(body) };
    if (method === "PUT") {
      const input = saveViewsSchema.parse(body);
      if (input.expectedRevision !== views.revision)
        throw new ApiError("VIEWS_CHANGED", "演示视图已变化。");
      views = {
        ...views,
        views: input.views,
        revision: views.revision + 1,
        ...(input.selectAfterSave
          ? {
              selected: {
                kind: "personal",
                id: input.selectAfterSave,
              } as const,
            }
          : {}),
      };
    }
    result = views;
  } else if (route === "/mock/prototypes")
    result = { ...catalog, items: scene === "empty" ? [] : catalog.items };
  else if (
    route === "/mock/current-preview" ||
    (route.startsWith("/mock/previews/") && route !== "/mock/previews/prepare")
  )
    result = descriptor;
  else if (route === "/mock/previews/prepare")
    result = { publication: preview, url: preview.url };
  else if (route === "/api/session/devices")
    result = {
      devices: [
        {
          id: "demo-browser",
          label: "演示浏览器",
          current: true,
          createdAt: 1793523600000,
          lastSeenAt: 1793523600000,
          expiresAt: 1893456000000,
          absoluteExpiresAt: 1893456000000,
        },
      ],
    };
  else if (route === "/api/session/token")
    result = { token: "demo-token-not-a-real-credential" };
  else if (route === "/api/session/switch") {
    const connection = session.connections.find(
      (item) => item.id === body.connectionId,
    );
    if (!connection)
      throw new ApiError("CONNECTION_NOT_FOUND", "演示 Token 不存在");
    session.workspace = {
      ...connection,
      gitUsername: "demo-lin",
      preferences: {},
    };
    session.connected = true;
    result = { session };
  } else if (route === "/api/connections" && method === "POST") {
    if (!["demo", "demo-work"].includes(body.token))
      throw new ApiError(
        "INVALID_TOKEN",
        "原型只接受虚构 Token：demo 或 demo-work。",
      );
    const connection = {
      ...initialSession().connections[0],
      id: `demo-${nextToken++}`,
      label: body.label || "新增演示 Token",
    };
    session.connections.push(connection);
    session.workspace = {
      ...connection,
      gitUsername: "demo-lin",
      preferences: {},
    };
    session.connected = true;
    result = { connection };
  } else if (
    route.startsWith("/api/connections/") &&
    ["PATCH", "DELETE"].includes(method)
  ) {
    const id = route.split("/").at(-1);
    if (method === "DELETE")
      session.connections = session.connections.filter(
        (item) => item.id !== id,
      );
    else
      session.connections = session.connections.map((item) =>
        item.id === id ? { ...item, label: body.label } : item,
      );
    if (session.workspace?.id === id) {
      const current = session.connections.find((item) => item.id === id);
      session.workspace = current
        ? {
            ...current,
            gitUsername: "demo-lin",
            preferences: session.workspace?.preferences ?? {},
          }
        : undefined;
      session.connected = !!current;
    }
    result = { session };
  } else if (
    route === "/api/session" ||
    route === "/api/accounts/register" ||
    route === "/api/session/logout-all"
  ) {
    if (method === "DELETE" || route.endsWith("logout-all"))
      session = {
        ...session,
        authenticated: false,
        connected: false,
        workspace: undefined,
      };
    else if (method === "POST") {
      if (body.username !== "demo-lin" || body.password !== "demo12345")
        throw new ApiError(
          "INVALID_LOGIN",
          "仅接受虚构账号 demo-lin / demo12345。",
        );
      session = initialSession();
    }
    result = session;
  } else if (route.startsWith("/api/session/devices/") && method === "DELETE")
    result = {};
  else if (
    /^\/api\/connections\/[^/]+\/repository-checks$/.test(route) &&
    method === "POST"
  ) {
    if (
      ![
        "https://example.invalid/demo/atlas",
        "https://github.com/demo/atlas",
      ].includes(body.url)
    )
      throw new ApiError(
        "MOCK_REPOSITORY",
        "请使用虚构仓库 https://example.invalid/demo/atlas。",
      );
    result = repositories[0];
  } else if (route === "/api/shared-changes/links")
    result = {
      web: "/share/demo-atlas",
      agent: "/share/demo-atlas.md",
    };
  else
    throw new ApiError(
      "UNMOCKED_REQUEST",
      `未定义的原型请求：${method} ${route}`,
    );
  return structuredClone(result) as T;
}
export function updateMockPreferences(
  patch: NonNullable<
    ReturnType<typeof initialSession>["workspace"]
  >["preferences"],
) {
  if (session.workspace)
    session.workspace.preferences = {
      ...session.workspace.preferences,
      ...patch,
    };
}
