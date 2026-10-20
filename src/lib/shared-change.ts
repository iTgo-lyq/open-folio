import type { ChangeGroup, DocumentRef } from "./model.ts";

export type SharedChange = {
  snapshotId: string;
  capturedAt: string;
  projectName: string;
  change: ChangeGroup;
  documents: DocumentRef[];
};
