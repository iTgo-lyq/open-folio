import type { DocumentRef, ProjectConfig, Snapshot } from "../lib/model.ts";
import type { GitReader } from "./git.ts";
import { workflowCoreSchema } from "./schema.ts";
export type Collected = Awaited<ReturnType<GitReader["collect"]>>;
export function indexBase(data: Collected, project: ProjectConfig) {
  const diagnostics: Snapshot["diagnostics"] = [];
  const workflow = data.documents.find(
    (d) =>
      d.branch === data.defaultBranch &&
      d.path === "docs/project/workflow.json",
  );
  let protectedBranches: string[] = [];
  const schema = workflowCoreSchema;
  try {
    protectedBranches = schema.parse(
      JSON.parse(
        workflow?.readable ? data.blobs.get(workflow.blob)!.toString() : "",
      ),
    ).protectedBranches;
  } catch {
    diagnostics.push({
      code: "WORKFLOW_INVALID",
      message:
        "远端默认分支缺少有效的 workflow.json，尚未确定稳定 Specs 来源。",
      path: "docs/project/workflow.json",
      severity: "warning",
    });
  }
  const requested = data.defaultBranch;
  const specBranch =
    requested &&
    protectedBranches.includes(requested) &&
    data.branches.some((b) => b.name === requested)
      ? requested
      : null;
  if (!specBranch)
    diagnostics.push({
      code: "SPEC_BASELINE_UNKNOWN",
      message: "默认分支未登记为守护分支，请修复 workflow.json 后重新读取。",
      severity: "warning",
    });
  const specs = data.documents.flatMap((d: DocumentRef) => {
    const m =
      /^docs\/project\/specs\/([a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)\/spec\.md$/.exec(
        d.path,
      );
    return m && d.branch === specBranch
      ? [{ id: m[1], title: d.title, branch: d.branch, documentId: d.id }]
      : [];
  });
  return { protectedBranches, specBranch, specs, diagnostics };
}
