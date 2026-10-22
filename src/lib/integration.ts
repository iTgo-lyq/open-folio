import type { IntegrationResult } from "./model.ts";

export type IntegrationFile = {
  id: string;
  path: string;
  oldPath?: string;
  status: string;
  kind: "text" | "binary" | "submodule" | "symlink" | "mode-only";
  oldMode: string;
  newMode: string;
  added: number | null;
  removed: number | null;
};
export type IntegrationSummary = {
  record: IntegrationResult;
  integrationBranch: string | null;
  command?: string;
  stats?: {
    total: number;
    added: number;
    removed: number;
    unstatable: number;
    complete: true;
  };
};
export type IntegrationFiles = {
  files: IntegrationFile[];
  total: number;
  next: string | null;
};
export type DiffLine = {
  kind: "context" | "add" | "remove" | "hunk" | "note";
  text: string;
  old?: number;
  new?: number;
};
export type IntegrationDiff = {
  file: IntegrationFile;
  kind: IntegrationFile["kind"] | "non-utf8" | "lfs" | "limited" | "empty";
  message?: string;
  lines: DiffLine[];
};
