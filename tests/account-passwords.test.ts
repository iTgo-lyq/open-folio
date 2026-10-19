import test from "node:test";
import assert from "node:assert/strict";
import { withPasswordGate } from "../src/server/account-passwords.ts";
test("password entry bounds concurrent work and waiting requests without dropping queued work", async () => {
  let active = 0,
    maximum = 0,
    completed = 0;
  const releases: (() => void)[] = [];
  const jobs = Array.from({ length: 10 }, (_, i) =>
    withPasswordGate(`gate-${i}`, Date.now, async () => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
      completed++;
    }),
  );
  await Promise.resolve();
  assert.equal(active, 2);
  await assert.rejects(
    withPasswordGate("overflow", Date.now, async () =>
      assert.fail("overflow ran"),
    ),
    { code: "AUTH_RATE_LIMITED" },
  );
  for (let n = 0; n < 10; n++) {
    while (!releases.length)
      await new Promise((resolve) => setImmediate(resolve));
    releases.shift()!();
  }
  await Promise.all(jobs);
  assert.equal(completed, 10);
  assert.equal(maximum, 2);
});
