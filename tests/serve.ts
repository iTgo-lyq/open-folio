import { randomBytes, randomUUID } from "node:crypto";
import { connect } from "node:net";
import { spawn } from "node:child_process";
import { createServer, request as proxyRequest } from "node:http";
import { writeFile, mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { seed } from "./seed.ts";
import { gitHttpsFixture } from "./git-https-fixture.ts";
import { hostedServer } from "./hosted-server.ts";
import {
  PersonalSessions,
  workspaceStateSchema,
  atomicPrivate,
  cookieHash,
} from "../src/server/personal-sessions.ts";
import { ProviderRegistry } from "../src/server/providers/registry.ts";
import {
  ProviderError,
  repositoryKey,
  type RepositoryProvider,
  type RepositoryIdentity,
} from "../src/server/providers/types.ts";
import { Discovery } from "../src/server/discovery.ts";
import { Repositories } from "../src/server/repositories.ts";
import { repositoryPermissions } from "../src/server/repository-permissions.ts";
import { PublicPreviews } from "../src/server/public-previews.ts";
import {
  sessionResponse,
  logoutAllResponse,
  restoreSessionResponse,
  connectionResponse,
} from "../src/server/connection-api.ts";
import {
  discoveryResponse,
  repositoryListResponse,
} from "../src/server/discovery-api.ts";
import { legacyResolveResponse } from "../src/server/legacy-api.ts";
import { repositoryResponse } from "../src/server/repository-api.ts";
import {
  preparePreviewResponse,
  publicPreviewResponse,
  withdrawPreviewResponse,
} from "../src/server/public-preview-api.ts";
import {
  tokenResponse,
  devicesResponse,
} from "../src/server/credential-api.ts";
import { preferencesResponse } from "../src/server/preferences-api.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";
const f = await seed(),
  git = await gitHttpsFixture(f),
  host = await hostedServer(join(f.root, "host-fixture"));
const root = join(f.root, "personal-data"),
  config = join(f.root, "config.json");
process.env.GIT_SSL_CAINFO = git.cert;
process.env.OPENFOLIO_DATA_DIR = root;
process.env.OPENFOLIO_CONFIG = config;
await writeFile(
  config,
  JSON.stringify({
    schemaVersion: 1,
    projects: [
      {
        id: f.project.id,
        name: f.project.name,
        repositoryUrl: "https://github.com/acme/fixture",
        inviteCode: "fixture-invitation",
      },
    ],
  }),
);
const repository: RepositoryIdentity = {
  providerId: "github",
  instanceId: "fixture.test",
  repositoryId: "1",
  fullName: "acme/fixture",
  displayName: "测试项目",
  webUrl: "https://github.com/acme/fixture",
  cloneUrl: git.url,
  defaultBranch: "main",
};
const valid = new Set(["token-a", "token-b"]);
let unavailable = false;
let permissionOffset = 0,
  permissionChecks = 0;
const provider: RepositoryProvider = {
  id: "github",
  describeConnection: () => ({
    id: "github",
    instance: "fixture.test",
    name: "GitHub",
    tokenUrl: "https://github.com/settings/personal-access-tokens/new",
    permissions: ["Contents: Read-only"],
  }),
  parseRepositoryUrl: (value) => {
    if (!/^https:\/\/github\.com\/acme\/fixture(?:\.git)?\/?$/.test(value))
      throw new ProviderError(
        "INVALID_REPOSITORY_URL",
        "请选择受控测试仓库。",
        400,
      );
    return { fullName: repository.fullName };
  },
  authenticate: async (secret) => {
    if (unavailable)
      throw new ProviderError(
        "PROVIDER_UNAVAILABLE",
        "平台暂时不可达，请重试。",
        503,
      );
    const token = secret.use((v) => v);
    if (!valid.has(token))
      throw new ProviderError(
        "TOKEN_INVALID",
        "token 已失效，请替换连接。",
        401,
      );
    return {
      providerId: "github",
      instanceId: "fixture.test",
      subjectId: token === "token-b" ? "2" : "1",
      login: token === "token-b" ? "collaborator" : "reader",
      displayName: "Fixture Reader",
    };
  },
  listRepositories: async () => ({ items: [repository], nextCursor: null }),
  resolveRepository: async (ctx, selector) => {
    await provider.authenticate(ctx.secret, ctx.signal);
    if (
      (selector.repositoryId && selector.repositoryId !== "1") ||
      (!selector.repositoryId && selector.fullName !== repository.fullName)
    )
      throw new ProviderError("READ_DENIED", "当前连接无法读取这个仓库。", 403);
    return repository;
  },
  assertRead: async (ctx) => {
    permissionChecks++;
    await provider.authenticate(ctx.secret, ctx.signal);
  },
  probeWorkflow: async () => ({
    kind: "file",
    commit: f.git(["rev-parse", "refs/heads/main"], f.remote),
    bytes: Buffer.from(
      f.git(["show", "refs/heads/main:docs/project/workflow.json"], f.remote),
    ),
  }),
  gitTransport: async (ctx) => ({
    url: git.url,
    username: "reader",
    secret: ctx.secret,
  }),
};
const sessions = new PersonalSessions(
  join(root, "sessions"),
  new ProviderRegistry([provider]),
  join(root, "key"),
);
const discoveries = new Discovery(join(root, "discoveries"), sessions),
  repos = new Repositories(join(root, "repos"), sessions, discoveries),
  publications = new PublicPreviews(join(root, "public-previews"));
repositoryPermissions(sessions).now = () => Date.now() + permissionOffset;
const key = repositoryKey(repository);
const originalMain = f.git(["rev-parse", "main"]);
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/e2e-runtime.json",
  JSON.stringify({ config, root: f.root, repositoryKey: key }),
);
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url!, "http://127.0.0.1:10682"),
      s = url.pathname.split("/").filter(Boolean);
    let response: Response | undefined;
    if (s[0] === "_fixture") {
      if (s[1] === "legacy") {
        const statePath = join(root, "sessions", "state.json"),
          state = workspaceStateSchema.parse(
            JSON.parse(await readFile(statePath, "utf8")),
          );
        const cookie = randomBytes(32).toString("base64url");
        state.legacySelections.push({
          cookieHash: cookieHash(cookie),
          sessionId: randomUUID(),
          expiresAt: Date.now() + 60_000,
          choices: state.workspaces.map((w) => ({
            connectionId: randomUUID(),
            workspaceId: w.id,
          })),
        });
        await atomicPrivate(statePath, JSON.stringify(state));
        response = Response.json({ cookie });
      }
      if (s[1] === "control") {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const input = JSON.parse(Buffer.concat(chunks).toString());
        if (input.reset) {
          if (input.newSessionScope)
            await rm(join(root, "sessions", "state.json"), { force: true });
          valid.add("token-a");
          valid.add("token-b");
          git.allowed.add("reader:token-a");
          git.allowed.add("reader:token-b");
          unavailable = false;
        }
        if (input.revoke) {
          valid.delete(input.revoke);
          git.allowed.delete(`reader:${input.revoke}`);
        }
        if (input.gitRevoke) git.allowed.delete(`reader:${input.gitRevoke}`);
        if (input.unavailable !== undefined) unavailable = input.unavailable;
        if (input.advancePermissions)
          permissionOffset += input.advancePermissions;
        if (input.advanceMain) {
          f.git(["checkout", "main"]);
          await f.put(
            "docs/project/specs/platform/spec.md",
            "# 自动更新后的能力\n\n远端新增正文。",
          );
          const path = "packages/prototype/prototype.json";
          const manifest = JSON.parse(f.git(["show", `main:${path}`]));
          manifest.entries[0].title = "自动更新后的原型";
          await f.put(path, JSON.stringify(manifest));
          f.commit();
        }
        if (input.restoreMain) {
          f.git(["checkout", "main"]);
          f.git(["reset", "--hard", originalMain]);
          f.git(["push", "--force", "origin", "main"]);
        }
        if (input.expireRefresh)
          await rm(
            join(root, "repos", input.expireRefresh, key, "last-checked.json"),
            { force: true },
          );
      }
      response ??= Response.json({
        key,
        repository,
        attempts: git.attempts.length,
        permissionChecks,
      });
    } else if (
      s[0] === "api" &&
      [
        "session",
        "connections",
        "repositories",
        "public-previews",
        "legacy-projects",
      ].includes(s[1])
    ) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const request = new Request(url, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        ...(body.length ? { body } : {}),
      });
      if (s[1] === "session")
        response =
          s[2] === "preferences"
            ? await preferencesResponse(request, sessions)
            : s[2] === "token"
              ? await tokenResponse(request, sessions)
              : s[2] === "devices"
                ? await devicesResponse(request, s[3], sessions)
                : s[2] === "logout-all"
                  ? await logoutAllResponse(request, sessions)
                  : s[2] === "restore"
                    ? await restoreSessionResponse(
                        request,
                        sessions,
                        discoveries,
                      )
                    : await sessionResponse(request, sessions, discoveries);
      else if (s[1] === "connections")
        response =
          s.length === 2
            ? await connectionResponse(
                request,
                undefined,
                sessions,
                discoveries,
              )
            : s[3] === "discovery" || s[3] === "repository-checks"
              ? await discoveryResponse(
                  request,
                  s[2],
                  s[3] === "discovery" ? "discovery" : "check",
                  discoveries,
                )
              : await connectionResponse(request, s[2], sessions, discoveries);
      else if (s[1] === "legacy-projects")
        response = await legacyResolveResponse(request, s[2], repos, root);
      else if (s[1] === "repositories")
        response =
          s.length === 2
            ? await repositoryListResponse(request, discoveries)
            : s[3] === "previews" && s[4] === "prepare"
              ? await preparePreviewResponse(
                  request,
                  s[2],
                  repos,
                  publications,
                  DEFAULT_LIMITS,
                )
              : await repositoryResponse(
                  request,
                  s[2],
                  s.slice(3),
                  repos,
                  DEFAULT_LIMITS,
                );
      else if (req.method === "DELETE" && s.length === 3)
        response = await withdrawPreviewResponse(request, s[2], publications);
      else
        response = await publicPreviewResponse(
          request,
          s[2],
          s.slice(3).join("/"),
          publications,
        );
    }
    if (response) {
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const upstream = proxyRequest(
      {
        hostname: "127.0.0.1",
        port: 10684,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (out) => {
        res.writeHead(out.statusCode ?? 502, out.headers);
        out.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502);
      res.end("Starting test app");
    });
    req.pipe(upstream);
  } catch {
    res.writeHead(500);
    res.end("Fixture handler failed");
  }
});
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "10684",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "development",
      OPENFOLIO_ADMIN_PASSWORD: "fixture-admin-password",
      OPENFOLIO_CONFIG: config,
      OPENFOLIO_DATA_DIR: root,
      OPENFOLIO_BUILD_DIR: ".next-e2e",
    },
  },
);
server.on("upgrade", (req, socket, head) => {
  const upstream = connect(10684, "127.0.0.1", () => {
    upstream.write(
      `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${Object.entries(
        req.headers,
      )
        .map(([name, value]) => `${name}: ${value}`)
        .join("\r\n")}\r\n\r\n`,
    );
    if (head.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});
server.listen(10682, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => child.kill(signal));
child.on("exit", async (code) => {
  server.close();
  host.close();
  await git.cleanup();
  process.exit(code ?? 0);
});
