import type { CurrentPrototypeEntry, Snapshot } from "./model";
export type PrototypeItem = CurrentPrototypeEntry & { thumbnail?: string };
export type PrototypeCatalog = {
  snapshotId: string;
  revision: string | null;
  policy: Snapshot["prototype"];
  items: PrototypeItem[];
  issues: string[];
  message?: string;
};
export const DEVICE_LABELS = {
  "pc-web": "PC Web",
  ipad: "iPad",
  mobile: "移动设备",
};
export function matchesPrototype(
  item: PrototypeItem,
  query: string,
  device: string,
) {
  const term = query.trim().toLocaleLowerCase();
  return (
    (!device ||
      (device === "custom"
        ? !!item.viewport
        : item.devices?.some((d) => d === device))) &&
    (!term ||
      `${item.title} ${item.description ?? ""} ${item.id}`
        .toLocaleLowerCase()
        .includes(term))
  );
}
