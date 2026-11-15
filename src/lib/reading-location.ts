import { changeMaterials, currentMaterial } from "./change-reading.ts";
import { primaryRecord, type SpecRef, type Workbench } from "./model.ts";
import { CLEAR_PROTOTYPE_VIEW } from "./prototypes.ts";

type Query = Record<string, string>;
type Patch = Record<string, string | null>;

const clearDocument = { doc: null, da: null, raw: null, asset: null };
const clearPreview = {
  preview: null,
  revision: null,
  device: null,
  orientation: null,
  zoom: null,
};
const clearMaterial = {
  ...clearDocument,
  ...clearPreview,
  document: null,
  anchor: null,
  cf: null,
  cv: null,
};

function nearestSpec(specs: SpecRef[], id: string) {
  const path = id.split("/");
  for (let depth = path.length - 1; depth > 0; depth--) {
    const parent = path.slice(0, depth).join("/");
    const spec = specs.find((item) => item.id === parent);
    if (spec) return spec;
  }
  for (let depth = path.length; depth > 0; depth--) {
    const prefix = `${path.slice(0, depth).join("/")}/`;
    const spec = specs.find((item) => item.id.startsWith(prefix));
    if (spec) return spec;
  }
  return specs[0];
}

function materialAt(data: Workbench, q: Query) {
  const change = data.changes.find((item) => item.id === q.c);
  return change && currentMaterial(changeMaterials(change, data.documents), q);
}

export function repairReadingLocation(
  q: Query,
  next: Workbench,
  previous?: Workbench | null,
): Patch | null {
  if (!["specs", "changes", "prototypes"].includes(q.m)) return null;
  const patch: Patch = {};
  if (q.doc && !next.documents.some((doc) => doc.id === q.doc))
    Object.assign(patch, clearDocument);

  if (q.m === "specs" && q.s) {
    const spec = next.specs.find((item) => item.id === q.s);
    if (!spec) {
      if (next.selectedBranch) {
        const readable = new Set(
          next.documents.filter((doc) => doc.readable).map((doc) => doc.id),
        );
        const fallback = nearestSpec(
          next.specs.filter((item) => readable.has(item.documentId)),
          q.s,
        );
        return {
          ...patch,
          s: fallback?.id ?? null,
          branch: fallback?.branch ?? null,
          anchor: null,
          raw: null,
        };
      }
    } else if (q.anchor) {
      const doc = next.documents.find((item) => item.id === spec.documentId);
      const related =
        q.anchor === "related-changes" &&
        next.changes.some((group) =>
          primaryRecord(group)?.relatedSpecs.includes(spec.id),
        );
      if (
        doc?.readable &&
        !related &&
        !doc.headings.some((heading) => heading.id === q.anchor)
      )
        patch.anchor = null;
    }
  }

  if (q.m === "changes" && q.c) {
    const change = next.changes.find((item) => item.id === q.c);
    if (!change)
      return next.historyPending
        ? null
        : { ...clearMaterial, c: null, ct: null };

    const material = currentMaterial(
      changeMaterials(change, next.documents),
      q,
    );
    const removedDocument =
      material.file &&
      !material.document &&
      (material.id.startsWith("file:") ||
        (previous && materialAt(previous, q)?.document));
    if (removedDocument) return { ...clearMaterial, ct: "overview" };
    if (material.id === "overview" && q.ct && q.ct !== "overview")
      return { ...clearMaterial, ct: "overview" };

    const doc = material.document;
    if (
      q.anchor &&
      doc?.readable &&
      !doc.headings.some((h) => h.id === q.anchor)
    )
      patch.anchor = null;

    const record = primaryRecord(change);
    if (
      material.id === "prototypes" &&
      q.preview &&
      !q.revision &&
      record?.state &&
      !record.state.previews?.some((entry) => entry.id === q.preview)
    )
      Object.assign(patch, clearPreview);
  }

  if (
    q.m === "prototypes" &&
    (!next.currentPrototype.message || next.prototype.status === "disabled")
  ) {
    const { entries } = next.currentPrototype;
    if (
      q.prototype &&
      !q.revision &&
      !entries.some((entry) => entry.id === (q.preview || q.prototype))
    )
      Object.assign(patch, CLEAR_PROTOTYPE_VIEW);
    if (q.pdetail && !entries.some((entry) => entry.id === q.pdetail))
      patch.pdetail = null;
  }

  return Object.keys(patch).length ? patch : null;
}
