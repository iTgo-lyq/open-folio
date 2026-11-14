// stage group: confirmations, entering execution, waiting and rework.
import { existsSync } from "node:fs";
import { relative } from "node:path";
import { restorePreviews } from "../prototype/hooks.mjs";
import { assert, stages, stateCommand, stateNotes } from "./context.mjs";
import { requireConfirmations, requireDelivered, requireDocs, requireStage, requireTaskOrder, unblocked } from "./guards.mjs";

// One ordinary Change executes or closes per branch.
function uniqueActive({ branch, config, state, all, id }) {
  assert(
    (branch === config.integrationBranch && state.size === "xlarge") ||
      !all.some(
        (r) =>
          !r.archived &&
          r.state.id !== id &&
          r.state.branch === branch &&
          r.state.status === "active" &&
          ["execution", "close"].includes(r.state.stage),
      ),
    "Another Change is already executing/closing on this branch",
  );
}

export const notes = [...stateNotes, "rework moves an archived Change that is not integrated back to docs/project/changes/."];

export const commands = {
  confirm: stateCommand("Record a stage confirmation the user actually gave", {
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
      "medium/xlarge: record technical and plan with two calls, then run stage execute.",
      "small Changes record only merge confirmations.",
    ],
    example: " --phase requirement --summary '支持浏览器多身份添加、切换和移除。' --source '确认需求，进入技术方案'",
    run(ctx) {
      const { state, opts, need, now, safe, root, liveDir } = ctx;
      const phase = need("phase");
      assert(["requirement", "technical", "plan", "merge"].includes(phase), "Invalid confirmation phase");
      assert(!state.confirmations[phase], "Confirmation already recorded; use stage rework first");
      const summary = need("summary");
      assert(
        [...summary].length <= 60 && !/[\r\n\u0085\u2028\u2029]/u.test(summary),
        "Confirmation summary must be a single line of at most 60 Unicode characters",
      );
      if (phase !== "merge") {
        assert(state.size !== "small", "Small Changes do not record phase confirmations");
        requireStage(ctx, phase === "plan" && state.size !== "large" ? "technical" : phase);
        if (phase === "plan") assert(state.confirmations.technical, "Technical confirmation is required");
        assert(existsSync(safe(`${relative(root, liveDir)}/${phase}.md`)), `Missing ${phase}.md`);
      }
      state.confirmations[phase] = { at: now, summary, source: need("source") };
      if (phase === "merge")
        for (const part of ["source", "target", "base"])
          if (opts[`${part}-commit`]) state.confirmations.merge[`${part}Commit`] = opts[`${part}-commit`];
      if (phase === "requirement") state.stage = "technical";
      if (phase === "technical" && state.size === "large") state.stage = "plan";
    },
  }),
  execute: stateCommand("Enter execution after checking documents, confirmations, task order, dependencies and the single-branch rule", {
    optional: ["availability-note"],
    async run(ctx) {
      const { state } = ctx;
      requireStage(ctx, "requirement", "technical", "plan");
      unblocked(ctx);
      requireDocs(ctx);
      requireConfirmations(ctx);
      uniqueActive(ctx);
      requireTaskOrder(ctx);
      if (state.size !== "xlarge") assert(Object.keys(state.tasks).length, "Define tasks before execution");
      for (const target of state.dependsOn || []) await requireDelivered(ctx, target);
      state.stage = "execution";
    },
  }),
  wait: stateCommand("Record what the Change is waiting for", {
    required: ["kind", "summary"],
    help: {
      kind: { choices: ["confirmation", "dependency", "pause"], text: "Waiting type; pause keeps a recorded requirement on hold" },
      summary: { value: "text", text: "Condition that ends the wait" },
    },
    example: " --kind confirmation --summary '等待用户验收后同步 Specs 并归档'",
    run({ state, need }) {
      state.waitingFor = { kind: need("kind"), summary: need("summary") };
    },
  }),
  resume: stateCommand("Clear the waiting condition once it is actually resolved; grants no confirmation", {
    run({ state }) {
      delete state.waitingFor;
    },
  }),
  rework: stateCommand("Return to the earliest affected stage; keeps done tasks and restores an archive that is not integrated yet", {
    required: ["stage", "reason", "approach"],
    help: {
      stage: { choices: ["requirement", "technical", "plan", "execution"], text: "Earliest affected stage, not later than the current one" },
      approach: { value: "text", text: "How the rework will be handled, e.g. added tasks" },
    },
    notes: ["Clears confirmations from that stage on, the merge confirmation, closure results and waiting."],
    example: " --stage execution --reason '验收发现帮助缺少取值' --approach '追加 T4 补全帮助'",
    restore: true,
    run(ctx) {
      const { state, need, now, restoring } = ctx;
      const stage = need("stage");
      assert(
        ["requirement", "technical", "plan", "execution"].includes(stage) && stages.indexOf(stage) <= stages.indexOf(state.stage),
        "Rework must return to an earlier/current non-close stage",
      );
      if (stage === "execution") {
        requireConfirmations(ctx);
        uniqueActive(ctx);
      }
      for (const phase of ["requirement", "technical", "plan"])
        if (stages.indexOf(phase) >= stages.indexOf(stage)) delete state.confirmations[phase];
      delete state.confirmations.merge;
      state.rework = { at: now, reason: need("reason"), approach: need("approach") };
      state.stage = stage;
      if (restoring) {
        state.status = "active";
        restorePreviews(ctx);
      }
      state.closure = {};
      delete state.waitingFor;
    },
  }),
};
