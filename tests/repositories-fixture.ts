import { join } from "node:path";
import { personalFixture } from "./personal-fixture.ts";
import { fixture } from "./fixture.ts";
import { gitHttpsFixture } from "./git-https-fixture.ts";
import { Repositories } from "../src/server/repositories.ts";
import { Discovery } from "../src/server/discovery.ts";
import { GitReader } from "../src/server/git.ts";
import { repositoryKey } from "../src/server/providers/types.ts";
import { repositoryResponse } from "../src/server/repository-api.ts";
import { DEFAULT_LIMITS } from "../src/lib/model.ts";
export async function repositoryFixture(https = false) {
  const f = await personalFixture(),
    g = https ? await gitHttpsFixture() : await fixture();
  g.git(["branch", "-m", "trunk"]);
  await g.put(
    "docs/project/workflow.json",
    JSON.stringify({
      schemaVersion: 2,
      collaborationBranch: "develop",
      protectedBranches: ["trunk"],
      prototype: {
        status: "enabled",
        packagePath: "packages/prototype",
        hosting: { provider: "git" },
      },
    }),
  );
  await g.put(
    "packages/prototype/prototype.json",
    JSON.stringify({ schemaVersion: 1, entries: [] }),
  );
  await g.put(
    "docs/project/specs/platform/image.png",
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  g.commit();
  g.git(["symbolic-ref", "HEAD", "refs/heads/trunk"], g.remote);
  g.git(["checkout", "-b", "develop"]);
  g.git(["push", "-u", "origin", "develop"]);
  const repo = f.repositories[0];
  if (https)
    repo.cloneUrl = (g as Awaited<ReturnType<typeof gitHttpsFixture>>).url;
  const discovery = new Discovery(join(f.root, "discovery"), f.sessions, f.git);
  const c = await f.connect("", https ? "token-a" : "first");
  await discovery.check(c.cookie, c.connection.id, repo.webUrl);
  const service = new Repositories(
    join(f.root, "repos"),
    f.sessions,
    discovery,
    https ? undefined : (dir) => new GitReader(dir, g.remote, "file"),
  );
  const key = repositoryKey(repo);
  const read = (fn: Parameters<Repositories["read"]>[3]) =>
    service.read(c.cookie, c.connection.id, key, fn);
  const request = (
    path: string,
    method = "GET",
    cookie = c.cookie,
    id = c.connection.id,
  ) =>
    repositoryResponse(
      new Request(
        `https://folio.test/api/repositories/${key}/${path}${path.includes("?") ? "&" : "?"}connectionId=${id}`,
        {
          method,
          headers: {
            cookie: `openfolio-account=${cookie}`,
            origin: "https://folio.test",
          },
        },
      ),
      key,
      path.split("?")[0].split("/"),
      service,
      DEFAULT_LIMITS,
    );
  return {
    f,
    g,
    c,
    repo,
    service,
    key,
    read,
    request,
    cleanup: async () => {
      await g.cleanup();
      await f.cleanup();
    },
  };
}
