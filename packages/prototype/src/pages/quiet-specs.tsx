import Specs from "../../../../src/components/specs";
import { mount, WorkbenchFrame } from "../fragment";
mount({
  title: "Specs 阅读片段",
  module: "specs",
  source: "Specs / Reader / ReadingDocument",
  render: () => (
    <WorkbenchFrame module="specs">
      <Specs />
    </WorkbenchFrame>
  ),
});
