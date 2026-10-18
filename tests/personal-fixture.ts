import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PersonalSessions } from "../src/server/personal-sessions.ts";
import { Discovery, type GitProbe } from "../src/server/discovery.ts";
import { ProviderRegistry } from "../src/server/providers/registry.ts";
import {
  ProviderError,
  type RepositoryProvider,
  type RepositoryIdentity,
} from "../src/server/providers/types.ts";
const commit = "a".repeat(40);
export async function personalFixture() {
  const root = await mkdtemp(join(tmpdir(), "folio-personal-test-"));
  const repositories: RepositoryIdentity[] = [
    "content",
    "empty-content",
    "missing",
    "invalid",
    "source",
    "unavailable",
  ].map((name, i) => ({
    providerId: "sample",
    instanceId: "sample.test",
    repositoryId: String(i + 1),
    fullName: `team/${name}`,
    displayName: name,
    webUrl: `https://sample.test/team/${name}`,
    cloneUrl: `https://sample.test/team/${name}.git`,
    defaultBranch: "trunk",
  }));
  const controls = {
    rateLimit: false,
    deny: new Set<string>(),
    identityInvalid: false,
    delay: 0,
    pages: [] as (string | null)[],
    gitCalls: 0,
    active: 0,
    maxActive: 0,
  };
  const provider: RepositoryProvider = {
    id: "sample",
    describeConnection: () => ({
      id: "sample",
      name: "Sample",
      instance: "sample.test",
      tokenUrl: "https://sample.test/tokens",
      permissions: ["read"],
    }),
    parseRepositoryUrl: (url) => {
      const u = new URL(url);
      if (u.origin !== "https://sample.test")
        throw new ProviderError(
          "INVALID_REPOSITORY_URL",
          "Invalid fixture URL",
          400,
        );
      return { fullName: u.pathname.slice(1) };
    },
    authenticate: async (secret) => {
      if (controls.identityInvalid)
        throw new ProviderError(
          "TOKEN_INVALID",
          "Expired fixture connection",
          401,
        );
      return {
        providerId: "sample",
        instanceId: "sample.test",
        subjectId: secret.use((s) => (s === "second" ? "2" : "1")),
        login: "reader",
        displayName: "Reader",
      };
    },
    listRepositories: async (_ctx, cursor) => {
      controls.pages.push(cursor);
      if (cursor && controls.rateLimit)
        throw new ProviderError("RATE_LIMITED", "Wait for fixture", 429, "1");
      return {
        items: cursor ? repositories.slice(3) : repositories.slice(0, 3),
        nextCursor: cursor ? null : "page-2",
      };
    },
    resolveRepository: async (_ctx, selector) => {
      if (controls.identityInvalid)
        throw new ProviderError(
          "TOKEN_INVALID",
          "Expired fixture connection",
          401,
        );
      const r = repositories.find((r) =>
        selector.repositoryId
          ? r.repositoryId === selector.repositoryId
          : r.fullName === selector.fullName,
      );
      if (!r || controls.deny.has(r.repositoryId))
        throw new ProviderError("READ_DENIED", "Unreadable fixture", 403);
      return r;
    },
    assertRead: async (_ctx, r) => {
      if (controls.identityInvalid)
        throw new ProviderError(
          "TOKEN_INVALID",
          "Expired fixture connection",
          401,
        );
      if (controls.deny.has(r.repositoryId))
        throw new ProviderError("READ_DENIED", "Unreadable fixture", 403);
    },
    probeWorkflow: async (_ctx, r) => {
      if (controls.deny.has(r.repositoryId) || r.displayName === "unavailable")
        throw new ProviderError("READ_DENIED", "Unreadable fixture", 403);
      if (r.displayName === "missing") return { kind: "missing", commit };
      return {
        kind: "file",
        commit,
        bytes: Buffer.from(
          r.displayName === "invalid"
            ? "not-json"
            : JSON.stringify({
                schemaVersion: 2,
                collaborationBranch: "develop",
                protectedBranches:
                  r.displayName === "source" ? ["deleted"] : ["trunk"],
              }),
        ),
      };
    },
    gitTransport: async (ctx, r) => ({
      url: r.cloneUrl,
      username: "reader",
      secret: ctx.secret,
    }),
  };
  const git: GitProbe = async (_p, _ctx, r) => {
    controls.gitCalls++;
    controls.active++;
    controls.maxActive = Math.max(controls.maxActive, controls.active);
    try {
      if (controls.delay)
        await new Promise((resolve) => setTimeout(resolve, controls.delay));
      if (controls.deny.has(r.repositoryId))
        throw new ProviderError("READ_DENIED", "Unreadable fixture", 403);
      return new Map([
        ["trunk", commit],
        ["develop", commit],
      ]);
    } finally {
      controls.active--;
    }
  };
  const registry = new ProviderRegistry([provider]),
    sessions = new PersonalSessions(
      join(root, "sessions"),
      registry,
      join(root, "key"),
    ),
    discovery = new Discovery(join(root, "discovery"), sessions, git);
  const connect = (cookie = "", secret = "first") =>
    sessions.login(
      cookie,
      "sample",
      secret,
      undefined,
      new AbortController().signal,
    );
  return {
    root,
    repositories,
    controls,
    provider,
    registry,
    sessions,
    discovery,
    git,
    connect,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
