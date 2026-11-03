import test from "node:test";
import assert from "node:assert/strict";
import {
  shareLocation,
  shareReadingParams,
  sharedTextDocument,
} from "../src/lib/share-link.ts";

test("share locations retain public reading positions and exclude account and directory state", () => {
  const location = shareLocation({
    ct: "execution",
    anchor: "验证结果",
    connectionId: "private",
    token: "secret",
    scope: "active",
    snapshot: "old",
  });
  assert.deepEqual(location, { ct: "execution", anchor: "验证结果" });
  assert.equal(sharedTextDocument(location), "execution.md");
  assert.equal(
    sharedTextDocument({ ct: "file:notes/技术 #1.md" }),
    "notes/技术 #1.md",
  );
  assert.equal(
    sharedTextDocument({ ct: "technical", document: "notes/other.md" }),
    "notes/other.md",
  );
  assert.equal(sharedTextDocument({ ct: "overview" }), undefined);
});

test("explicit navigation replaces the saved document and chapter as a whole", () => {
  const saved = {
    ct: "execution",
    document: "execution.md",
    anchor: "验证结果",
  };
  const read = (query: string) =>
    Object.fromEntries(shareReadingParams(new URLSearchParams(query), saved));
  assert.deepEqual(read(""), saved);
  assert.deepEqual(read("change=ignored"), saved);
  assert.deepEqual(read("anchor=new"), { ...saved, anchor: "new" });
  assert.deepEqual(read("ct=technical"), { ct: "technical" });
  assert.deepEqual(read("ct=requirement&document=requirement.md"), {
    ct: "requirement",
    document: "requirement.md",
  });
  assert.deepEqual(read("ct=prototypes&preview=screen&device=mobile"), {
    ct: "prototypes",
    preview: "screen",
    device: "mobile",
  });
});
