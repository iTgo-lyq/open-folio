import Changes from "../../../../src/components/changes";
import { ChangeViewsProvider } from "../../../../src/components/change-views-context";
import { mount, WorkbenchFrame } from "../fragment";
mount({
  title: "Changes 列表与材料片段",
  module: "changes",
  source: "Changes / ChangeDirectory / ChangeReading / ChangeViewsProvider",
  render: () => (
    <WorkbenchFrame module="changes">
      <ChangeViewsProvider>
        <Changes />
      </ChangeViewsProvider>
    </WorkbenchFrame>
  ),
});
