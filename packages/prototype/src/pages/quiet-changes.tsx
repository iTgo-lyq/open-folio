import Changes from "../../../../src/components/changes";
import { ChangeViewsProvider } from "../../../../src/components/change-views-context";
import { mount, WorkbenchFrame, ReadingState } from "../fragment";
mount({
  title: "Changes 列表与材料片段",
  module: "changes",
  source: "Changes / ChangeDirectory / ChangeReading / ChangeViewsProvider",
  render: (scene) => (
    <WorkbenchFrame module="changes">
      <ReadingState scene={scene}>
        <ChangeViewsProvider>
          <Changes />
        </ChangeViewsProvider>
      </ReadingState>
    </WorkbenchFrame>
  ),
});
