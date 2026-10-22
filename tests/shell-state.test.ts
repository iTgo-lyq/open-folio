import test from "node:test";
import assert from "node:assert/strict";
import { syncStatus, NETWORK_ERROR } from "../src/lib/sync-status.ts";
import {
  legacyChangesPatch,
  legacyPrototypesPatch,
} from "../src/lib/legacy-query.ts";

const base = { online: true, loading: false, refreshing: false, error: "" };

test("sync status prefers offline, then reading, then classified errors", () => {
  assert.equal(syncStatus(base).label, "已同步");
  assert.equal(syncStatus({ ...base, refreshing: true }).label, "正在读取");
  assert.equal(
    syncStatus({ ...base, online: false, refreshing: true }).tone,
    "offline",
  );
  assert.equal(
    syncStatus({ ...base, error: "x", errorCode: NETWORK_ERROR }).label,
    "离线",
  );
  assert.equal(
    syncStatus({ ...base, error: "x", errorCode: "TOKEN_INVALID" }).label,
    "Token 失效",
  );
  assert.equal(
    syncStatus({ ...base, error: "x", errorCode: "READ_DENIED" }).label,
    "无权限",
  );
  const failed = syncStatus({ ...base, error: "GitHub 502", errorCode: "X" });
  assert.deepEqual(failed, {
    tone: "error",
    label: "同步失败",
    detail: "GitHub 502",
  });
});

test("legacy Changes links drop removed controls and map retired scopes", () => {
  assert.equal(legacyChangesPatch({ m: "changes", scope: "active" }), null);
  assert.deepEqual(
    legacyChangesPatch({
      level: "tasks",
      taskStatus: "doing",
      size: "large",
      stage: "plan",
      wait: "blocked",
      spec: "maps/offline",
      view: "dependencies",
    }),
    {
      level: null,
      taskStatus: null,
      size: null,
      stage: null,
      wait: null,
      spec: null,
      view: null,
    },
  );
  assert.equal(legacyChangesPatch({ view: "board" }), null);
  assert.deepEqual(legacyChangesPatch({ scope: "issues" }), {
    scope: null,
    issues: "1",
  });
  assert.deepEqual(legacyChangesPatch({ scope: "pendingIntegration" }), {
    scope: null,
  });
  assert.deepEqual(legacyChangesPatch({ scope: "pendingRelease" }), {
    scope: "completed",
  });
  assert.deepEqual(legacyPrototypesPatch({ pkind: "page" }), { pkind: null });
  assert.equal(legacyPrototypesPatch({ pdevice: "mobile" }), null);
});
