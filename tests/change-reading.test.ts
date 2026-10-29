import test from "node:test";
import assert from "node:assert/strict";
import { changeMaterials, currentMaterial } from "../src/lib/change-reading.ts";
import type {
  ChangeGroup,
  ChangeCandidate,
  ChangeState,
  DocumentRef,
} from "../src/lib/model.ts";
const directory = "docs/project/changes/example";
function group(size = "large"): ChangeGroup {
  return {
    id: "example",
    title: "example",
    primary: "record",
    diagnostics: [],
    relations: [],
    candidates: [
      {
        key: "record",
        directory,
        state: {
          size,
          stage: "execution",
          previews: [],
        } as unknown as ChangeState,
        documentIds: ["requirement", "review", "research", "outside"],
        validCompleted: false,
      } as ChangeCandidate,
    ],
  };
}
const documents = [
  {
    id: "requirement",
    path: `${directory}/requirement.md`,
    kind: "markdown",
    title: "需求",
    readable: true,
  },
  {
    id: "review",
    path: `${directory}/review.md`,
    kind: "unsupported",
    title: "评审",
    readable: false,
  },
  {
    id: "research",
    path: `${directory}/assets/research.md`,
    kind: "markdown",
    title: "调查",
    readable: true,
  },
  {
    id: "outside",
    path: "docs/project/specs/platform/spec.md",
    kind: "markdown",
    title: "能力",
    readable: true,
  },
] as DocumentRef[];
test("materials distinguish absent required files, future files and unreadable records", () => {
  const items = changeMaterials(group(), documents);
  assert.equal(items.find((item) => item.id === "execution")?.missing, true);
  assert.equal(
    items.find((item) => item.id === "review")?.document?.readable,
    false,
  );
  assert.equal(items.find((item) => item.id === "review")?.missing, undefined);
  assert.equal(
    changeMaterials(group("small"), documents).find(
      (item) => item.id === "plan",
    )?.unavailable,
    "当前规模不要求",
  );
  assert.equal(
    items.find((item) => item.id === "file:assets/research.md")?.title,
    "调查",
  );
  assert.equal(
    items.some((item) => item.document?.id === "outside"),
    false,
  );
});
test("document links map to stable materials across workbench and anonymous reading", () => {
  const items = changeMaterials(group(), documents);
  assert.equal(
    currentMaterial(items, { doc: "requirement", ct: "overview" }).id,
    "requirement",
  );
  assert.equal(
    currentMaterial(items, { document: "assets/research.md" }).id,
    "file:assets/research.md",
  );
  assert.equal(currentMaterial(items, { ct: "documents" }).id, "requirement");
  assert.equal(currentMaterial(items, { ct: "previews" }).id, "prototypes");
  assert.equal(currentMaterial(items, { ct: "invalid" }).id, "overview");
});
test("existing extra Markdown documents open through current and legacy links", () => {
  for (const file of ["research.md", "assets/research.md"]) {
    const extra = {
      ...documents[2],
      path: `${directory}/${file}`,
    };
    const items = changeMaterials(group(), [
      ...documents.filter((document) => document.id !== extra.id),
      extra,
    ]);
    const queries: Record<string, string>[] = [
      { ct: `file:${file}` },
      { doc: extra.id, ct: "overview" },
      { document: file, ct: "documents" },
      { document: file, ct: "file:deleted.md" },
    ];
    for (const query of queries) {
      const material = currentMaterial(items, query);
      assert.equal(material.id, `file:${file}`);
      assert.equal(material.document, extra);
      assert.equal(material.missing, undefined);
    }
  }
});
test("removed extra documents remain explicit missing targets instead of opening other material", () => {
  const items = changeMaterials(
    group(),
    documents.filter((document) => document.id !== "research"),
  );
  for (const file of ["research.md", "assets/research.md"]) {
    const queries: Record<string, string>[] = [
      { document: file },
      { document: file, ct: "documents" },
      { document: file, ct: "requirement" },
      { ct: `file:${file}` },
    ];
    for (const query of queries) {
      const material = currentMaterial(items, query);
      assert.equal(material.id, `file:${file}`);
      assert.equal(material.file, file);
      assert.equal(material.missing, true);
      assert.equal(material.document, undefined);
    }
  }
});
