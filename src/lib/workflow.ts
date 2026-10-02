import type { ChangeState } from "./model.ts";
export function documentExpectation(
  state: ChangeState | null,
  filename: string,
): "缺失" | "当前规模不要求" | "当前阶段尚未要求" | "状态不可判定" {
  if (!state) return "状态不可判定";
  const stage = [
    "requirement",
    "technical",
    "plan",
    "execution",
    "close",
  ].indexOf(state.stage);
  if (filename === "requirement.md") return "缺失";
  if (filename === "technical.md" || filename === "plan.md") {
    if (state.size === "small") return "当前规模不要求";
    const threshold = filename === "plan.md" && state.size === "large" ? 2 : 1;
    return stage < threshold ? "当前阶段尚未要求" : "缺失";
  }
  if (state.size !== "large") return "当前规模不要求";
  return stage < (filename === "review.md" ? 4 : 3)
    ? "当前阶段尚未要求"
    : "缺失";
}
