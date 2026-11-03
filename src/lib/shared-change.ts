import type { ChangeGroup, DocumentRef, Delivery } from "./model.ts";

export type SharedChange = {
  snapshotId: string;
  capturedAt: string;
  projectName: string;
  spacePath?: string;
  change: ChangeGroup;
  documents: DocumentRef[];
  delivery?: Delivery;
};
