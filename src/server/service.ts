import 'server-only';
import { SnapshotStore } from './store.ts';
import { dataDirectory } from './config.ts';
const globalStore = globalThis as typeof globalThis & { openfolioStores?: Map<string, SnapshotStore> };
export function service() {
  const root = dataDirectory();
  globalStore.openfolioStores ??= new Map();
  if (!globalStore.openfolioStores.has(root)) globalStore.openfolioStores.set(root, new SnapshotStore(root));
  return globalStore.openfolioStores.get(root)!;
}
