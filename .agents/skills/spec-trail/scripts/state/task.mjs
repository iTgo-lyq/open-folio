// task group: task list and task status. Tasks committed as done are frozen.
import { relative } from "node:path";
import { changeLocation } from "../core/routing.mjs";
import { validateChange } from "../core/state-schema.mjs";
import { assert, json, stateCommand, stateNotes } from "./context.mjs";
import { requirePredecessors, requireStage, unblocked } from "./guards.mjs";

const taskIdPattern = /^T[1-9][0-9]*$/;

// New numbers must exceed every task ever committed for this Change, archives included.
function largestTaskNumber(git, id, current) {
  assert(
    git(["rev-parse", "--is-shallow-repository"]) === "false",
    "Task numbering requires complete Change history; fetch with --unshallow and retry",
  );
  const blobs = new Set();
  const history = git([
    "log", "--full-history", "-m", "--format=", "--raw", "--no-abbrev",
    "--no-renames", "HEAD", "--",
    `docs/project/changes/${id}/change.json`,
    `:(glob)docs/project/archive/????-??-??-${id}/change.json`,
  ]);
  for (const match of history.matchAll(/^:\d+ \d+ ([a-f0-9]+) ([a-f0-9]+) /gm)) {
    for (const blob of match.slice(1)) if (!/^0+$/.test(blob)) blobs.add(blob);
  }
  let largest = 0n;
  const consider = (tasks) => {
    for (const key of Object.keys(tasks ?? {})) {
      if (!taskIdPattern.test(key)) continue;
      const number = BigInt(key.slice(1));
      if (number > largest) largest = number;
    }
  };
  consider(current);
  for (const blob of blobs) {
    const previous = JSON.parse(git(["cat-file", "blob", blob]));
    if (previous?.id === id) consider(previous.tasks);
  }
  return largest;
}

function requireUncommitted({ git, root, file, id }, taskId) {
  const path = relative(root, file);
  const committedPath =
    git(["ls-tree", "--name-only", "HEAD", "--", path]) ||
    git(["ls-tree", "-r", "--name-only", "HEAD", "--", "docs/project/archive/"])
      .split("\n")
      .find((entry) => changeLocation(entry)?.id === id);
  const committed = committedPath ? JSON.parse(git(["show", `HEAD:${committedPath}`])) : undefined;
  assert(committed?.tasks?.[taskId]?.status !== "done", "Committed completed tasks are immutable");
}

// Editing the list: allowed before close, never for xlarge or committed completions.
function editableTask(ctx) {
  requireStage(ctx, "requirement", "technical", "plan", "execution");
  assert(ctx.state.size !== "xlarge", "xlarge uses children, not tasks");
  if (ctx.opts.task !== undefined) assert(taskIdPattern.test(ctx.opts.task), "Invalid task id");
}

function existingTask(ctx) {
  const taskId = ctx.need("task");
  assert(Object.hasOwn(ctx.state.tasks, taskId), "Task not found");
  return taskId;
}

// Status changes happen during execution and never reopen a done task.
function runningTask(ctx) {
  requireStage(ctx, "execution");
  unblocked(ctx);
  const taskId = existingTask(ctx);
  const task = ctx.state.tasks[taskId];
  assert(task.status !== "done", "Completed tasks are immutable; append a repair task");
  return [taskId, task];
}

const reopen = (task) => {
  task.status = "doing";
  delete task.verification;
  delete task.commitTitle;
};

export const notes = [...stateNotes, "retry also updates the staged change.json."];

export const commands = {
  add: stateCommand("Add a todo task in requirement, technical, plan or execution (not for xlarge)", {
    required: ["title"],
    optional: ["task", "branch"],
    help: {
      task: { value: "Tn", text: "Task id above the current and committed maximum (default: next number)" },
      branch: { value: "name", text: "Task branch such as task/<id>/T3 when the task runs in parallel" },
    },
    example: " --title '实现目标行为'",
    run(ctx) {
      editableTask(ctx);
      const { state, opts, git, id, need } = ctx;
      const largest = largestTaskNumber(git, id, state.tasks);
      const taskId = opts.task ?? `T${largest + 1n}`;
      assert(BigInt(taskId.slice(1)) > largest, `Task number must be greater than ${largest} (current and committed tasks)`);
      state.tasks[taskId] = { title: need("title"), status: "todo", ...(opts.branch ? { branch: opts.branch } : {}) };
    },
  }),
  update: stateCommand("Update the title or branch of a task that has not been committed as done", {
    required: ["task"],
    optional: ["title", "branch"],
    help: { branch: { value: "name|none", text: "Set the task branch, or use none to clear it" } },
    notes: ["Provide at least one of --title and --branch."],
    example: " --task T1 --title '验证目标行为' --branch task/example/T1",
    run(ctx) {
      editableTask(ctx);
      const taskId = existingTask(ctx);
      requireUncommitted(ctx, taskId);
      const { opts, need } = ctx;
      assert(opts.title !== undefined || opts.branch !== undefined, "task update requires --title or --branch");
      const task = ctx.state.tasks[taskId];
      if (opts.title !== undefined) task.title = need("title");
      if (opts.branch === "none") delete task.branch;
      else if (opts.branch !== undefined) task.branch = need("branch");
    },
  }),
  remove: stateCommand("Remove a task that has not been committed as done", {
    required: ["task"],
    example: " --task T2",
    run(ctx) {
      editableTask(ctx);
      const taskId = existingTask(ctx);
      requireUncommitted(ctx, taskId);
      delete ctx.state.tasks[taskId];
    },
  }),
  start: stateCommand("Move a task from todo or blocked to doing after its predecessors are done (stage execution)", {
    required: ["task"],
    example: " --task T1",
    run(ctx) {
      const [taskId, task] = runningTask(ctx);
      assert(["todo", "blocked"].includes(task.status), "Task is already running");
      requirePredecessors(ctx, taskId);
      task.status = "doing";
      delete task.reason;
    },
  }),
  block: stateCommand("Mark a task blocked with the evidence and the condition that unblocks it", {
    required: ["task", "reason"],
    help: { reason: { value: "text", text: "Actual blocker, evidence and the condition that unblocks it" } },
    example: " --task T2 --reason '等待接口契约确认后继续'",
    run(ctx) {
      const [, task] = runningTask(ctx);
      task.status = "blocked";
      task.reason = ctx.need("reason");
    },
  }),
  complete: stateCommand("Move a doing task to done after real verification", {
    required: ["task", "verification"],
    optional: ["commit-title"],
    help: {
      verification: { value: "text", text: "Verification actually run and its results" },
      "commit-title": { value: "text", text: "Title of the delivery commit, e.g. '<id> T1: ...', as a lookup hint" },
    },
    notes: ["Commit and push the implementation together with the done state; on a failed commit use task retry."],
    example: " --task T1 --verification 'npm test 通过 120 项' --commit-title 'example T1: deliver target behavior'",
    run(ctx) {
      const [taskId, task] = runningTask(ctx);
      assert(task.status === "doing", "Start the task before completing it");
      requirePredecessors(ctx, taskId);
      task.status = "done";
      task.verification = ctx.need("verification");
      if (ctx.opts["commit-title"]) task.commitTitle = ctx.opts["commit-title"];
      delete task.reason;
    },
  }),
  retry: stateCommand("Return a done task that is not yet committed to doing after a failed commit", {
    required: ["task"],
    example: " --task T1",
    run(ctx) {
      requireStage(ctx, "execution");
      const { state, git, root, file, need } = ctx;
      const taskId = need("task");
      assert(Object.hasOwn(state.tasks, taskId) && state.tasks[taskId].status === "done", "Only an uncommitted done task can be retried");
      requireUncommitted(ctx, taskId);
      reopen(state.tasks[taskId]);
      const path = relative(root, file);
      const indexed = git(["ls-files", "--stage", "--", path]);
      if (!indexed) return;
      const rows = indexed.split("\n");
      const [mode, blob, stage] = rows[0].split(/\s+/);
      assert(rows.length === 1 && stage === "0" && ["100644", "100755"].includes(mode), "Resolve the index conflict before retrying a task");
      const staged = JSON.parse(git(["show", `:${path}`]));
      assert(!validateChange(staged).length, "Invalid staged Change; inspect the index first");
      // Preserve partial staging: change this task only, never stage the whole working file.
      if (Object.hasOwn(staged.tasks, taskId) && staged.tasks[taskId].status === "done") {
        reopen(staged.tasks[taskId]);
        ctx.indexRecovery = { indexed, mode, blob, content: json(staged) };
      }
    },
  }),
};
