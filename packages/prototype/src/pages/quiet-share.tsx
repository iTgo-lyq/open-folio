import { ChangeReading } from "../../../../src/components/change-reading";
import { PublicShell } from "../../../../src/components/public-shell";
import { mount, ReadingState } from "../fragment";
mount({
  title: "Change 分享阅读片段",
  module: "changes",
  source: "PublicShell / ChangeReading；不启动分享解析和认证",
  sharing: true,
  render: (scene) => (
    <ReadingState scene={scene}>
      <PublicShell title="demo/atlas" label="只读分享 · 虚构">
        <ChangeReading />
      </PublicShell>
    </ReadingState>
  ),
});
