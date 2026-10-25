import {
  readFileSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compareVersions, parseVersion, readVersion } from "./version.mjs";

export const UPDATE_URL =
  "https://raw.githubusercontent.com/iTgo-lyq/spec-trail/main/skills/spec-trail/version.json";
export const CACHE_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 16 * 1024;
const installedVersion = fileURLToPath(
  new URL("../version.json", import.meta.url),
);

function readCache(file, now) {
  try {
    const cached = JSON.parse(readFileSync(file, "utf8"));
    if (
      !Number.isSafeInteger(cached.checkedAt) ||
      now < cached.checkedAt ||
      now - cached.checkedAt >= CACHE_MS
    )
      return;
    if (cached.failed === true && cached.latestVersion === undefined)
      return cached;
    if (cached.failed !== undefined) return;
    parseVersion(cached.latestVersion);
    return cached;
  } catch {}
}

function saveCache(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(temporary, JSON.stringify(value) + "\n", { flag: "wx" });
    renameSync(temporary, file);
  } catch {
  } finally {
    try {
      rmSync(temporary, { force: true });
    } catch {}
  }
}

async function fetchVersion(fetchImpl, timeoutMs) {
  const response = await fetchImpl(UPDATE_URL, {
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok || !response.body) {
    void response.body?.cancel().catch(() => {});
    throw Error("Cannot read latest version");
  }
  const reader = response.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw Error("Version response is too large");
      chunks.push(value);
    }
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const latest = JSON.parse(Buffer.concat(chunks).toString("utf8"))?.version;
  parseVersion(latest);
  return latest;
}

/** Optional CLI notice only: never changes project state or the command's exit status. */
export async function checkForUpdates(
  repo,
  {
    versionFile = installedVersion,
    fetchImpl = globalThis.fetch,
    now = Date.now,
    timeoutMs = 3000,
  } = {},
) {
  if (repo.config.checkForUpdates === false) return;
  let currentVersion;
  const unknown = (message = "暂时无法确认 SpecTrail 最新版本。") => ({
    status: "unknown",
    ...(currentVersion ? { currentVersion } : {}),
    message,
  });
  try {
    try {
      currentVersion = readVersion(versionFile);
    } catch {
      return unknown("当前 skill 未携带有效的发布版本标识，无法检查更新。");
    }
    if (!currentVersion)
      return unknown("当前 skill 未携带有效的发布版本标识，无法检查更新。");
    const checkedAt = now(),
      file = join(repo.common, "spec-trail/update-check.json");
    let cached = readCache(file, checkedAt);
    if (!cached) {
      try {
        cached = {
          checkedAt,
          latestVersion: await fetchVersion(fetchImpl, timeoutMs),
        };
      } catch {
        cached = { checkedAt, failed: true };
      }
      saveCache(file, cached);
    }
    if (cached.failed) return unknown();
    if (compareVersions(cached.latestVersion, currentVersion) <= 0) return;
    return {
      status: "available",
      currentVersion,
      latestVersion: cached.latestVersion,
      message: `SpecTrail 有新版本 ${cached.latestVersion}，当前安装为 ${currentVersion}。`,
    };
  } catch {
    return unknown();
  }
}
