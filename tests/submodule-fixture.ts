import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture } from "./fixture.ts";
import { GitReader } from "../src/server/git.ts";
import { SnapshotStore } from "../src/server/store.ts";
import { AppError } from "../src/server/errors.ts";
export async function submoduleFixture(packagePath = "packages/prototype") {
  const f = await fixture();
  const remote = join(f.root, "frontend.git"),
    seed = join(f.root, "frontend-seed");
  await mkdir(seed);
  f.git(["init", "--bare", "--initial-branch=trunk", remote]);
  f.git(["init", "--initial-branch=trunk"], seed);
  f.git(["config", "user.name", "Fixture"], seed);
  f.git(["config", "user.email", "fixture@example.test"], seed);
  f.git(["remote", "add", "origin", remote], seed);
  const path = (part: string) =>
    packagePath ? `${packagePath}/${part}` : part;
  const putAt = async (root: string, path: string, body: string) => {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), body);
  };
  const sourceCommit = f.git(["rev-parse", "HEAD"]);
  const entry = {
    id: "screen",
    title: "子仓库 A",
    sourcePath: path("src/screen.html"),
    kind: "page",
    devices: ["pc-web"],
    artifact: { type: "git", sourceCommit, path: path("preview/screen") },
  };
  await putAt(
    seed,
    path("prototype.json"),
    JSON.stringify({ schemaVersion: 1, entries: [entry] }),
  );
  await putAt(seed, entry.sourcePath, "source A");
  await putAt(
    seed,
    path("preview/screen/index.html"),
    "<!doctype html><body>fixed A</body>",
  );
  f.git(["add", "."], seed);
  f.git(["commit", "-m", "A"], seed);
  f.git(["push", "-u", "origin", "trunk"], seed);
  const a = f.git(["rev-parse", "HEAD"], seed);
  f.git([
    "-c",
    "protocol.file.allow=always",
    "submodule",
    "add",
    remote,
    "frontend",
  ]);
  f.git([
    "config",
    "-f",
    ".gitmodules",
    "submodule.frontend.url",
    "https://example.test/team/frontend.git",
  ]);
  const child = join(f.author, "frontend");
  f.git(["config", "user.name", "Fixture"], child);
  f.git(["config", "user.email", "fixture@example.test"], child);
  await f.put(
    "docs/project/workflow.json",
    JSON.stringify({
      schemaVersion: 3,
      integrationBranch: "develop",
      releaseBranch: "main",
      prototype: {
        status: "enabled",
        packagePath: `frontend${packagePath ? "/" + packagePath : ""}`,
      },
    }),
  );
  const revision = f.commit();
  let denied = false;
  const opened: { url: string; commit: string; force: boolean }[] = [];
  const attach = (reader: GitReader): GitReader => {
    reader.submodule = async (url, commit, path, signal, force = false) => {
      opened.push({ url, commit, force });
      if (denied)
        throw new AppError(
          "SUBMODULE_READ_DENIED",
          `子模块 ${path} 当前账号无权访问。`,
          403,
        );
      if (url !== "https://example.test/team/frontend.git")
        throw new AppError(
          "SUBMODULE_READ_DENIED",
          "不支持的子仓库地址。",
          403,
        );
      const childReader = attach(
        new GitReader(join(f.root, "child-cache"), remote, "file"),
      );
      try {
        await childReader.ensureCommit(commit, signal);
      } catch {
        throw new AppError(
          "SUBMODULE_VERSION",
          `子模块 ${path} 的指定版本 ${commit} 不可获取。`,
          422,
        );
      }
      return childReader;
    };
    return reader;
  };
  const store = new SnapshotStore(
    join(f.root, "cache"),
    (dir) => attach(new GitReader(dir, f.remote, "file")),
    f.project.id,
  );
  return {
    ...f,
    parentRemote: f.remote,
    store,
    child,
    remote,
    a,
    revision,
    entry,
    path,
    opened,
    deny: () => {
      denied = true;
    },
    allow: () => {
      denied = false;
    },
    childPut: (path: string, body: string) => putAt(child, path, body),
    childGit: (args: string[]) => f.git(args, child),
    childCommit: () => {
      f.git(["add", "."], child);
      f.git(["commit", "-m", "child update"], child);
      f.git(["push", "origin", "HEAD"], child);
      return f.git(["rev-parse", "HEAD"], child);
    },
  };
}
