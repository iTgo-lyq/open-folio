function define(run, { required = [], optional = [], booleans = [], multiple = [], note } = {}) {
  return {
    run,
    required,
    note,
    options: Object.fromEntries([
      ...[...required, ...optional].map(name => [name, { type: "string" }]),
      ...booleans.map(name => [name, { type: "boolean", default: false }]),
      ...multiple.map(name => [name, { type: "string", multiple: true, default: [] }]),
    ]),
  };
}

const change = (required = [], optional = [], note) => define(
  async (command, values) => (await import("./change.mjs")).runChange(command, values),
  { required: ["change", ...required], optional: ["repo", ...optional], booleans: ["dry-run"], note },
);
const workspace = (optional = [], booleans = []) => define(
  async (command, values) => (await import("./workspace.mjs")).runWorkspace(command, values),
  { required: ["change"], optional: ["repo", ...optional], booleans },
);
const integration = (required = [], optional = []) => define(
  async (command, values) => (await import("./integration.mjs")).runIntegration(command, values),
  { required: ["change", ...required], optional: ["repo", ...optional] },
);

export const commands = {
  change: {
    create: change(["title", "size"], [
      "depends-on", "parent", "children", "follow-up-of", "group-title",
      "types", "urgency", "collaborators",
    ]),
    labels: change([], ["types", "urgency"], "Provide --types or --urgency."),
    collaborators: change(["members"]),
    "follow-up": change(["target"], ["group-title"]),
    show: change(),
    retitle: change(["title"]),
    "clarification-ask": change(["round", "text", "recommendation"], ["question"]),
    "clarification-answer": change(["question", "answer"], ["source"]),
    "clarification-withdraw": change(["question", "reason"]),
    confirm: change(["phase", "summary", "source"], ["source-commit", "target-commit", "base-commit"]),
    "task-add": change(["title"], ["task", "branch"]),
    "task-start": change(["task"]),
    "task-block": change(["task", "reason"]),
    "task-complete": change(["task", "verification"], ["commit-title"]),
    "task-retry": change(["task"]),
    execute: change([], ["availability-note"]),
    wait: change(["kind", "summary"]),
    resume: change(),
    rework: change(["stage", "reason", "approach"]),
    verify: change(["result", "summary"], ["availability-note"]),
    accept: change(["mode", "summary", "source"], ["availability-note"]),
    specs: change(["result", "summary"]),
    archive: change(["date", "summary"], ["availability-note"]),
    cancel: change(["reason"]),
    "previews-set": change(["file"]),
  },
  workspace: {
    locate: workspace(),
    prepare: workspace(["path"], ["dry-run"]),
    handoff: workspace(["branch", "path", "availability-note"], ["dry-run"]),
  },
  integration: {
    preflight: integration(),
    verify: integration(),
    cleanup: integration(["verified-commit"], ["idle-worktree"]),
  },
  share: {
    link: define(async (_command, values) => {
      const { getShareLink } = await import("./share.mjs");
      return { output: await getShareLink(values) };
    }, {
      required: ["change"],
      optional: ["repo", "document", "preview"],
      note: "Choose at most one of --document and --preview.",
    }),
  },
};
