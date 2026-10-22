import { primaryRecord, type ChangeGroup, type DocumentRef } from "./model.ts";
import { documentExpectation } from "./workflow.ts";
export const CHANGE_DOCUMENTS = [
  ["requirement", "需求"],
  ["technical", "技术方案"],
  ["plan", "计划"],
  ["execution", "执行记录"],
  ["review", "评审记录"],
] as const;
export type ChangeMaterial = {
  id: string;
  title: string;
  section?: "文档" | "交付";
  document?: DocumentRef;
  file?: string;
  missing?: boolean;
  unavailable?: string;
};
export function changeMaterials(
  group: ChangeGroup,
  documents: DocumentRef[],
  hasIntegration = false,
): ChangeMaterial[] {
  const record = primaryRecord(group);
  const own = documents.filter(
    (document) =>
      record?.documentIds.includes(document.id) &&
      document.path.startsWith(`${record.directory}/`),
  );
  const items: ChangeMaterial[] = [
    { id: "overview", title: "概览" },
    { id: "tasks", title: record?.state?.size === "xlarge" ? "子项" : "任务" },
  ];
  for (const [id, title] of CHANGE_DOCUMENTS) {
    const file = `${id}.md`,
      document = own.find(
        (document) => document.path === `${record?.directory}/${file}`,
      );
    const expectation = documentExpectation(record?.state ?? null, file);
    items.push({
      id,
      title,
      section: "文档",
      file,
      ...(document
        ? { document }
        : expectation === "缺失"
          ? { missing: true }
          : { unavailable: expectation }),
    });
  }
  const extras = own.filter(
    (document) =>
      document.path.endsWith(".md") &&
      !CHANGE_DOCUMENTS.some(
        ([id]) => document.path === `${record?.directory}/${id}.md`,
      ),
  );
  for (const document of extras) {
    const file = document.path.slice((record?.directory.length ?? 0) + 1);
    items.push({
      id: `file:${file}`,
      title: document.title,
      section: "文档",
      document,
      file,
    });
  }
  items.push(
    {
      id: "prototypes",
      title: "原型",
      section: "交付",
      ...(!record?.state?.previews?.length
        ? { unavailable: "这个 Change 没有登记原型。" }
        : {}),
    },
    {
      id: "integration",
      title: "合入变更",
      section: "交付",
      ...(!hasIntegration && !record?.validCompleted
        ? { unavailable: "尚未合入。" }
        : {}),
    },
    { id: "evidence", title: "依据", section: "交付" },
  );
  return items;
}
export function currentMaterial(
  items: ChangeMaterial[],
  query: Record<string, string>,
) {
  const oldDocument = items.find(
    (item) =>
      (query.doc && item.document?.id === query.doc) ||
      (query.document && item.file === query.document),
  );
  if (oldDocument) return oldDocument;
  const missingFile =
    query.document ??
    (query.ct?.startsWith("file:") ? query.ct.slice(5) : undefined);
  if (missingFile)
    return {
      id: `file:${missingFile}`,
      title: missingFile.split("/").at(-1) ?? "文档",
      section: "文档" as const,
      file: missingFile,
      missing: true,
    };
  const key =
    query.ct === "previews"
      ? "prototypes"
      : query.ct === "documents"
        ? "requirement"
        : query.ct;
  return items.find((item) => item.id === key) ?? items[0];
}

export function documentReadingTarget(
  data: {
    documents: DocumentRef[];
    specs: { id: string; documentId: string }[];
    changes: ChangeGroup[];
  },
  id: string,
): Record<string, string | null> | null {
  const spec = data.specs.find((spec) => spec.documentId === id);
  if (spec) return { m: "specs", s: spec.id, c: null, ct: null };
  const document = data.documents.find((document) => document.id === id);
  if (!document?.path.endsWith(".md")) return null;
  const owner = data.changes.find((group) =>
    primaryRecord(group)?.documentIds.includes(id),
  );
  const record = owner && primaryRecord(owner);
  if (!owner || !record || !document.path.startsWith(`${record.directory}/`))
    return null;
  const file = document.path.slice(record.directory.length + 1);
  const declared = CHANGE_DOCUMENTS.find(([key]) => file === `${key}.md`);
  return { m: "changes", c: owner.id, ct: declared?.[0] ?? `file:${file}` };
}
