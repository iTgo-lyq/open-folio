# 实施与验证

## T1 支持按真实合入批次浏览归档 Change

GitHub provider 和 PR 缓存保留真实 mergedAt，provider 映射版本更新使旧 ETag 缓存正常重新采集。交付核实输出最早有可靠时间的有效 PR 编号；历史补记保持原展示资格，缺证据不生成日期。列表、详情和分享共用“待集成 / 待合入 / 已合入”文案。

已归档单一状态使用按浏览器本地日期和 PR 批次倒序的时间线，每批预览 3 条并支持展开；缺少可靠时间放在末尾。筛选计数、实际分支、版本与 PR 链接均来自当前结果；其他状态与混合视图保留原列表。归档详情前后导航采用时间线完整顺序，展开状态跨详情保留，并确保返回目标可见。

## 验证证据

- `node --conditions=react-server --test tests/archive-timeline.test.ts tests/providers.test.ts tests/pull-requests.test.ts tests/delivery.test.ts tests/delivery-override.test.ts tests/change-directory.test.ts`：41 项通过，覆盖日期边界、同日多批次、证据选择、历史补记、读取失败、旧缓存升级与既有目录行为。
- `npm run typecheck`：应用与 UI 包类型检查通过；受影响文件 Prettier 检查、`git diff --check` 通过。
- `npm run build`：任务 worktree 的 `.next` 生产构建通过，未覆盖主工作区运行产物。
- Playwright 的 `archive-timeline.spec.ts`：通过日期/批次、筛选计数、折叠、键盘、旧 URL、混合视图和详情返回检查；1440、390、320 三档宽度 × 浅色/深色无横向溢出并生成截图。两批分别 13 条和 5 条的场景验证展开保留、焦点在视口、详情前后顺序。
- 既有 `change-directory.spec.ts`、`change-views.spec.ts` 共 9 项通过；修改详情顺序后 `change-reader.spec.ts` 两项通过。
- 自动化使用 `/opt/google/chrome/chrome` 的隔离测试配置，因为现有测试夹具会重置模拟账号。另通过常驻 CDP `127.0.0.1:9222` 的默认 context 创建本任务页面，验证真实组件的批次展开/收起并截图；模拟 API 使用独立请求上下文，不修改共享 Cookie，完成后仅关闭任务页面并断开连接。
- 独立评审发现并修复两项导航问题，复核无新增发现，见 [review.md](review.md)。

最终同步时 develop 已合入 `xlarge-parent-integration`（`ef3b734`），本分支通过 `25406ef` 合并最新基线。交付模块的文本冲突保留“子项先进入项目集成历史，再核实发布分支”的规则，再收集本次新增时间证据；独立评审对此组合复核通过。同步后上述 41 项单元测试加 `xlarge-integration.test.ts` 共 46 项全部通过，生产构建通过，归档时间线与既有目录浏览器 3 项复验通过。

首次单元测试暴露旧文案断言，已改为“待合入”；首次浏览器测试的完成记录夹具缺少归档步骤，补齐合法 fixture 后通过。首次共享 Chrome 临时验证退出时未等待在途 mock 请求，已修正为等待路由结束后再释放上下文并复验；这些失败未计作通过。

本地截图在 Git 忽略的 `artifacts/archive-timeline-{light,dark}-{1440,390,320}.png`，常驻 Chrome 截图为 `artifacts/archive-timeline-shared-chrome.png`，数据为明确的虚构仓库与交付记录。

## 交付边界

目前供用户验收工作分支实现。尚未执行用户验收、Specs 同步、归档、合入 develop 或更新长期服务；按 SpecTrail medium 的人工验收要求，确认后继续这些步骤。真实账号的 `withSmokeSession` 冒烟在集成后服务更新时执行，本轮不将模拟浏览器验证声称为真实账号冒烟。
