import "server-only";
import { SnapshotStore } from "./store.ts";
import { dataDirectory } from "./config.ts";
import { join } from "node:path";
import { ThumbnailCache } from "./thumbnail-cache.ts";
const globalStore = globalThis as typeof globalThis & {
  openfolioStores?: Map<string, SnapshotStore>;
  openfolioThumbnails?: Map<string, ThumbnailCache>;
};
export function thumbnails() {
  const root = dataDirectory();
  globalStore.openfolioThumbnails ??= new Map();
  if (!globalStore.openfolioThumbnails.has(root))
    globalStore.openfolioThumbnails.set(
      root,
      new ThumbnailCache(join(root, "thumbnails")),
    );
  return globalStore.openfolioThumbnails.get(root)!;
}
export function service() {
  const root = dataDirectory();
  globalStore.openfolioStores ??= new Map();
  if (!globalStore.openfolioStores.has(root))
    globalStore.openfolioStores.set(root, new SnapshotStore(root));
  return globalStore.openfolioStores.get(root)!;
}
