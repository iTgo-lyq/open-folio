// close group: overall verification, acceptance, Specs sync and archive, in order.
import { existsSync } from "node:fs";
import { relative } from "node:path";
import { pinPreviews } from "../../prototype/scripts/hooks.mjs";
import { assert, stateCommand, stateNotes } from "./context.mjs";
import { requireConfirmations, requireDelivered, requireDocs, requireStage, requireTaskOrder, unblocked } from "./guards.mjs";

const steps = ["verification", "acceptance", "specs", "archive"];

// Every task is done; an xlarge parent instead needs each child closed or cancelled.
async function completeTasks(ctx) {
  const { state } = ctx;
  if (state.size === "xlarge") {
    assert(state.children?.length, "xlarge requires child Changes");
    for (const child of state.children) await requireDelivered(ctx, child, true);
  } else
    assert(
      Object.keys(state.tasks).length && Object.values(state.tasks).every((t) => t.status === "done"),
      "All tasks must be done",
    );
}

// Each step follows a passed verification and is not older than the previous step.
function recordStep({ state, now, need }, key, result, extra = {}) {
  assert(!state.closure[key], `${key} already recorded; use stage rework for a new cycle`);
  const previous = state.closure[steps[steps.indexOf(key) - 1]];
  if (key !== "verification") {
    assert(previous && state.closure.verification?.result === "passed", "Previous successful closure step is required");
    assert(
      Date.parse(now) >= Date.parse(previous.at),
      "Clock precedes the previous closure step; correct the clock or the source record",
    );
  }
  state.closure[key] = { result, at: now, summary: need("summary"), ...extra };
}

export const notes = [...stateNotes, "archive moves the Change directory to docs/project/archive/."];

export const commands = {
  verify: stateCommand("Record overall verification after every task is done; moves the Change to close", {
    required: ["result", "summary"],
    optional: ["availability-note"],
    help: {
      result: { choices: ["passed", "failed"], text: "Overall verification result" },
      summary: { value: "text", text: "Overall verification, review method and results" },
    },
    example: " --result passed --summary 'npm test 全部通过，独立评审无遗留问题'",
    async run(ctx) {
      requireStage(ctx, "execution");
      unblocked(ctx);
      requireDocs(ctx);
      requireConfirmations(ctx);
      await completeTasks(ctx);
      requireTaskOrder(ctx);
      assert(["passed", "failed"].includes(ctx.need("result")), "Invalid verification result");
      recordStep(ctx, "verification", ctx.opts.result);
      ctx.state.stage = "close";
    },
  }),
  accept: stateCommand("Record closure acceptance (stage close)", {
    required: ["mode", "summary", "source"],
    optional: ["availability-note"],
    help: {
      mode: { choices: ["user", "agent"], text: "user: the user accepted; agent: self-acceptance, small Changes only" },
      summary: { value: "text", text: "Acceptance method and basis" },
    },
    example: " --mode user --summary '用户验收通过' --source '验收通过，合入 develop'",
    async run(ctx) {
      requireStage(ctx, "close");
      unblocked(ctx);
      await completeTasks(ctx);
      requireTaskOrder(ctx);
      assert(["user", "agent"].includes(ctx.need("mode")), "--mode must be user or agent");
      assert(ctx.opts.mode !== "agent" || ctx.state.size === "small", "Only small Changes may self-accept");
      recordStep(ctx, "acceptance", "accepted", { source: ctx.need("source") });
    },
  }),
  specs: stateCommand("Record the Specs sync result after acceptance", {
    required: ["result", "summary"],
    help: {
      result: { choices: ["synced", "not_needed"], text: "synced after updating Specs, or not_needed" },
      summary: { value: "text", text: "Synced capability paths, or why Specs need no change" },
    },
    example: " --result synced --summary 'change-workflow 更新统一命令入口'",
    run(ctx) {
      requireStage(ctx, "close");
      unblocked(ctx);
      requireTaskOrder(ctx);
      assert(["synced", "not_needed"].includes(ctx.need("result")), "Invalid Specs result");
      recordStep(ctx, "specs", ctx.opts.result);
    },
  }),
  archive: stateCommand("Move the Change to docs/project/archive/<date>-<id> and mark it completed (not on the integration branch)", {
    required: ["date", "summary"],
    optional: ["availability-note"],
    help: {
      date: { value: "YYYY-MM-DD", text: "Archive date in the user's timezone" },
      summary: { value: "text", text: "What was accepted, synced and archived" },
    },
    notes: ["Then commit, push and run integration preflight."],
    example: " --date 2026-01-31 --summary '验收通过，Specs 已同步'",
    async run(ctx) {
      const { branch, config, need, safe, root, id } = ctx;
      assert(
        branch !== config.integrationBranch,
        "Handoff to an independent closing branch before archiving; this also applies to xlarge parents",
      );
      requireStage(ctx, "close");
      unblocked(ctx);
      await completeTasks(ctx);
      requireTaskOrder(ctx);
      const date = need("date");
      assert(
        /^\d{4}-\d{2}-\d{2}$/.test(date) &&
          Number.isFinite(Date.parse(`${date}T00:00:00.000Z`)) &&
          new Date(`${date}T00:00:00.000Z`).toISOString().startsWith(date),
        "Use a valid YYYY-MM-DD date in the user timezone",
      );
      const archiveDir = safe(`docs/project/archive/${date}-${id}`);
      assert(!existsSync(archiveDir), "Archive destination already exists");
      recordStep(ctx, "archive", "done", { path: relative(root, archiveDir) });
      ctx.archiveDir = archiveDir;
      ctx.archiveCopies.push(...pinPreviews(ctx, archiveDir));
      ctx.state.status = "completed";
    },
  }),
};
