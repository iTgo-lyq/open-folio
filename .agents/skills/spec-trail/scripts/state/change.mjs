// change group: create a Change and maintain its metadata and relations.
import { relative } from "node:path";
import { define } from "../define.mjs";
import { routedRecord } from "../core/repository.mjs";
import { validateChange, validateCollaborators, validateTypes, validateUrgency } from "../core/state-schema.mjs";
import { assert, changeIdPattern, list, locate, stages, stateCommand, stateNotes } from "./context.mjs";
import { requireDelivered } from "./guards.mjs";
import { setFollowUp } from "./follow-up.mjs";

const ordinarySizes = ["small", "medium", "large"];

function setLabels({ state, opts }) {
  if (opts.types !== undefined) {
    const input = JSON.parse(opts.types);
    assert(Array.isArray(input) && input.every((item) => typeof item === "string"), "--types must be a JSON array of strings");
    // Check line breaks before trimming, so an invalid label is not repaired.
    assert(input.every((item) => !/[\r\n\u2028\u2029]/.test(item)), "--types labels must be single-line");
    const types = [...new Set(input.map((item) => item.trim()))];
    assert(!validateTypes(types).length, validateTypes(types).join("; "));
    if (types.length) state.types = types;
    else delete state.types;
  }
  if (opts.urgency !== undefined) {
    assert(!validateUrgency(opts.urgency).length, validateUrgency(opts.urgency).join("; "));
    if (opts.urgency === "normal") delete state.urgency;
    else state.urgency = opts.urgency;
  }
}

function setCollaborators({ state }, input) {
  const members = JSON.parse(input);
  const errors = validateCollaborators(members);
  assert(!errors.length, errors.join("; "));
  if (members.length) state.collaborators = members;
  else delete state.collaborators;
}

// Upgrades return to the earliest missing confirmation; downgrades keep confirmations.
function stageAfterResize(state, size) {
  const { stage, confirmations } = state;
  if (ordinarySizes.indexOf(size) < ordinarySizes.indexOf(state.size)) {
    if (size === "small" && ["technical", "plan"].includes(stage)) return "requirement";
    return stage === "plan" ? "technical" : stage;
  }
  if (!confirmations.requirement) return "requirement";
  if (!confirmations.technical) return "technical";
  if (size === "large" && (!confirmations.plan || stages.indexOf(stage) < stages.indexOf("plan"))) return "plan";
  if (!confirmations.plan || stage === "requirement") return "technical";
  return stage;
}

// Prefer the local working copy on the owning branch; otherwise read the pushed record.
function show(opts) {
  const { root, repo, catalog, route, matches, id } = locate(opts, { refresh: false });
  if (route?.errors.length) throw Error(route.errors.join("; "));
  const local =
    (!route || (route.kind !== "archive" && route.branch === repo.branch)) &&
    matches.filter(
      (r) =>
        r.state.branch === repo.branch ||
        (route?.kind === "planning" && route.branch === repo.branch && r.state.branch === route.ownerBranch),
    );
  if (local && local.length === 1 && (route || repo.branch === repo.config.integrationBranch))
    return {
      path: relative(root, local[0].file),
      state: local[0].state,
      errors: validateChange(local[0].state),
      source: "working-tree",
      branch: repo.branch,
      entryCommit: catalog.commit,
      freshness: catalog.freshness,
    };
  return { ...routedRecord(repo, catalog, id), source: "pushed-record" };
}

export const notes = stateNotes;

export const commands = {
  create: stateCommand("Create a Change in the requirement stage on the integration branch; writes no documents, branches or commits", {
    required: ["title", "size"],
    optional: ["depends-on", "parent", "children", "follow-up-of", "group-title", "types", "urgency", "collaborators"],
    help: {
      size: { choices: ["small", "medium", "large", "xlarge"], text: "Change size by core contract impact and implementation scope" },
      "depends-on": {
        value: "id,id",
        text: "Prerequisite Change ids, comma-separated; stage execute later requires each to be a pushed, completed archive whose delivery is available",
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
    initial: ({ id, branch, need, opts }) => ({
      schemaVersion: 1,
      id,
      title: need("title"),
      size: need("size"),
      status: "active",
      stage: "requirement",
      branch,
      confirmations: {},
      tasks: {},
      closure: {},
      ...(opts["depends-on"] ? { dependsOn: list(opts["depends-on"]) } : {}),
      ...(opts.parent ? { parent: opts.parent } : {}),
      ...(opts.children ? { children: list(opts.children) } : {}),
      ...(opts["follow-up-of"] ? { followUpOf: opts["follow-up-of"] } : {}),
    }),
    run(ctx) {
      const { state, opts } = ctx;
      assert(opts["group-title"] === undefined || state.followUpOf, "--group-title requires --follow-up-of");
      if (state.followUpOf) setFollowUp(ctx, state.followUpOf);
      setLabels(ctx);
      if (opts.collaborators !== undefined) setCollaborators(ctx, opts.collaborators);
    },
  }),
  show: define((opts) => ({ output: show(opts) }), {
    summary: "Read the metadata of an active or archived Change from its registered source (read-only)",
    required: ["change"],
    optional: ["repo"],
    example: "--change example",
  }),
  retitle: stateCommand("Change the display title of an active Change on its owning branch; id, stage, tasks and confirmations are kept", {
    required: ["title"],
    example: " --title '支持账号切换并保留各自工作台'",
    run: ({ state, need }) => {
      state.title = need("title");
    },
  }),
  labels: stateCommand("Update the labels of an active Change without touching workflow records", {
    optional: ["types", "urgency"],
    notes: ["Provide --types, --urgency or both."],
    example: " --types '[\"修复\",\"安全\"]' --urgency high",
    run(ctx) {
      assert(ctx.opts.types !== undefined || ctx.opts.urgency !== undefined, "labels requires --types or --urgency");
      setLabels(ctx);
    },
  }),
  collaborators: stateCommand("Replace the supplementary collaborators of an active Change", {
    required: ["members"],
    help: {
      members: {
        value: "json",
        text: 'JSON array of {"name", optional "login", optional "subjectId" as a positive integer string}; \'[]\' removes them',
      },
    },
    example: " --members '[{\"name\":\"显示名\",\"login\":\"github-login\"}]'",
    run: (ctx) => setCollaborators(ctx, ctx.need("members")),
  }),
  "follow-up": stateCommand("Link an active Change to the archived delivery it continues, or remove the link", {
    required: ["target"],
    optional: ["group-title"],
    help: { target: { value: "id|none", text: "Archived direct predecessor id, or none to remove the link and its group title" } },
    example: " --target earlier-change",
    run(ctx) {
      const { state, opts, need } = ctx;
      const target = need("target");
      if (target === "none") {
        assert(opts["group-title"] === undefined, "Cannot name a removed follow-up group");
        delete state.followUpOf;
        delete state.followUpTitle;
      } else {
        assert(changeIdPattern.test(target), "Invalid follow-up target id");
        setFollowUp(ctx, target);
      }
    },
  }),
  depends: stateCommand("Replace or clear the dependencies of an active ordinary Change", {
    required: ["depends-on"],
    optional: ["availability-note"],
    help: { "depends-on": { value: "id,id|none", text: "Comma-separated published Change ids; none clears the list" } },
    example: " --depends-on prerequisite,other",
    run({ state, need }) {
      assert(state.size !== "xlarge", "xlarge cannot declare dependencies");
      const targets = need("depends-on");
      if (targets === "none") delete state.dependsOn;
      else state.dependsOn = list(targets);
    },
    // New dependencies must be published; once executing they must also be delivered.
    async after(ctx) {
      const { state, original, repo, catalog, opts } = ctx;
      const previous = JSON.parse(original).dependsOn ?? [];
      for (const target of state.dependsOn ?? []) {
        if (previous.includes(target)) continue;
        if (["execution", "close"].includes(state.stage)) {
          await requireDelivered(ctx, target);
        } else {
          const record = routedRecord(repo, catalog, target, { refresh: !opts["dry-run"] });
          assert(!record.errors.length, `Dependency ${target} has invalid state`);
          assert(record.sourceRef?.startsWith("refs/remotes/origin/"), `Push dependency ${target} before declaring it`);
        }
      }
    },
  }),
  children: stateCommand("Replace the child list of an active xlarge Change", {
    required: ["children"],
    help: { children: { value: "id,id", text: "Non-empty comma-separated list of child Change ids" } },
    example: " --children child-a,child-b",
    run({ state, need }) {
      assert(state.size === "xlarge", "Only xlarge can have children");
      state.children = list(need("children"));
    },
  }),
  resize: stateCommand("Change the size of an active Change and align its stage with its confirmations", {
    required: ["size"],
    help: { size: { choices: ["small", "medium", "large"], text: "New size; xlarge cannot be resized" } },
    example: " --size medium",
    run({ state, need }) {
      const size = need("size");
      assert(ordinarySizes.includes(state.size) && ordinarySizes.includes(size), "Cannot resize to or from xlarge");
      if (state.size === size) return;
      const stage = stageAfterResize(state, size);
      if (state.stage === "close" && stage !== "close") {
        state.closure = {};
        delete state.confirmations.merge;
      } else if (state.stage === "close" && state.size === "small" && state.closure.acceptance) {
        // The record does not store the mode. Recheck acceptance under the new size.
        delete state.closure.acceptance;
        delete state.closure.specs;
        delete state.confirmations.merge;
      }
      state.stage = stage;
      state.size = size;
    },
  }),
  cancel: stateCommand("Cancel an active Change; stage, tasks, documents and code are kept and the branch is frozen", {
    required: ["reason"],
    example: " --reason '需求已由其他 Change 覆盖'",
    run({ state, now, need }) {
      state.status = "cancelled";
      state.cancellation = { at: now, reason: need("reason") };
      delete state.waitingFor;
    },
  }),
};
