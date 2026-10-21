import "server-only";
import {
  primaryRecord,
  type ChangeGroup,
  type Snapshot,
} from "../lib/model.ts";
import type { SharedChange } from "../lib/shared-change.ts";
import { AppError } from "./errors.ts";

// Construct the public payload from the selected Change, never from a Workbench spread.
export function projectChange(
  snapshot: Snapshot,
  changeId: string,
  projectName: string,
): SharedChange {
  const source = snapshot.changes.find((g) => g.id === changeId);
  if (!source || !primaryRecord(source))
    throw new AppError(
      "SHARE_SOURCE_UNAVAILABLE",
      "该 Change 的来源暂不可用。",
      404,
    );
  const change: ChangeGroup = {
    id: source.id,
    title: source.title,
    primary: source.primary,
    createdAt: source.createdAt,
    source: source.source,
    diagnostics: source.diagnostics,
    relations: source.relations,
    candidates: source.candidates.map((c) => ({
      key: c.key,
      id: c.id,
      title: c.title,
      branch: c.branch,
      commit: c.commit,
      directory: c.directory,
      archived: c.archived,
      jsonDocumentId: c.jsonDocumentId,
      documentIds: c.documentIds,
      state: c.state,
      diagnostics: c.diagnostics,
      validCompleted: c.validCompleted,
      taskGraph: c.taskGraph,
      relatedSpecs: c.relatedSpecs,
      specReferences: c.specReferences,
    })),
  };
  const documents = snapshot.documents.filter(
    (d) =>
      source.candidates.some(
        (c) =>
          c.documentIds.includes(d.id) &&
          d.branch === c.branch &&
          d.commit === c.commit &&
          d.path.startsWith(`${c.directory}/`),
      ) ||
      (d.kind === "json" &&
        source.source &&
        d.path === source.source.entryPath &&
        d.branch === source.source.entryBranch &&
        d.commit === source.source.entryCommit),
  );
  return {
    snapshotId: snapshot.id,
    capturedAt: snapshot.capturedAt,
    projectName,
    change,
    documents,
    ...(snapshot.deliveryByChange?.[changeId]
      ? { delivery: snapshot.deliveryByChange[changeId] }
      : {}),
  };
}
