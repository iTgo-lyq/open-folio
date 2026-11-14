// setup group, documented in references/setup/setup.md. Each command loads its
// script on demand, so a broken script never stops the readiness check itself.
import { define } from "../define.mjs";

export const commands = {
  check: define(async (values) => (await import("./check-setup.mjs")).runSetupCheck(values), {
    summary: "Read-only readiness check of workflow, branches, validator resources and hook entry; exit 1 when not ready",
    optional: ["repo"],
    example: "--repo .",
  }),
  "preview-routing": define(async (values) => (await import("./preview-routing.mjs")).runPreviewRouting(values), {
    summary: "Read-only preview of Change routing from a baseline, registered worktrees and given work branches (no network)",
    optional: ["baseline", "repo"],
    multiple: ["work-branch"],
    help: {
      baseline: { value: "branch", text: "Baseline branch (default: integration branch)" },
      "work-branch": { value: "branch", text: "Work branch to include" },
    },
    example: "--work-branch change/example",
  }),
  "pre-commit": define(async (values) => (await import("./pre-commit.mjs")).runPreCommit(values), {
    summary: "Validate staged SpecTrail state files in the index Git commits (honors GIT_INDEX_FILE); exit 1 rejects the commit",
    optional: ["repo"],
    notes: ["Hooks redirect stdout to /dev/null; rejection diagnostics go to stderr."],
    example: "--repo .",
  }),
  "check-pr": define(async (values) => (await import("./check-pr.mjs")).runCheckPullRequest(values), {
    summary: "Require valid completed archives for a pull request (archive CI)",
    optional: ["event", "repo"],
    help: { event: { value: "file", text: "GitHub pull_request event JSON (default: GITHUB_EVENT_PATH)" } },
    example: '--event "$GITHUB_EVENT_PATH"',
  }),
};
