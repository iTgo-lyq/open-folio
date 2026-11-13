// Help shared by options with the same meaning; a command overrides an entry when its meaning differs.
const shared = {
  change: { value: "id", text: "Change id: lowercase kebab-case, same as its directory name" },
  repo: { value: "path", text: "Repository or worktree to use (default: current directory)" },
  "dry-run": { text: "Preview the result without writing files, commits, refs or worktrees" },
  task: { value: "Tn", text: "Task id such as T1" },
  title: { value: "text", text: "Single-line title naming the deliverable and its change or result" },
  reason: { value: "text", text: "Actual reason, in one line" },
  summary: { value: "text", text: "What was actually done and the evidence" },
  source: { value: "text", text: "User's actual words or a reference to them" },
  "availability-note": {
    value: "text",
    text: "Evidence that a prerequisite delivery is integrated when Git ancestry cannot prove it (e.g. after a squash); record it in execution.md first",
  },
  types: { value: "json", text: 'Labels as a JSON string array, e.g. \'["修复","安全"]\'; \'[]\' clears them' },
  urgency: { choices: ["urgent", "high", "normal", "low"], text: "Urgency; normal removes the field" },
  "group-title": { value: "text", text: "Name of a new follow-up group; usually omitted to inherit the existing group name" },
  package: { value: "path", text: "Prototype package path relative to the repository (default: workflow prototype.packagePath, else packages/prototype)" },
  hosting: { choices: ["openfolio", "custom", "git"], text: "Prototype hosting saved in workflow.json" },
  "openfolio-url": { value: "url|none", text: "OpenFolio service root URL saved as workflow openfolioUrl; none saves null" },
  "upload-url": { value: "url", text: "Upload URL provided by the OpenFolio administrator or custom host; requires --hosting" },
  request: { value: "file", text: "Publish request written by prototype prepare (keep it outside the repository)" },
  result: { value: "file", text: "Publish result file from the host (keep it outside the repository)" },
  entry: { value: "id", text: "Prototype entry id from prototype.json" },
};

function define(run, {
  summary, required = [], optional = [], booleans = [], multiple = [], help = {}, notes = [], example = "",
}) {
  const names = [...required, ...optional, ...booleans.filter(name => !required.includes(name)), ...multiple];
  return {
    run,
    summary,
    required,
    notes,
    example,
    options: Object.fromEntries(names.map(name => {
      const parse = booleans.includes(name)
        ? { type: "boolean", default: false }
        : multiple.includes(name)
          ? { type: "string", multiple: true, default: [] }
          : { type: "string" };
      return [name, { ...parse, ...shared[name], ...help[name] }];
    })),
  };
}

const change = (summary, { required = [], optional = [], help, notes, example = "" } = {}) => define(
  async (command, values) => (await import("./change.mjs")).runChange(command, values),
  {
    summary,
    required: ["change", ...required],
    optional: [...optional, "repo"],
    booleans: ["dry-run"],
    help: { "dry-run": { text: `${shared["dry-run"].text}; also skips the skill update check` }, ...help },
    notes,
    example: `--change example${example}`,
  },
);
const workspace = (summary, { optional = [], booleans = [], help, notes } = {}) => define(
  async (command, values) => (await import("./workspace.mjs")).runWorkspace(command, values),
  { summary, required: ["change"], optional: [...optional, "repo"], booleans, help, notes, example: "--change example" },
);
const integration = (summary, { required = [], optional = [], help, notes, example = "" } = {}) => define(
  async (command, values) => (await import("./integration.mjs")).runIntegration(command, values),
  { summary, required: ["change", ...required], optional: [...optional, "repo"], help, notes, example: `--change example${example}` },
);
const prototypeSetup = (summary, example) => define(
  async (command, values) => (await import("../prototype/scripts/setup.mjs")).runPrototypeSetup(command, values),
  {
    summary,
    optional: ["package", "design", "hosting", "openfolio-url", "upload-url", "repo"],
    booleans: ["fetch-upload-url"],
    help: {
      design: { value: "file", text: "Existing design standard in the repository that DESIGN.md should reference instead of copying" },
      "fetch-upload-url": { text: "Fetch and save the upload URL with OPENFOLIO_ADMIN_PASSWORD; use with --hosting openfolio instead of --upload-url" },
    },
    notes: [
      "accept, decline, enable and configure share these options and save any hosting options given.",
      "--design applies to accept; --package applies to accept, enable and a first configure; decline only records disabled.",
    ],
    example,
  },
);
const publication = (summary, { required = [], optional = [], help, notes, example }) => define(
  async (command, values) => (await import("../prototype/scripts/publish.mjs")).runPrototypePublication(command, values),
  { summary, required, optional: [...optional, "repo"], help, notes, example },
);
const archiveTags = (summary, deleting) => define(
  async (command, values) => (await import("./retire-archive-tags.mjs")).runArchiveTags(command, values),
  {
    summary,
    required: deleting ? ["manifest", "service-ready"] : ["manifest"],
    optional: ["repo"],
    ...(deleting
      ? {
          booleans: ["service-ready"],
          help: {
            manifest: { value: "file", text: "Manifest written by archive-tags-list" },
            "service-ready": { text: "Confirm the deployed reader is verified and old archive writers have stopped" },
          },
          notes: ["Exit code 2 when some tags could not be deleted; the JSON lists each tag's result."],
          example: "--manifest /tmp/archive-tags.json --service-ready",
        }
      : {
          help: { manifest: { value: "file", text: "Manifest file to create; must not exist yet" } },
          example: "--manifest /tmp/archive-tags.json",
        }),
  },
);

export const groups = {
  change: {
    summary: "Change state in docs/project/changes/<id>/change.json",
    notes: [
      "Plan on the integration branch; after handoff, run on the registered work branch.",
      "Commands change only local files (archive and rework move the Change directory, task-retry updates the staged change.json) and never commit or push.",
      "A successful command (or show) may add skillUpdate to the JSON when a newer skill is published.",
    ],
  },
  workspace: { summary: "Work branch registration and Change worktrees" },
  integration: { summary: "Pull request delivery checks and source cleanup after archiving" },
  share: { summary: "OpenFolio links to Change materials" },
  setup: { summary: "Project readiness, routing preview and commit/PR validators" },
  prototype: {
    summary: "Prototype package, publishing and validation",
    notes: ["Requires Node.js 24 or newer."],
  },
  maintenance: { summary: "SpecTrail release and archive tag maintenance" },
};

export const commands = {
  change: {
    create: change("Create a Change in the requirement stage on the integration branch; writes no documents, branches or commits", {
      required: ["title", "size"],
      optional: ["depends-on", "parent", "children", "follow-up-of", "group-title", "types", "urgency", "collaborators"],
      help: {
        size: { choices: ["small", "medium", "large", "xlarge"], text: "Change size by core contract impact and implementation scope" },
        "depends-on": {
          value: "id,id",
          text: "Prerequisite Change ids, comma-separated; execute later requires each to be a pushed, completed archive whose delivery is available",
        },
        parent: { value: "id", text: "Parent xlarge Change id" },
        children: { value: "id,id", text: "Child Change ids in Plan order, comma-separated (xlarge parent)" },
        "follow-up-of": { value: "id", text: "Direct predecessor: a pushed, completed archive" },
        "group-title": { value: "text", text: "Name of a new follow-up group; requires --follow-up-of; usually omitted to inherit" },
        collaborators: {
          value: "json",
          text: 'Supplementary collaborators, e.g. \'[{"name":"显示名","login":"github-login","subjectId":"123"}]\'; name required, no e-mail',
        },
      },
      example: " --title '支持账号切换并保留各自工作台' --size medium --types '[\"新功能\"]'",
    }),
    labels: change("Update the labels of an active Change without touching workflow records", {
      optional: ["types", "urgency"],
      notes: ["Provide --types, --urgency or both."],
      example: " --types '[\"修复\",\"安全\"]' --urgency high",
    }),
    collaborators: change("Replace the supplementary collaborators of an active Change", {
      required: ["members"],
      help: {
        members: {
          value: "json",
          text: 'JSON array of {"name", optional "login", optional "subjectId" as a positive integer string}; \'[]\' removes them',
        },
      },
      example: " --members '[{\"name\":\"显示名\",\"login\":\"github-login\"}]'",
    }),
    "follow-up": change("Link an active Change to the archived delivery it continues, or remove the link", {
      required: ["target"],
      optional: ["group-title"],
      help: { target: { value: "id|none", text: "Archived direct predecessor id, or none to remove the link and its group title" } },
      example: " --target earlier-change",
    }),
    show: change("Read the metadata of an active or archived Change from its registered source (read-only)"),
    retitle: change("Change the display title of an active Change on its owning branch; id, stage, tasks and confirmations are kept", {
      required: ["title"],
      example: " --title '支持账号切换并保留各自工作台'",
    }),
    "clarification-ask": change("Record a clarification question that was actually asked", {
      required: ["round", "text", "recommendation"],
      optional: ["question"],
      help: {
        round: { value: "n", text: "Positive integer; questions asked together share a round; rounds keep increasing across stages" },
        text: { value: "text", text: "The question as asked" },
        recommendation: { value: "text", text: "Recommended answer and short reason" },
        question: { value: "Qn", text: "Explicit question id (default: next number); ids only increase and are never reused" },
      },
      example: " --round 1 --text '是否保留旧入口？' --recommendation '不保留，减少维护面'",
    }),
    "clarification-answer": change("Record the user's final effective answer; overwrites an earlier answer", {
      required: ["question", "answer"],
      optional: ["source"],
      help: {
        question: { value: "Qn", text: "Question id such as Q1" },
        answer: { value: "text", text: "User's final answer or a faithful summary" },
        source: { value: "text", text: "User's words; omitting it clears an earlier source" },
      },
      example: " --question Q1 --answer '不保留旧入口' --source '不需要考虑历史兼容'",
    }),
    "clarification-withdraw": change("Mark a question as no longer applicable; the original question and answer are kept", {
      required: ["question", "reason"],
      help: { question: { value: "Qn", text: "Question id such as Q1" } },
      example: " --question Q2 --reason '范围调整后不再适用'",
    }),
    confirm: change("Record a stage confirmation the user actually gave", {
      required: ["phase", "summary", "source"],
      optional: ["source-commit", "target-commit", "base-commit"],
      help: {
        phase: { choices: ["requirement", "technical", "plan", "merge"], text: "Confirmed stage" },
        summary: {
          value: "text",
          text: "Stage content in one sentence, ideally 20-40 characters, at most 60 Unicode code points, no line breaks or process wording",
        },
        "source-commit": { value: "sha", text: "merge only: source commit, 7-64 lowercase hex characters" },
        "target-commit": { value: "sha", text: "merge only: target commit, 7-64 lowercase hex characters" },
        "base-commit": { value: "sha", text: "merge only: merge base, 7-64 lowercase hex characters" },
      },
      notes: [
        "requirement moves to technical; a large technical confirmation moves to plan.",
        "medium/xlarge: record technical and plan with two calls, then run change execute.",
        "small Changes record only merge confirmations.",
      ],
      example: " --phase requirement --summary '支持浏览器多身份添加、切换和移除。' --source '确认需求，进入技术方案'",
    }),
    resize: change("Change the size of an active Change and align its stage with its confirmations", {
      required: ["size"],
      help: { size: { choices: ["small", "medium", "large"], text: "New size; xlarge cannot be resized" } },
      example: " --size medium",
    }),
    depends: change("Replace or clear the dependencies of an active ordinary Change", {
      required: ["depends-on"],
      optional: ["availability-note"],
      help: { "depends-on": { value: "id,id|none", text: "Comma-separated published Change ids; none clears the list" } },
      example: " --depends-on prerequisite,other",
    }),
    children: change("Replace the child list of an active xlarge Change", {
      required: ["children"],
      help: { children: { value: "id,id", text: "Non-empty comma-separated list of child Change ids" } },
      example: " --children child-a,child-b",
    }),
    "task-add": change("Add a todo task in requirement, technical, plan or execution (not for xlarge)", {
      required: ["title"],
      optional: ["task", "branch"],
      help: {
        task: { value: "Tn", text: "Task id above the current and committed maximum (default: next number)" },
        branch: { value: "name", text: "Task branch such as task/<id>/T3 when the task runs in parallel" },
      },
      example: " --title '实现目标行为'",
    }),
    "task-update": change("Update the title or branch of a task that has not been committed as done", {
      required: ["task"],
      optional: ["title", "branch"],
      help: { branch: { value: "name|none", text: "Set the task branch, or use none to clear it" } },
      notes: ["Provide at least one of --title and --branch."],
      example: " --task T1 --title '验证目标行为' --branch task/example/T1",
    }),
    "task-remove": change("Remove a task that has not been committed as done", {
      required: ["task"],
      example: " --task T2",
    }),
    "task-start": change("Move a task from todo or blocked to doing after its predecessors are done (stage execution)", {
      required: ["task"],
      example: " --task T1",
    }),
    "task-block": change("Mark a task blocked with the evidence and the condition that unblocks it", {
      required: ["task", "reason"],
      help: { reason: { value: "text", text: "Actual blocker, evidence and the condition that unblocks it" } },
      example: " --task T2 --reason '等待接口契约确认后继续'",
    }),
    "task-complete": change("Move a doing task to done after real verification", {
      required: ["task", "verification"],
      optional: ["commit-title"],
      help: {
        verification: { value: "text", text: "Verification actually run and its results" },
        "commit-title": { value: "text", text: "Title of the delivery commit, e.g. '<id> T1: ...', as a lookup hint" },
      },
      notes: ["Commit and push the implementation together with the done state; on a failed commit use task-retry."],
      example: " --task T1 --verification 'npm test 通过 120 项' --commit-title 'example T1: deliver target behavior'",
    }),
    "task-retry": change("Return a done task that is not yet committed to doing after a failed commit", {
      required: ["task"],
      example: " --task T1",
    }),
    execute: change("Enter execution after checking documents, confirmations, task order, dependencies and the single-branch rule", {
      optional: ["availability-note"],
    }),
    wait: change("Record what the Change is waiting for", {
      required: ["kind", "summary"],
      help: {
        kind: { choices: ["confirmation", "dependency", "pause"], text: "Waiting type; pause keeps a recorded requirement on hold" },
        summary: { value: "text", text: "Condition that ends the wait" },
      },
      example: " --kind confirmation --summary '等待用户验收后同步 Specs 并归档'",
    }),
    resume: change("Clear the waiting condition once it is actually resolved; grants no confirmation"),
    rework: change("Return to the earliest affected stage; keeps done tasks and restores an archive that is not integrated yet", {
      required: ["stage", "reason", "approach"],
      help: {
        stage: { choices: ["requirement", "technical", "plan", "execution"], text: "Earliest affected stage, not later than the current one" },
        approach: { value: "text", text: "How the rework will be handled, e.g. added tasks" },
      },
      notes: ["Clears confirmations from that stage on, the merge confirmation, closure results and waiting."],
      example: " --stage execution --reason '验收发现帮助缺少取值' --approach '追加 T4 补全帮助'",
    }),
    verify: change("Record overall verification after every task is done; moves the Change to close", {
      required: ["result", "summary"],
      optional: ["availability-note"],
      help: {
        result: { choices: ["passed", "failed"], text: "Overall verification result" },
        summary: { value: "text", text: "Overall verification, review method and results" },
      },
      example: " --result passed --summary 'npm test 全部通过，独立评审无遗留问题'",
    }),
    accept: change("Record closure acceptance (stage close)", {
      required: ["mode", "summary", "source"],
      optional: ["availability-note"],
      help: {
        mode: { choices: ["user", "agent"], text: "user: the user accepted; agent: self-acceptance, small Changes only" },
        summary: { value: "text", text: "Acceptance method and basis" },
      },
      example: " --mode user --summary '用户验收通过' --source '验收通过，合入 develop'",
    }),
    specs: change("Record the Specs sync result after acceptance", {
      required: ["result", "summary"],
      help: {
        result: { choices: ["synced", "not_needed"], text: "synced after updating Specs, or not_needed" },
        summary: { value: "text", text: "Synced capability paths, or why Specs need no change" },
      },
      example: " --result synced --summary 'change-workflow 更新统一命令入口'",
    }),
    archive: change("Move the Change to docs/project/archive/<date>-<id> and mark it completed (not on the integration branch)", {
      required: ["date", "summary"],
      optional: ["availability-note"],
      help: {
        date: { value: "YYYY-MM-DD", text: "Archive date in the user's timezone" },
        summary: { value: "text", text: "What was accepted, synced and archived" },
      },
      notes: ["Then commit, push and run integration preflight."],
      example: " --date 2026-01-31 --summary '验收通过，Specs 已同步'",
    }),
    cancel: change("Cancel an active Change; stage, tasks, documents and code are kept and the branch is frozen", {
      required: ["reason"],
      example: " --reason '需求已由其他 Change 覆盖'",
    }),
    "previews-set": change("Replace the prototype previews linked to the Change (requirement to execution)", {
      required: ["file"],
      help: { file: { value: "file", text: "JSON file holding the PreviewEntry array; a relative path resolves against --repo" } },
      example: " --file /tmp/previews.json",
    }),
  },
  workspace: {
    locate: workspace("Report the registered branch, source commit, freshness and local worktree from local refs (read-only, no fetch)"),
    prepare: workspace("Fetch the integration and registered work branches, then reuse or create the Change worktree", {
      optional: ["path"],
      booleans: ["dry-run"],
      help: { path: { value: "dir", text: "Worktree path (default: <project>-worktrees/<id> beside the primary worktree)" } },
    }),
    handoff: workspace("Register the work branch and its worktree after the Requirement is committed (and confirmed unless small)", {
      optional: ["branch", "path", "availability-note"],
      booleans: ["dry-run"],
      help: {
        branch: { value: "name", text: "Work branch (default: the branch pre-filled in change.json, else change/<id>)" },
        path: { value: "dir", text: "Worktree path (default: <project>-worktrees/<id> beside the primary worktree)" },
      },
      notes: ["Pushes the target branch and the registration; safe to rerun after a failure."],
    }),
  },
  integration: {
    preflight: integration("After pushing the archive, check the source, delivery target and open pull request before review or merge"),
    verify: integration("Confirm the merged pull request commit is in the target history and the source is included"),
    cleanup: integration("Delete the merged source branch and idle worktree after the delivery is verified", {
      required: ["verified-commit"],
      optional: ["idle-worktree"],
      help: {
        "verified-commit": {
          value: "full-sha",
          text: "Full 40- or 64-hex delivery commit you verified; it must be in the remote target history and contain every source tip",
        },
        "idle-worktree": { value: "dir", text: "Source worktree you confirmed is no longer in use; omit when there is none" },
      },
      notes: ["Exit code 2 when cleanup is incomplete; the JSON lists each item's status."],
      example: " --verified-commit \"$(git rev-parse origin/develop)\" --idle-worktree ../project-worktrees/example",
    }),
  },
  share: {
    link: define(async (_command, values) => {
      const { getShareLink } = await import("./share.mjs");
      return { output: await getShareLink(values) };
    }, {
      summary: "Build an OpenFolio link to a Change overview, document or prototype from workflow.openfolioUrl (offline)",
      required: ["change"],
      optional: ["document", "preview", "repo"],
      help: {
        document: { value: "path", text: "Document path inside the Change directory, e.g. technical.md" },
        preview: { value: "id", text: "Prototype entry id" },
      },
      notes: ["Choose at most one of --document and --preview; omit both for the overview."],
      example: "--change example --document technical.md",
    }),
  },
  setup: {
    check: define(
      async (command, values) => (await import("../setup/scripts/check-setup.mjs")).runSetupCheck(command, values),
      {
        summary: "Read-only readiness check of workflow, branches, validator resources and hook entry; exit 1 when not ready",
        optional: ["repo"],
        example: "--repo .",
      },
    ),
    "preview-routing": define(
      async (command, values) => (await import("../setup/scripts/preview-routing.mjs")).runPreviewRouting(command, values),
      {
        summary: "Read-only preview of Change routing from a baseline, registered worktrees and given work branches (no network)",
        optional: ["baseline", "repo"],
        multiple: ["work-branch"],
        help: {
          baseline: { value: "branch", text: "Baseline branch (default: integration branch)" },
          "work-branch": { value: "branch", text: "Work branch to include" },
        },
        example: "--work-branch change/example",
      },
    ),
    "pre-commit": define(
      async (command, values) => (await import("../setup/scripts/pre-commit.mjs")).runPreCommit(command, values),
      {
        summary: "Validate staged SpecTrail state files in the index Git commits (honors GIT_INDEX_FILE); exit 1 rejects the commit",
        optional: ["repo"],
        notes: ["Hooks redirect stdout to /dev/null; rejection diagnostics go to stderr."],
        example: "--repo .",
      },
    ),
    "check-pr": define(
      async (command, values) => (await import("../setup/scripts/check-pr.mjs")).runCheckPullRequest(command, values),
      {
        summary: "Require valid completed archives for a pull request (archive CI)",
        optional: ["event", "repo"],
        help: { event: { value: "file", text: "GitHub pull_request event JSON (default: GITHUB_EVENT_PATH)" } },
        example: "--event \"$GITHUB_EVENT_PATH\"",
      },
    ),
  },
  prototype: {
    accept: prototypeSetup(
      "Initialize an empty or missing prototype package (or check an existing one) and enable it",
      "--package packages/prototype --hosting git",
    ),
    decline: prototypeSetup("Disable prototype tracking; existing files are kept"),
    enable: prototypeSetup(
      "Re-validate a pending or enabled package (package.json, AGENTS.md, DESIGN.md, prototype.json or Git previews) and enable it",
    ),
    configure: prototypeSetup(
      "Save the hosting choice and service URLs in workflow.json without touching the package",
      "--hosting openfolio --openfolio-url https://folio.example.com --upload-url \"$OPENFOLIO_UPLOAD_URL\"",
    ),
    validate: define(
      async (command, values) => (await import("../prototype/scripts/validate.mjs")).runPrototypeValidation(command, values),
      {
        summary: "Check current prototype entries statically, and in a browser with --browser",
        optional: ["package", "playwright", "repo"],
        booleans: ["browser"],
        help: {
          package: { value: "path", text: "Validate this package directly (frontend repository; . for its root) instead of reading workflow.json" },
          playwright: { value: "path", text: "Playwright module to import (default: @playwright/test resolved from the repository)" },
          browser: { text: "Also load each entry once in headless Chromium (default viewport); fails on page or console errors and HTTP 400+" },
        },
        example: "--browser",
      },
    ),
    prepare: publication("Write a publish request for a built prototype from a clean commit", {
      required: ["directory", "entries", "repository", "out"],
      optional: ["package"],
      help: {
        directory: { value: "dir", text: "Built artifact directory, e.g. packages/prototype/dist" },
        entries: { value: "file", text: 'JSON file such as [{"id":"orders","entryPath":"index.html","hash":"#/orders"}]' },
        repository: { value: "url", text: "Repository URL recorded in the request" },
        out: { value: "file", text: "Request file to create outside the repository; must not exist" },
        package: { value: "path", text: "Package path inside a frontend repository (submodule publishing; . for its root)" },
      },
      example: "--directory packages/prototype/dist --entries /tmp/entries.json --repository https://example.org/team/project.git --out /tmp/request.json",
    }),
    upload: publication("Upload a prepared request to OpenFolio, then register current entries and optional Change previews", {
      required: ["request", "result"],
      optional: ["change", "upload-url", "openfolio-url"],
      help: {
        result: { value: "file", text: "Result file to write outside the repository" },
        change: { value: "id", text: "Also link the published entries to this Change" },
        "upload-url": { value: "url", text: "Frontend publishing only: upload URL (default: OPENFOLIO_UPLOAD_URL)" },
        "openfolio-url": { value: "url", text: "Frontend publishing only: OpenFolio root (default: OPENFOLIO_URL)" },
      },
      notes: ["Requires enabled openfolio hosting in workflow.json, except for frontend (submodule) requests."],
      example: "--request /tmp/request.json --result /tmp/result.json --change example",
    }),
    register: publication("Register a custom host result or a Git preview as the current entry and optional Change preview", {
      optional: ["git-entry", "request", "result", "change", "package", "repository"],
      help: {
        "git-entry": { value: "id", text: "Entry id whose <package>/preview/<id>/index.html is the Git fallback" },
        change: { value: "id", text: "Also link the registered entries to this Change" },
        package: { value: "path", text: "Package path inside a frontend repository (submodule publishing)" },
        repository: { value: "url", text: "Repository URL for a Git entry in a frontend repository" },
      },
      notes: ["Provide --git-entry, or both --request and --result."],
      example: "--request /tmp/request.json --result /tmp/result.json --change example",
    }),
    associate: publication("In the parent repository, link committed frontend (submodule) prototype entries to a Change", {
      required: ["change"],
      optional: ["entry"],
      help: { entry: { value: "id", text: "Associate only this entry (default: all current entries)" } },
      example: "--change example --entry orders",
    }),
    recover: publication("Roll back an interrupted multi-file registration to its previous files; stops on newer edits or commits", {
      notes: ["Rerun register or upload afterwards; recover does not complete the registration."],
    }),
  },
  maintenance: {
    "version-next": define(async (_command, values) => {
      const { nextVersion, readVersion } = await import("./version.mjs");
      return { output: { version: nextVersion(readVersion(values.file)) } };
    }, {
      summary: "Compute the next patch version from a version.json",
      required: ["file"],
      help: { file: { value: "file", text: "version.json to read, e.g. .agents/skills/spec-trail/version.json" } },
      example: "--file .agents/skills/spec-trail/version.json",
    }),
    "archive-tags-list": archiveTags("Write the inventory of legacy archive tags to a manifest", false),
    "archive-tags-delete": archiveTags("Delete the legacy archive tags listed in a manifest", true),
  },
};
