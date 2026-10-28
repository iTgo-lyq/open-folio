import type { GitReader } from "./git.ts";
import type { PrototypeSource } from "../lib/model.ts";
import { packageSource } from "../../.agents/skills/spec-trail/prototype/scripts/source.mjs";
import { AppError } from "./errors.ts";
export async function resolvePackage(
  reader: GitReader,
  revision: string,
  path: string,
  signal: AbortSignal,
  required = true,
) {
  try {
    const steps = packageSource(reader, revision, path, reader.url);
    let step = steps.next();
    while (!step.done) {
      const op = step.value;
      const value = op.enter
        ? await reader.openSubmodule(
            op.enter.repository,
            op.enter.commit,
            op.enter.path,
            signal,
            false,
            required,
          )
        : (
            await (op.source as GitReader).run(op.args, signal, 512 * 1024)
          ).toString();
      step = steps.next(value);
    }
    const result = step.value;
    return {
      reader: result.source as GitReader,
      revision: result.revision as string,
      packagePath: result.packagePath as string,
      mount: result.mount as string,
      source: {
        revision,
        links: result.links,
        packagePath: result.packagePath,
      } as PrototypeSource,
    };
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof AppError) throw error;
    throw new AppError(
      "SUBMODULE_CONFIG",
      error instanceof Error ? error.message : "子模块原型来源配置无效。",
      422,
    );
  }
}
export async function checkPrototypeSource(
  reader: GitReader,
  source: PrototypeSource,
  signal: AbortSignal,
  force = false,
) {
  for (const link of source.links)
    await reader.openSubmodule(
      link.repository,
      link.commit,
      link.path,
      signal,
      force,
    );
}
