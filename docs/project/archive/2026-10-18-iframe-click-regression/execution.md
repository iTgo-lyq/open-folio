# 验证记录

## T1：托管预览点击与握手生命周期

根因位于本机 Playwright 1.63.0 / Chromium 153.0.8010.12 的隔离 iframe 坐标换算。已安装 Playwright 的 Chromium `_getBoundingBox` / `_getContentQuads` 给子元素坐标增加 iframe 左上角偏移，但未应用 iframe 的 CSS transform 缩放。原测试在默认约 76% 的适应画布模式点击，鼠标落到按钮下方的 html，触发命中检查重试直至 30 秒超时。

最小实验使用带 `sandbox="allow-scripts"` 的 iframe，左上角为 (200,200)，内部按钮矩形为 (40,80,100,40)，缩放为 0.76。可视中心应为 (268.4,276)，Playwright 未缩放的元素矩形中心为 (290,300)。通过 page.mouse 点击前者，按钮计数增加，事件 target 为 BUTTON 且 isTrusted=true；点击后者 target 为 HTML，计数不变。模拟时钟开启或关闭都能观察到未换算的矩形；100% 下坐标正常。因此无需改动产品的画布或沙箱。

修复分为两个明确的检查边界：

- 原握手生命周期测试切到 100%，仍使用普通 locator.click，保留无 ready 桥接、跨过 5 秒阈值、显式 error 告警与重新加载恢复的断言。
- 新增适应画布和 100% 的真实鼠标交互测试，使用 iframe 与内部按钮的实际布局换算可视点击点；点击前分别检查顶层命中 iframe、内部命中按钮，点击后验证计数递增与可信事件。没有强制点击、DOM click、跳过用例或增加超时。

验证：

- 定向运行两项托管交互／握手测试：2 项通过，各约 2.7 秒。
- `npm run test:e2e -- tests/browser/prototypes.spec.ts`：12 项全部通过，41.4 秒；原超时用例约 2.7 秒，缩放鼠标交互约 2.5 秒。
- `npm run typecheck`：应用和 UI 包均通过。
- `npx prettier --check tests/browser/prototypes.spec.ts`、`git diff --check`：通过。

Agent 自查确认测试仍覆盖真实鼠标输入和原始握手语义。本次仅变更测试和 Change 记录，不改变服务实现、产品契约或 Specs，不需要重建或重启长期服务。使用隔离的 fixture 会话与数据，没有创建真实工作台登录。
