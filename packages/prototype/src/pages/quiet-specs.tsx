import Specs from "../../../../src/components/specs";
import { mount, WorkbenchFrame, ReadingState } from "../fragment";
mount({
  title: "Specs 阅读片段",
  module: "specs",
  source: "Specs / Reader / ReadingDocument",
  render: (scene) => (
    <WorkbenchFrame module="specs">
      <ReadingState scene={scene}>
        <Specs />
      </ReadingState>
    </WorkbenchFrame>
  ),
});
