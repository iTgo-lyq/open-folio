// A follow-up continues an archived delivery. Its chain of predecessors must
// be valid published history, but it is not an execution prerequisite.
import { dirname } from "node:path";
import { closedRecord } from "../core/routing.mjs";
import { routedRecord } from "../core/repository.mjs";
import { parseTaskOrder } from "../core/task-order.mjs";
import { assert } from "./context.mjs";

const steps = ["verification", "acceptance", "specs", "archive"];

/** Link `ctx.state` to `target` and keep or set the group title. */
export function setFollowUp(ctx, target) {
  const { state, opts, need } = ctx;
  const titles = followUpTitles(ctx, target);
  if (state.followUpOf !== target) delete state.followUpTitle;
  state.followUpOf = target;
  if (opts["group-title"] !== undefined) {
    const title = need("group-title").trim();
    assert(
      !titles.size || (titles.size === 1 && titles.has(title)),
      "Keep the existing follow-up group title; inspect conflicting history before renaming",
    );
    state.followUpTitle = title;
  }
}

// Walk the predecessor chain, validating each record and collecting group titles.
function followUpTitles({ id, repo, catalog, git, opts }, target) {
  const records = new Map(),
    checked = new Set(),
    checking = new Set();
  const readPrior = (priorId) => {
    if (records.has(priorId)) return records.get(priorId);
    const record = routedRecord(repo, catalog, priorId, { refresh: !opts["dry-run"] });
    const prior = record.state;
    const valid = (condition) => assert(condition, `Follow-up history ${priorId} is not a valid published record`);
    valid(!record.errors.length);
    valid(
      prior.size === "xlarge"
        ? !Object.keys(prior.tasks).length && !prior.dependsOn?.length && !prior.parent
        : !prior.children?.length,
    );
    valid(!(prior.size === "small" && ["technical", "plan"].includes(prior.stage)));
    valid(!(["medium", "xlarge"].includes(prior.size) && prior.stage === "plan"));
    if (prior.status !== "cancelled") {
      const phases =
        prior.size === "small" || prior.stage === "requirement"
          ? []
          : prior.stage === "technical"
            ? ["requirement"]
            : prior.stage === "plan"
              ? ["requirement", "technical"]
              : ["requirement", "technical", "plan"];
      valid(phases.every((phase) => prior.confirmations[phase]));
      if (prior.stage === "close") valid(Object.values(prior.tasks).every((task) => task.status === "done"));
    }
    for (const [i, key] of steps.entries()) {
      const step = prior.closure[key];
      if (!step) continue;
      const previous = prior.closure[steps[i - 1]];
      valid(prior.stage === "close");
      if (i)
        valid(previous && prior.closure.verification?.result === "passed" && Date.parse(step.at) >= Date.parse(previous.at));
    }
    if (prior.status === "completed") {
      valid(record.archived && closedRecord(prior, dirname(record.path)));
      valid(!git(["ls-tree", "-r", "--name-only", record.commit, "--", `docs/project/changes/${priorId}/`]).trim());
      valid(prior.size === "xlarge" ? prior.children?.length : Object.keys(prior.tasks).length);
      let plan;
      try {
        plan = git(["show", `${record.commit}:${dirname(record.path)}/plan.md`]);
      } catch {
        /* Missing Plan is checked below. */
      }
      valid(["valid", "not-applicable"].includes(parseTaskOrder(prior, plan).status));
    } else valid(!record.archived);
    records.set(priorId, record);
    return record;
  };
  // Validate the predecessor's existing history, without making it an
  // execution prerequisite of the new Change or requiring Git ancestry.
  const validateHistory = (priorId) => {
    assert(!checking.has(priorId), "Follow-up history has a dependency/child cycle");
    if (checked.has(priorId)) return;
    checking.add(priorId);
    const prior = readPrior(priorId).state;
    if (prior.parent) {
      const parent = readPrior(prior.parent).state;
      assert(
        parent.size === "xlarge" && parent.children?.includes(priorId),
        `Follow-up history ${priorId} has an invalid parent`,
      );
    }
    for (const dependencyId of prior.dependsOn ?? []) {
      assert(dependencyId !== prior.parent, `Follow-up history ${priorId} depends on its parent`);
      const dependency = readPrior(dependencyId).state;
      validateHistory(dependencyId);
      assert(
        prior.status !== "completed" || dependency.status === "completed",
        `Follow-up history ${priorId} has an unfinished dependency`,
      );
    }
    for (const childId of prior.children ?? []) {
      const child = readPrior(childId).state;
      assert(child.parent === priorId && child.size !== "xlarge", `Follow-up history ${priorId} has an invalid child`);
      validateHistory(childId);
      assert(
        prior.status !== "completed" || ["completed", "cancelled"].includes(child.status),
        `Follow-up history ${priorId} has an unfinished child`,
      );
    }
    checking.delete(priorId);
    checked.add(priorId);
  };
  const visited = new Set([id]);
  const titles = new Set();
  while (target) {
    assert(!visited.has(target), "Follow-up cannot reference itself or form a cycle");
    visited.add(target);
    const record = readPrior(target);
    const prior = record.state;
    assert(record.archived && prior.status === "completed", `Follow-up target ${target} must be a valid published archive`);
    validateHistory(target);
    if (prior.followUpTitle) titles.add(prior.followUpTitle);
    target = prior.followUpOf;
  }
  return titles;
}
