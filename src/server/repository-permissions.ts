import "server-only";
import { AppError } from "./errors.ts";
import type { ConnectionLease, PersonalSessions } from "./personal-sessions.ts";
import {
  repositoryKey,
  type RepositoryIdentity,
  type RepositorySelector,
} from "./providers/types.ts";

export const PERMISSION_CHECK_MS = 5 * 60_000;
type Entry = {
  checkedAt: number;
  version: number;
  repository?: RepositoryIdentity;
  denied?: AppError;
  pending?: Promise<RepositoryIdentity>;
};

export class RepositoryPermissions {
  private entries = new Map<string, Entry>();
  private sessions: PersonalSessions;
  now = () => Date.now();
  constructor(sessions: PersonalSessions) {
    this.sessions = sessions;
  }
  private key(lease: ConnectionLease, key: string) {
    return `${lease.workspaceId}/${key}`;
  }
  assertAllowed(lease: ConnectionLease, key: string) {
    const denied = this.entries.get(this.key(lease, key))?.denied;
    if (denied) throw denied;
  }
  reject(lease: ConnectionLease, key: string | undefined, error: unknown) {
    if (!(error instanceof AppError)) return;
    const wholeWorkspace = ["TOKEN_INVALID", "IDENTITY_CHANGED"].includes(
      error.code,
    );
    if (
      !wholeWorkspace &&
      !["READ_DENIED", "REPOSITORY_MISMATCH"].includes(error.code)
    )
      return;
    for (const [id, entry] of this.entries) {
      if (
        wholeWorkspace
          ? id.startsWith(`${lease.workspaceId}/`)
          : id === this.key(lease, key!)
      ) {
        entry.version++;
        entry.repository = undefined;
        entry.denied = error;
      }
    }
  }
  async check(
    cookie: string,
    lease: ConnectionLease,
    key: string,
    target: RepositorySelector,
    options: {
      force?: boolean;
      workspaceOwned?: boolean;
      integrationBranch?: string;
    } = {},
  ): Promise<RepositoryIdentity> {
    await lease.assertCurrent();
    const id = this.key(lease, key);
    let entry = this.entries.get(id);
    if (!entry) {
      entry = { checkedAt: 0, version: 0 };
      this.entries.set(id, entry);
    }
    const age = this.now() - entry.checkedAt;
    if (
      !options.force &&
      entry.repository &&
      age >= 0 &&
      age < PERMISSION_CHECK_MS
    )
      return entry.repository;
    if (!entry.pending) {
      const current = entry,
        version = current.version;
      current.pending = (async () => {
        // A shared check belongs to the credential workspace, not its first device.
        const owner = options.workspaceOwned
          ? lease
          : await this.sessions.workspaceLease(cookie, lease.workspaceId);
        try {
          const provider = this.sessions.registry.get(
            owner.context.identity.providerId,
          );
          const repository = await provider.resolveRepository(
            owner.context,
            target,
          );
          if (repositoryKey(repository) !== key)
            throw new AppError("REPOSITORY_MISMATCH", "仓库身份已变化。", 403);
          await provider.assertRead(
            owner.context,
            repository,
            options.integrationBranch,
          );
          await owner.assertCurrent();
          // A later denial on another request must win over this older check.
          if (current.version !== version) throw current.denied;
          current.repository = repository;
          current.checkedAt = this.now();
          current.denied = undefined;
          return repository;
        } catch (error) {
          this.reject(lease, key, error);
          throw error;
        } finally {
          if (!options.workspaceOwned) owner.release();
        }
      })().finally(() => {
        current.pending = undefined;
      });
    }
    const repository = await entry.pending!;
    await lease.assertCurrent();
    this.assertAllowed(lease, key);
    return repository;
  }
}

const state = globalThis as typeof globalThis & {
  folioPermissions?: WeakMap<PersonalSessions, RepositoryPermissions>;
};
export function repositoryPermissions(sessions: PersonalSessions) {
  const all = (state.folioPermissions ??= new WeakMap());
  let checks = all.get(sessions);
  if (!checks) {
    checks = new RepositoryPermissions(sessions);
    all.set(sessions, checks);
  }
  return checks;
}
