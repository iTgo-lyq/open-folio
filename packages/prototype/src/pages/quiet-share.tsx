import { TriangleAlert } from "lucide-react";
import { Button } from "@open-folio/ui";
import { ChangeReading } from "../../../../src/components/change-reading";
import { Empty } from "../../../../src/components/document";
import { PublicShell } from "../../../../src/components/public-shell";
import styles from "../../../../src/components/shared-change.module.css";
import { useWorkspace } from "../mocks/context";
import { mount } from "../fragment";

// 分享页阅读主体未导出，这里按其读取、失败与不可读状态轻量还原。
function SharedReading() {
  const { data, loading, error, refresh } = useWorkspace();
  return (
    <PublicShell title="demo/atlas" label="只读分享 · 虚构">
      {!data ? (
        <div className={styles.empty}>
          <Empty
            title={loading ? "正在读取分享…" : error || "内容不存在或暂不可读"}
          >
            {!loading && (
              <>
                <p>请向分享者确认链接，或稍后重试。</p>
                <Button onClick={() => void refresh()}>重试</Button>
              </>
            )}
          </Empty>
        </div>
      ) : (
        <ChangeReading
          banner={
            error ? (
              <div className={styles.warning} role="alert">
                <TriangleAlert />
                <div>
                  同步失败：{error}
                  <p>当前显示上次读取的内容，稍后会自动重试。</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void refresh()}
                >
                  重试
                </Button>
              </div>
            ) : undefined
          }
        />
      )}
    </PublicShell>
  );
}
mount({
  title: "Change 分享阅读片段",
  module: "changes",
  source:
    "PublicShell / ChangeReading；分享页状态在包内还原，不启动分享解析和认证",
  sharing: true,
  render: () => <SharedReading />,
});
