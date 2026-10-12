export type RepositoryState =
  | "ready"
  | "attention"
  | "not-integrated"
  | "unavailable";
export type DiscoveryState = "running" | "complete" | "partial" | "interrupted";
export interface DiscoverySummary {
  state: DiscoveryState;
  checked: number;
  found: number;
  failed: number;
  hasMore: boolean;
  message?: string;
  retryAfter?: string;
  updatedAt: string;
}
