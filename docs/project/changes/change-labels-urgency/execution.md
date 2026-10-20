# 实施与验证

执行工作区为 Codex 创建并附加到本聊天的 `/home/tiger/.codex/worktrees/change-labels-urgency/open-folio`，分支为 `codex/change-labels-urgency`。已核对 cwd、分支及共享 Git 目录，使用该明确路径执行；主工作区保持 develop。采用客户端托管路径以保留聊天与工作树关联。

## T1

增加可选 `types` 与 `urgency`，创建命令和 `labels` 支持独立更新、类型规范化及恢复默认普通。共享校验供命令、hook 和工作台读取复用；错误可选字段单独警告，不撤销合法完成事实。缓存版本递增，旧解析快照按现有机制重建。

skill 正文仅增加两个字段和一段标注指引；状态命令表增加参数与 labels 一行，不增加流程或配套文档。

验证：

- `node --conditions=react-server --test tests/state-commands.test.ts tests/changes.test.ts tests/incremental-cache.test.ts`：39 项通过，覆盖命令、兼容读取、错误隔离、完成依赖与缓存重建。
- `npm run typecheck`：应用及 UI 包通过。
- `skill-creator/scripts/quick_validate.py .agents/skills/spec-trail`：通过。

测试通过临时 Git 仓库完成写入、推送和读取；没有修改历史归档或运行数据。

## T2

列表、阶段看板及详情共用标签展示；类型自由多选与无类型条件按 OR，和紧急程度及既有条件取交集。类型候选来自项目实际记录。默认保留创建顺序，可切换紧急优先，同级稳定排序；任务、依赖与延续组沿用统一结果。普通不在行/卡片增加徽标，详情按有效等级显示。

验证：

- 新查询逻辑及既有读取、创建顺序、延续组测试：24 项通过。
- Change、延续组和新增标签浏览器回归：18 项通过。首次 17 项通过，URL 独有选项取消后立即消失，Playwright `uncheck()` 等待已移除元素超时；改为点击并断言选项消失，定向复跑通过。
- `npm run typecheck`、`npm run format:check`、`npm run build` 通过。
- 目视检查 `artifacts/change-labels-desktop.png`、`change-labels-mobile-filter.png`、`change-labels-mobile-detail.png`：桌面、320px 长标签及浮层均无水平溢出；键盘选择、Escape 焦点恢复、URL 往返、详情返回和切仓库清理均通过浏览器检查。

独立评审 R2 的读屏数量问题修正后，4 项标签浏览器用例全通过，类型/格式检查及生产构建再次通过。使用新 `labels` 命令为本 Change 标注“新功能”，保持紧急程度省略。

构建在任务工作区 `.next`，浏览器用隔离的 `.next-e2e`；长期服务及其数据未受影响。

## T3

同步既有 Store 重建测试的缓存版本预期为 7，旧版输入、拒绝读取及原始缓存字节不被改写的断言保持有效。`npm test` 完整回归 248 项通过，无跳过或失败。

独立评审覆盖完整差异，R1、R2 修正后均复核通过，无遗留问题。需求验收 1–3、7 由命令/共享校验/读取/缓存测试覆盖，4–6 由查询单测、18 项浏览器回归及桌面/320px 截图覆盖。尚待用户验收后同步 Specs、归档、集成及更新长期服务。
