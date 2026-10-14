import "server-only";
import { mkdir, readFile, rename, rm, lstat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import {
  privateKey,
  atomicPrivate,
  workspaceStateSchema,
  parseWorkspaceState,
  decryptWorkspace,
  credentialFingerprint,
  encryptWorkspace,
} from "./personal-sessions.ts";
// Offline only: publish a new private directory without touching source data or stable cache ids.
export async function rotateWorkspaceKeys(
  sourceRoot: string,
  preparedRoot: string,
  sourceCredentialKey = join(sourceRoot, "credential-key"),
) {
  const source = resolve(sourceRoot),
    target = resolve(preparedRoot);
  if (
    target === source ||
    target.startsWith(source + "/") ||
    source.startsWith(target + "/")
  )
    throw new Error("Rotation requires a separate destination directory.");
  try {
    await lstat(target);
    throw new Error("Rotation destination already exists.");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const state = parseWorkspaceState(
    JSON.parse(await readFile(join(source, "state.json"), "utf8")),
  );
  const credential = await privateKey(sourceCredentialKey, false),
    identity = await privateKey(join(source, "identity-key"), false);
  const secrets = state.workspaces.map((w) => {
    const secret = decryptWorkspace(w, credential);
    if (
      credentialFingerprint(identity, w.providerId, w.instanceId, secret) !==
      w.credentialFingerprint
    )
      throw new Error("Workspace credential identity is inconsistent.");
    return secret;
  });
  const staged = `${target}.staging-${randomBytes(8).toString("hex")}`;
  await mkdir(dirname(target), { recursive: true });
  await mkdir(staged, { mode: 0o700 });
  try {
    const newCredential = await privateKey(
        join(staged, "credential-key"),
        true,
      ),
      newIdentity = await privateKey(join(staged, "identity-key"), true);
    state.workspaces = state.workspaces.map((w, i) => ({
      ...w,
      credentialFingerprint: credentialFingerprint(
        newIdentity,
        w.providerId,
        w.instanceId,
        secrets[i],
      ),
      ...encryptWorkspace(w, secrets[i], newCredential),
    }));
    await atomicPrivate(
      join(staged, "state.json"),
      JSON.stringify(workspaceStateSchema.parse(state)),
    );
    await rename(staged, target);
  } catch (e) {
    await rm(staged, { recursive: true, force: true });
    throw e;
  }
}
