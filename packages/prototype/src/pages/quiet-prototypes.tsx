import Prototypes from "../../../../src/components/prototypes";
import { mount, WorkbenchFrame } from "../fragment";
mount({
  title: "原型总览与画布片段",
  module: "prototypes",
  source: "Prototypes / ChangePreviews；画布内资源为包内 mock",
  scenes: ["default", "empty", "error"],
  render: () => (
    <WorkbenchFrame module="prototypes">
      <Prototypes />
    </WorkbenchFrame>
  ),
});
