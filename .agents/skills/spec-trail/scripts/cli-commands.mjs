function define(run, { required = [], optional = [], booleans = [], multiple = [], note } = {}) {
  return {
    run,
    required,
    note,
    options: Object.fromEntries([
      ...[...required.filter(name => !booleans.includes(name)), ...optional]
        .map(name => [name, { type: "string" }]),
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
const prototypeSetup = () => define(
  async (command, values) => (await import("../prototype/scripts/setup.mjs")).runPrototypeSetup(command, values),
  {
    optional: ["repo", "package", "design", "hosting", "openfolio-url", "upload-url"],
    booleans: ["fetch-upload-url"],
    note: "Use --fetch-upload-url with --hosting openfolio instead of --upload-url.",
  },
);
const publication = (required = [], optional = [], note) => define(
  async (command, values) => (await import("../prototype/scripts/publish.mjs")).runPrototypePublication(command, values),
  { required, optional: ["repo", ...optional], note },
);
const archiveTags = (deleting = false) => define(
  async (command, values) => (await import("./retire-archive-tags.mjs")).runArchiveTags(command, values),
  {
    required: deleting ? ["manifest", "service-ready"] : ["manifest"],
    optional: ["repo"],
    ...(deleting && {
      booleans: ["service-ready"],
      note: "Pass --service-ready after verifying the deployed reader and stopping old archive writers.",
    }),
  },
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
  setup: {
    check: define(
      async (command, values) => (await import("../setup/scripts/check-setup.mjs")).runSetupCheck(command, values),
      { optional: ["repo"] },
    ),
    "preview-routing": define(
      async (command, values) => (await import("../setup/scripts/preview-routing.mjs")).runPreviewRouting(command, values),
      { optional: ["repo", "baseline"], multiple: ["work-branch"] },
    ),
    "pre-commit": define(
      async (command, values) => (await import("../setup/scripts/pre-commit.mjs")).runPreCommit(command, values),
      { optional: ["repo"] },
    ),
    "check-pr": define(
      async (command, values) => (await import("../setup/scripts/check-pr.mjs")).runCheckPullRequest(command, values),
      { optional: ["repo", "event"], note: "Provide --event or set GITHUB_EVENT_PATH." },
    ),
  },
  prototype: {
    accept: prototypeSetup(),
    decline: prototypeSetup(),
    enable: prototypeSetup(),
    configure: prototypeSetup(),
    validate: define(
      async (command, values) => (await import("../prototype/scripts/validate.mjs")).runPrototypeValidation(command, values),
      { optional: ["repo", "package", "playwright"], booleans: ["browser"] },
    ),
    prepare: publication(["directory", "entries", "repository", "out"], ["package"]),
    upload: publication(["request", "result"], ["change", "upload-url", "openfolio-url"]),
    register: publication(
      [], ["change", "git-entry", "request", "result", "package", "repository"],
      "Provide --git-entry or both --request and --result.",
    ),
    associate: publication(["change"], ["entry"]),
    recover: publication(),
  },
  maintenance: {
    "version-next": define(async (_command, values) => {
      const { nextVersion, readVersion } = await import("./version.mjs");
      return { output: { version: nextVersion(readVersion(values.file)) } };
    }, { required: ["file"] }),
    "archive-tags-list": archiveTags(),
    "archive-tags-delete": archiveTags(true),
  },
};
