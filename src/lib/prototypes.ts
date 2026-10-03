import type { ChangeState, PreviewEntry, Snapshot } from "./model";

export type PrototypeReference = {
  changeId: string;
  changeTitle: string;
  status: ChangeState["status"];
  archived: boolean;
  recordCommit: string;
  entry: PreviewEntry;
};
export type PrototypeItem = {
  key: string;
  path: string;
  kind: PreviewEntry["kind"];
  title: string;
  references: PrototypeReference[];
};
export type PrototypeCatalog = {
  snapshotId: string;
  policy: Snapshot["prototype"];
  items: PrototypeItem[];
  issues: { changeId: string; changeTitle: string; message: string }[];
};
export const DEVICE_LABELS = {
  "pc-web": "PC Web",
  ipad: "iPad",
  mobile: "移动设备",
};
export function matchingPrototypeReferences(
  item: PrototypeItem,
  query: string,
  device: string,
) {
  const term = query.trim().toLocaleLowerCase();
  return item.references.filter(({ entry, changeId, changeTitle }) => {
    const supports =
      !device ||
      (device === "custom"
        ? !!entry.viewport
        : entry.devices?.some((d) => d === device));
    return (
      supports &&
      (!term ||
        `${entry.title} ${entry.id} ${item.path} ${changeId} ${changeTitle}`
          .toLocaleLowerCase()
          .includes(term))
    );
  });
}
