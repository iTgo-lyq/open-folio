import type { ChangeState, TaskGraph } from "../lib/model.ts";
import { parseTaskOrder } from "../../.agents/skills/spec-trail/scripts/task-order.mjs";

export { cyclicNodes } from "../../.agents/skills/spec-trail/scripts/task-order.mjs";

export function parsePlan(
  state: ChangeState,
  body?: string,
  documentId?: string,
): TaskGraph {
  return parseTaskOrder(state, body, documentId);
}
