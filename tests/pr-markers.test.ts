import test from "node:test";
import assert from "node:assert/strict";
import { prMarker } from "../.agents/skills/spec-trail/scripts/pr-markers.mjs";

test("PR markers require a unique standalone metadata paragraph", () => {
  assert.deepEqual(prMarker("Feature\n\nSpecTrail-Change: example"), {
    kind: "change",
    id: "example",
  });
  assert.deepEqual(
    prMarker(
      "Release\n\nSpecTrail-Version: v1.2\nSpecTrail-Includes: one\nSpecTrail-Includes: two",
    ),
    { kind: "release", version: "v1.2", includes: ["one", "two"] },
  );
  for (const body of [
    "SpecTrail-Change: example",
    "Title\n\nExample SpecTrail-Change: example",
    "Title\n\n```text\nSpecTrail-Change: example\n```",
    "Title\n\n```text\n\nSpecTrail-Change: example",
  ])
    assert.equal(prMarker(body).kind, "none");
  for (const metadata of [
    "SpecTrail-Change: a\nSpecTrail-Change: a",
    "SpecTrail-Change: a\nSpecTrail-Version: 1",
    "SpecTrail-Change: Bad",
    "SpecTrail-Version: 1\nSpecTrail-Includes: a\nSpecTrail-Includes: a",
    "SpecTrail-Version: 1\nSpecTrail-Version: 2\nSpecTrail-Includes: a",
  ])
    assert.equal(prMarker(`Description\n\n${metadata}`).kind, "invalid");
});
