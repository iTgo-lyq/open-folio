// Preconditions shared by several state commands.
import { existsSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { closedRecord } from "../core/routing.mjs";
import { changeIntegration } from "../core/github-prs.mjs";
import { routedRecord } from "../core/repository.mjs";
import { validateChange } from "../core/state-schema.mjs";
import { parseTaskOrder, unfinishedPredecessors } from "../core/task-order.mjs";
import { assert } from "./context.mjs";

const documentPath = (ctx, name) => ctx.safe(`${relative(ctx.root, ctx.recordDir)}/${name}.md`);

export function requireStage(ctx, ...allowed) {
  assert(allowed.includes(ctx.state.stage), `${ctx.name} requires stage ${allowed.join("/")} (currently ${ctx.state.stage})`);
}

export function unblocked(ctx) {
  assert(!ctx.state.waitingFor, "Clear the actual waiting condition, then use stage resume");
}

export function requireDocs(ctx) {
  for (const name of ctx.state.size === "small" ? ["requirement"] : ["requirement", "technical", "plan"])
    assert(existsSync(documentPath(ctx, name)), `Missing ${name}.md`);
}

export function requireConfirmations({ state }) {
  if (state.size !== "small")
    for (const phase of ["requirement", "technical", "plan"])
      assert(state.confirmations[phase], `Missing ${phase} confirmation`);
}

export function requireTaskOrder(ctx) {
  const plan = documentPath(ctx, "plan");
  const order = parseTaskOrder(ctx.state, existsSync(plan) ? readFileSync(plan, "utf8") : undefined);
  assert(
    ["valid", "not-applicable"].includes(order.status),
    order.status === "missing"
      ? "Missing plan.md"
      : order.diagnostics.map((d) => `${d.message}${d.line ? ` (line ${d.line})` : ""}`).join("; "),
  );
  return order;
}

export function requirePredecessors(ctx, taskId) {
  const pending = unfinishedPredecessors(ctx.state.tasks, requireTaskOrder(ctx).edges, taskId);
  assert(!pending.length, `Complete predecessor tasks before ${taskId}: ${pending.join(", ")}`);
}

/**
 * A dependency, or a child of an xlarge parent, must be a pushed and closed
 * archive whose delivery this branch contains. When ancestry cannot prove it
 * (e.g. after a squash), --availability-note records the evidence instead.
 */
export async function requireDelivered(ctx, target, allowCancelled = false) {
  const { repo, catalog, git, opts, state } = ctx;
  const record = routedRecord(repo, catalog, target, { refresh: !opts["dry-run"] });
  const source = record.state;
  assert(!validateChange(source).length, `Dependency/child ${target} has invalid state`);
  assert(
    (allowCancelled && source.status === "cancelled") || (record.archived && closedRecord(source, record.directory)),
    `Dependency/child ${target} is not closed`,
  );
  const remote = record.sourceRef;
  assert(
    isDeepStrictEqual(JSON.parse(git(["show", `${remote}:${record.path}`])), source),
    `Dependency/child ${target} has unpushed or divergent state; fetch origin and inspect`,
  );
  if (allowCancelled) assert(source.parent === state.id, `Child ${target} does not belong to this parent`);
  if (source.status === "cancelled") return;
  let deliveryCommit = remote;
  if (source.parent && record.branch !== catalog.branch) {
    const evidence = await changeIntegration(repo, catalog, target, source.branch);
    assert(evidence.status === "found", `Child ${target} requires verified parent PR integration`);
    deliveryCommit = evidence.commit;
  }
  try {
    git(["merge-base", "--is-ancestor", deliveryCommit, "HEAD"]);
  } catch {
    assert(
      opts["availability-note"]?.trim(),
      `Cannot establish ${target} by ancestry (for example after squash). Verify its delivery in this branch, document the evidence, then pass --availability-note.`,
    );
    ctx.availability.push({
      change: target,
      sourceCommit: git(["rev-parse", deliveryCommit]),
      targetCommit: git(["rev-parse", "HEAD"]),
      evidence: opts["availability-note"],
    });
  }
}
