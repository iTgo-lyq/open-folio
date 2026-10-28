import { z } from "zod";
import {
  DIRECTORY_STATES,
  readDirectoryQuery,
  type DirectoryScope,
} from "./change-directory.ts";

const values = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[^\r\n\u2028\u2029]+$/),
  )
  .max(50)
  .transform((v) => [...new Set(v)]);
export const savedChangeQuerySchema = z
  .object({
    states: z
      .array(z.enum(DIRECTORY_STATES))
      .max(4)
      .transform((v) => [...new Set(v)]),
    creators: z.object({ self: z.boolean(), values }).strict(),
    types: values,
    noTypes: z.boolean(),
    urgencies: z
      .array(z.enum(["urgent", "high", "normal", "low"]))
      .max(4)
      .transform((v) => [...new Set(v)]),
    display: z.enum(["list", "board"]),
    group: z.enum(["status", "stage", "none"]),
    sort: z.enum(["created", "urgency"]),
    showCreator: z.boolean().default(false),
  })
  .strict();
const viewId = z.union([z.literal("mine"), z.string().uuid()]);
export const savedChangeViewSchema = z
  .object({
    id: viewId,
    name: z
      .string()
      .trim()
      .refine(
        (v) =>
          [...v].length > 0 &&
          [...v].length <= 40 &&
          !/[\r\n\u2028\u2029]/.test(v),
        "名称应为 1–40 个字符",
      ),
    hidden: z.boolean(),
    query: savedChangeQuerySchema,
  })
  .strict();
export const viewsSchema = z
  .array(savedChangeViewSchema)
  .max(30, "每个仓库最多保存 30 个视图")
  .superRefine((views, ctx) => {
    for (const key of ["id", "name"] as const)
      if (new Set(views.map((v) => v[key])).size !== views.length)
        ctx.addIssue({
          code: "custom",
          message: key === "name" ? "视图名称不能重复" : "视图标识不能重复",
        });
  });
export const selectedViewSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("personal"), id: viewId }).strict(),
  z
    .object({ kind: z.literal("system"), id: z.enum(DIRECTORY_STATES) })
    .strict(),
]);
export const repositoryViewsSchema = z
  .object({
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    views: viewsSchema,
    selected: selectedViewSchema,
  })
  .strict()
  .refine(
    (value) =>
      new TextEncoder().encode(JSON.stringify(value)).length <= 64 * 1024,
    "视图配置超过 64 KiB，请减少筛选条件或视图数量",
  );
export const saveViewsSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    views: viewsSchema,
    selectAfterSave: viewId.optional(),
  })
  .strict();
export const selectViewSchema = z
  .object({ selected: selectedViewSchema })
  .strict();
export type SavedChangeQuery = z.infer<typeof savedChangeQuerySchema>;
export type SavedChangeView = z.infer<typeof savedChangeViewSchema>;
export type SelectedView = z.infer<typeof selectedViewSchema>;
export type RepositoryViews = z.infer<typeof repositoryViewsSchema>;
export const systemQuery = (
  state: DirectoryScope = "active",
): SavedChangeQuery => ({
  states: [state],
  creators: { self: false, values: [] },
  types: [],
  noTypes: false,
  urgencies: [],
  display: "list",
  group: "status",
  sort: "created",
  showCreator: false,
});
export function defaultRepositoryViews(): RepositoryViews {
  const query = systemQuery();
  query.creators.self = true;
  return {
    revision: 1,
    views: [{ id: "mine", name: "我的", hidden: false, query }],
    selected: { kind: "personal", id: "mine" },
  };
}
export function validSelection(
  views: SavedChangeView[],
  selected: SelectedView,
): SelectedView {
  return selected.kind === "system" ||
    views.some((v) => v.id === selected.id && !v.hidden)
    ? selected
    : views.some((v) => v.id === "mine" && !v.hidden)
      ? { kind: "personal", id: "mine" }
      : { kind: "system", id: "active" };
}
export function selectedQuery(record: RepositoryViews, selected: SelectedView) {
  return selected.kind === "system"
    ? systemQuery(selected.id)
    : record.views.find((v) => v.id === selected.id && !v.hidden)?.query;
}
export const selectionKey = (selected: SelectedView) =>
  selected.kind === "system" ? `system:${selected.id}` : selected.id;
export function queryFromUrl(q: Record<string, string>): SavedChangeQuery {
  const parsed = readDirectoryQuery(q);
  return {
    states: parsed.states,
    creators: { self: parsed.creatorSelf, values: parsed.creators },
    types: parsed.labels.types,
    noTypes: parsed.labels.noTypes,
    urgencies: parsed.urgencies as SavedChangeQuery["urgencies"],
    display: parsed.view,
    group: parsed.group,
    sort: parsed.labels.sortByUrgency ? "urgency" : "created",
    showCreator: parsed.showCreator,
  };
}
export function queryToUrl(
  query: SavedChangeQuery,
): Record<string, string | null> {
  return {
    scope: query.states.length === 1 ? query.states[0] : null,
    states: JSON.stringify(query.states),
    creatorSelf: query.creators.self ? "1" : null,
    creator: query.creators.values.length
      ? JSON.stringify(query.creators.values)
      : null,
    types: query.types.length ? JSON.stringify(query.types) : null,
    noTypes: query.noTypes ? "1" : null,
    urgency: query.urgencies.length ? JSON.stringify(query.urgencies) : null,
    view: query.display === "board" ? "board" : null,
    group: query.group === "status" ? null : query.group,
    sort: query.sort === "urgency" ? "urgency" : null,
    showCreator: query.showCreator ? "1" : null,
    issues: null,
  };
}
export const hasDirectoryQuery = (q: Record<string, string>) =>
  [
    "scope",
    "states",
    "creatorSelf",
    "creator",
    "types",
    "noTypes",
    "urgency",
    "view",
    "group",
    "sort",
    "showCreator",
    "issues",
    "changeView",
    "c",
  ].some((k) => Object.hasOwn(q, k));
export function sameQuery(a: SavedChangeQuery, b: SavedChangeQuery) {
  const normalize = (q: SavedChangeQuery) => ({
    ...q,
    states: [...q.states].sort(),
    types: [...q.types].sort(),
    urgencies: [...q.urgencies].sort(),
    creators: { self: q.creators.self, values: [...q.creators.values].sort() },
  });
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
