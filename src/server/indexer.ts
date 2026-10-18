import type { DocumentRef, ProjectConfig, Snapshot } from "../lib/model.ts";
import type { GitReader } from "./git.ts";
import { workflowCoreSchema } from "./schema.ts";
export type Collected = Awaited<ReturnType<GitReader["collect"]>>;
export function indexBase(data: Collected, project: ProjectConfig) {
  const diagnostics: Snapshot["diagnostics"] = [...data.sourceDiagnostics];
  const workflow = data.documents.find(
    (d) =>
      d.branch === data.collaborationBranch &&
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
      message: "协作分支缺少有效的 workflow.json，请完成 SpecTrail Setup。",
      path: "docs/project/workflow.json",
      severity: "warning",
    });
  }
  const requested = data.collaborationBranch;
  const specBranch =
    requested &&
    !data.sourceDiagnostics.length &&
    data.branches.some((b) => b.name === requested)
      ? requested
      : null;
  if (!specBranch)
    diagnostics.push({
      code: "SPEC_BASELINE_UNKNOWN",
      message: "协作分支来源尚未就绪，请完成 Setup 后重新读取。",
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
