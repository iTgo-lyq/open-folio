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
/** Transient preview/detail routing; catalog filters and scroll remain intact. */
export const CLEAR_PROTOTYPE_VIEW = {
  prototype: null,
  pdetail: null,
  c: null,
  ct: null,
  preview: null,
  device: null,
  orientation: null,
  revision: null,
  zoom: null,
};
