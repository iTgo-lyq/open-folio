// Command groups in overview order. A group's module exports `commands` and
// optional `notes`, and loads only when that group is used. Hidden groups stay
// out of the overview; their own guides document them.
export const groups = {
  change: {
    summary: "Create a Change and maintain its title, labels, relations and cancellation",
    load: () => import("./state/change.mjs"),
  },
  clarify: { summary: "Record clarification questions and the user's answers", load: () => import("./state/clarify.mjs") },
  task: { summary: "Plan tasks and move them through todo, doing, blocked and done", load: () => import("./state/task.mjs") },
  stage: { summary: "Stage confirmations, entering execution, waiting and rework", load: () => import("./state/stage.mjs") },
  close: { summary: "Overall verification, acceptance, Specs sync and archive", load: () => import("./state/close.mjs") },
  workspace: { summary: "Work branch registration and Change worktrees", load: () => import("./workspace.mjs") },
  integration: { summary: "Pull request delivery checks and source cleanup after archiving", load: () => import("./integration.mjs") },
  share: { summary: "OpenFolio links to Change materials", load: () => import("./share.mjs") },
  setup: {
    summary: "Project readiness, routing preview and commit/PR validators",
    hidden: true,
    load: () => import("./setup/commands.mjs"),
  },
  prototype: {
    summary: "Prototype package, publishing, validation and Change previews",
    hidden: true,
    minNode: 24,
    load: () => import("../prototype/scripts/commands.mjs"),
  },
};
