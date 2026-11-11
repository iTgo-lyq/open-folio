# 实施与验证

## T1 对齐浏览器分组断言并完成相关与全量回归

### 当前 main 的原始复现

2026-11-11 定向 fetch 后，远端 main 为 `91c235f37bb6cda20b62b0b66b789d4a2daf94f8`。在工具创建的独立 worktree 以此提交 detached HEAD 执行未修改测试；当时 develop 为 `9284b0a`，两者文件树完全相同，main 额外的 24 个提交均为发布合并历史。

```bash
npm ci
npm run test:e2e -- tests/browser/changes.spec.ts tests/browser/change-labels.spec.ts tests/browser/change-reader.spec.ts tests/browser/change-directory.spec.ts tests/browser/follow-ups.spec.ts --grep 'list filters, inline materials|list and board share stable urgency|adjacent Changes follow|deferred requirements and stage dots|continuations show grouped deliveries' --reporter=line
```

结果：4 failed、1 passed（1.6 分钟）。

| 场景 | 原始结果与原因 |
| --- | --- |
| changes：list filters, inline materials | 失败：旧阶段看板定位到 0 列，期望 5；实际为默认处理状态看板四列 |
| change-labels：list and board share stable urgency | 失败：旧阶段看板找不到链接，返回空数组；实际为处理状态看板 |
| change-reader：adjacent Changes follow | 失败：点击旧阶段看板中的首条链接超时；实际保留入口 `group=none` 的不分组看板 |
| change-directory：deferred requirements and stage dots | 通过：先验证处理状态看板，再显式选择阶段，五列断言正确 |
| follow-ups：continuations show grouped deliveries | 失败：连续交付 region 期望 1、实际 2；source-connect 位于待集成，technical-budget 位于交付待核实 |

本地原始日志：`/tmp/openfolio-browser-main-repro.log`；失败快照和 trace 保存于 `/tmp/openfolio-browser-main-repro-results/`。这些临时材料不提交，关键结果保存在本文件。

自动化沿用仓库 Playwright 的独立 context 与 fixture 测试服务（10682/10684、`.next-e2e`），因为套件需要重置模拟会话、设置权限及验证多账号隔离；不使用共享 Chrome 默认 context，不访问常驻用户数据，也未执行模型测试。新 worktree 由应用管理工具分配路径，handoff 复用该已登记工作区。

### 恢复断言后发现的直接问题

首次运行五个完整 spec：24 passed、2 failed（2.7 分钟），不计为通过。此时产品源码与 main 完全相同，仅调整了原失效测试定位器及断言。

- `change-reader` 在正确定位不分组看板后，首条 `default-serial` 进入详情，下一项按钮 disabled。trace 显示旧详情逻辑仅在桌面看板时强制按 STAGES 分组，目录实际顺序却是当前选择的不分组。修复为复用 `groupDirectoryChanges`，让目录与详情共享已存在的分组语义；移除冗余阶段分支及 import，保留原相邻导航断言。
- `follow-ups` 的交付阶段成员断言统计了该行新增的规模链接，导致一个成员有两个 link。将本场景的成员数量、排序、几何位置及长标题检查限定为可访问名称以「打开 」开头的标题链接，保留规模链接现有功能。

首次相关回归 trace 保存于 `/tmp/openfolio-browser-related-first-results/`。改动仍限于目标测试及其直接暴露的导航缺陷，没有新增 UI 设计、能力或数据变更。

### 修复后的验证

- 五个完整相关 spec：`npm run test:e2e -- tests/browser/changes.spec.ts tests/browser/change-labels.spec.ts tests/browser/change-reader.spec.ts tests/browser/change-directory.spec.ts tests/browser/follow-ups.spec.ts --reporter=line`，26 passed（2.1 分钟）。原失败的四个场景通过，显式阶段看板场景继续通过。日志 `/tmp/openfolio-browser-related.log`。
- `node --conditions=react-server --test tests/change-directory.test.ts tests/change-reading.test.ts tests/follow-ups.test.ts`：16 passed。日志 `/tmp/openfolio-browser-unit.log`。
- `npm run typecheck`：应用与 UI 包均通过。日志 `/tmp/openfolio-browser-typecheck.log`。
- `npm run build`：任务 worktree 的 `.next` 生产构建通过，未覆盖长期服务 `.next`。日志 `/tmp/openfolio-browser-build.log`。
- 五个变动的 TS/TSX 文件 Prettier 检查及 `git diff --check` 通过。

### 全量回归发现的同源交付断言

第一次 `npm run test:e2e` 在 `delivery.spec.ts` 发现旧「已发布」断言，实际详情为「已合入」。这是 `0a3b016b` 对应需求明确变更的文案；该测试后面的已归档列表也仍假定每行有交付标签，现行目录已采用合入时间线。确认后中止本次已失败运行，以便修复并从头跑全量：109 passed、1 failed、1 interrupted、60 did not run（9.0 分钟，退出码 130）。预览场景的 interrupted 是本任务发送 SIGINT 的结果，不记为产品失败或通过。日志 `/tmp/openfolio-browser-full-first.log`，当时的 trace 位于 `/tmp/openfolio-browser-full-first-results/`。

另外通过工具创建只读复现 worktree，以同一个 main `91c235f` 原始测试运行：

```bash
npm run test:e2e -- tests/browser/delivery.spec.ts --grep 'delivery groups include archived' --reporter=line
```

结果 1 failed，定位到第 115 行「已发布」不可见，实际「已合入」。日志 `/tmp/openfolio-browser-delivery-main-repro.log`，trace 位于 `/tmp/openfolio-browser-delivery-main-repro-results/`。复现工作区已完成用途并按应用管理流程清理。

修正详情文案断言；归档记录没有可靠 `mergedAt`，断言其在「合入时间未知」中保留标题，替代已不呈现的行内标签。只改测试，不变更交付或时间线逻辑；Change 标题随实际范围调整，规模仍为 small。

`npm run test:e2e -- tests/browser/delivery.spec.ts --reporter=line`：3 passed（21.3 秒），涵盖交付分组、历史和窄屏、限流刷新。日志 `/tmp/openfolio-browser-delivery-related.log`；该文件 Prettier 检查通过。此前五个相关 spec 的 26 项仍适用（产品源码未再修改），相关验证合计 29 项通过。

### 完整套件结果与范围外失败

在最终实现上从头执行、不带筛选或重试参数的 `npm run test:e2e`：170 passed、1 failed（13.4 分钟，退出码 1），171 项均执行，无跳过或中断。本次六个相关 spec 在全量中全部通过。日志 `/tmp/openfolio-browser-full.log`（另存 `/tmp/openfolio-browser-full-second.log`），失败 trace 保存于 `/tmp/openfolio-browser-full-second-results/`。

唯一失败为未修改的 `specs.spec.ts` 第 122 行阅读设置场景。在较大字号、专注阅读后切到 320px，能力目录按钮的点击点被「本页目录」按钮覆盖，Playwright 重试直至 30 秒超时。此前 834px、390px 的导航、标题、无横向溢出及截图检查均通过。trace 明确记录 `subtree intercepts pointer events`，不是 GPU 缺失或本次看板断言。

在任务分支用 `--grep 'reading settings persist' --repeat-each=3` 单独复跑，3 次均失败（日志 `/tmp/openfolio-browser-reading-recheck.log`、trace `/tmp/openfolio-browser-reading-recheck-results/`）。本次差异不含该测试及其 reader、shell 实现。按用户「不改动与这些测试无关的行为」的要求，不调整此处布局、不跳过测试，也不将完整套件报告为全绿。

恢复只读 main 复现工作区，确认 HEAD 仍为未修改的 `91c235f`，单独执行 `npm run test:e2e -- tests/browser/specs.spec.ts --grep 'reading settings persist' --reporter=line`：1 failed，trace 同样记录「本页目录」按钮拦截点击。日志 `/tmp/openfolio-browser-reading-main-repro.log`，trace `/tmp/openfolio-browser-reading-main-repro-results/`。由此确认它是范围外的既有问题；本次交付验收以已明确的目录分组、交付与导航修复为准，完整套件的未通过结果作为限制保留。只读复现工作区再次交由应用管理流程清理。

### 自验收与提交整理

逐项核对 Requirement：六个相关 spec 已通过；原始 main 失败和本来通过项均有证据；连续交付判断有历史需求及当前 Spec 依据；默认、阶段和不分组的名称、列数及上下文检查保持有效；导航修复覆盖了原断言暴露的真实问题；全量已完整运行并如实保留范围外既有失败。Agent 按 small 进行自查、自验收，范围内没有未解决验收项。

归档前再次定向 fetch 并确认 develop 无新增交付，当前内容已包含目标分支。检查源分支历史，保留 `97287b2` 执行启动、`7a4f011` 实现及相关验证、`e519b9a` 完整验证三个有效检查点；没有反复修测试或纯格式提交需要压缩，不改写已推送历史。既有 Specs 已描述当前分组、交付与相邻导航行为，本次恢复既定行为，无需同步产品规则。

small 自查：默认处理状态、不分组与显式阶段三种看板语义分别为四、一、五列；原排序、筛选、焦点、键盘、窄屏及深链接断言保留。连续交付按真实阶段展示，不把不同阶段的成员搬到一处；标题链接定位排除其他行内导航。详情使用同一目录分组函数，空列不影响顺序；列表、手机与归档时间线继续沿用既有路径。无数据迁移、共享契约或 UI 外观变化，Specs 已描述期望的导航与分组行为，无需新增产品规则。

交付为待审阅 PR；未获合并授权，不合入 develop 或 main。长期服务仅从主工作区已集成提交构建，本次实现待 PR 合入后更新，当前未切换运行服务或常驻数据。
