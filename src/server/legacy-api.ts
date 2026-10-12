import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { dataDirectory, readConfig } from "./config.ts";
import { legacyProject } from "./legacy-config.ts";
import { repositories, type Repositories } from "./repositories.ts";
import { repositoryKey } from "./providers/types.ts";
import { AppError } from "./errors.ts";
import {
  personalError,
  personalJson,
  readPersonalBody,
  requirePersonalOrigin,
  sessionCookie,
  renewPersonalResponse,
} from "./personal-http.ts";
const bindingPath = (root: string, id: string) =>
  join(
    root,
    "legacy-v1",
    "bindings",
    createHash("sha256").update(id).digest("hex"),
  );
export async function readLegacyBinding(root: string, id: string) {
  const key = await readFile(bindingPath(root, id), "utf8").catch(() => "");
  return /^[a-f0-9]{64}$/.test(key) ? key : undefined;
}
async function bind(root: string, id: string, key: string) {
  const path = bindingPath(root, id),
    temporary = `${path}.${randomUUID()}.tmp`;
  await mkdir(join(root, "legacy-v1", "bindings"), {
    recursive: true,
    mode: 0o700,
  });
  try {
    await writeFile(temporary, key, { flag: "wx", mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
export async function legacyResolveResponse(
  request: Request,
  id: string,
  repos: Repositories = repositories(),
  root = dataDirectory(),
) {
  try {
    requirePersonalOrigin(request);
    const parsed = z
      .object({ connectionId: z.string().uuid() })
      .strict()
      .safeParse(await readPersonalBody(request));
    if (!parsed.success)
      throw new AppError("INVALID_PARAMETER", "请选择自己的连接。", 400);
    const { connectionId } = parsed.data,
      cookie = sessionCookie(request);
    // A valid owned lease comes before reading or exposing legacy locators.
    const lease = await repos.sessions.lease(
      cookie,
      connectionId,
      request.signal,
    );
    try {
      await readConfig();
      const project = await legacyProject(root, id);
      if (!project)
        throw new AppError(
          "LEGACY_PROJECT_NOT_FOUND",
          "无法定位旧链接，请从个人仓库目录重新选择。",
          404,
        );
      const provider = repos.sessions.registry.get(
        lease.context.identity.providerId,
      );
      const actual = await provider.authenticate(
        lease.context.secret,
        lease.context.signal,
      );
      if (actual.subjectId !== lease.context.identity.subjectId)
        throw new AppError("IDENTITY_CHANGED", "请更新自己的连接。", 401);
      const repository = await provider.resolveRepository(
        lease.context,
        provider.parseRepositoryUrl(project.repositoryUrl),
      );
      const key = repositoryKey(repository);
      const result = await repos.read(
        cookie,
        connectionId,
        key,
        async (ctx) => ({
          key,
          repository: ctx.repository,
          specBranch: project.specBranch,
        }),
        repository,
        request.signal,
      );
      await lease.assertCurrent();
      await bind(root, id, key);
      return await renewPersonalResponse(
        request,
        personalJson(result),
        repos.sessions,
      );
    } finally {
      lease.release();
    }
  } catch (e) {
    return personalError(e);
  }
}
