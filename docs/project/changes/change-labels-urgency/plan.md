# Change 类型标签与紧急程度实施计划

依据[需求](requirement.md)与[技术方案](technical.md)，交付可兼容维护的标签元数据和完整的工作台浏览能力。按默认任务编号串行执行；任务共享字段契约及浏览数据，不安排并行实施。

## T1 — 支持类型标签与紧急程度的兼容读写

交付创建与 `labels` 语义命令、共享校验和服务端读取。两个字段可分别设置或清空，类型支持自由命名与多选；保持旧记录、流程事实和归档只读约定。同步精简的 skill 字段、命令与标注指引，并通过既有缓存版本重建避免复用旧解析结果。

验收对应需求第 1、2、3、7 项：验证旧记录、两字段分别存在与同时存在，类型规范化及任意名称，非法输入拒绝且文件不变，错误元数据逐字段隔离，以及历史有效完成和依赖不受影响。缓存回归覆盖旧解析快照失效重建、新版同引用继续复用。

在现有命令、Change 读取和增量缓存测试中增加相称的用例，执行：

```bash
node --conditions=react-server --test tests/state-commands.test.ts tests/changes.test.ts tests/incremental-cache.test.ts
npm run typecheck
```

完成标准是通过真实语义命令写入并推送的元数据能在工作台读取结果中准确出现；示例来自测试 fixture，不改写历史归档。

## T2 — 在工作台展示、筛选并按紧急程度浏览 Change

交付列表、阶段看板及详情中的标签展示，类型多选、无标签和紧急程度筛选，以及可选紧急排序。统一传递到任务和依赖视图，保持默认创建顺序、延续组名和执行关系。复用现有组件与布局，完成 URL 状态、键盘操作和窄屏适配；技术澄清 Q2 已确定无需独立原型。

验收对应需求第 4、5、6 项，并从浏览器复验第 1、2、3 项的可见结果。重点覆盖自由名称中的逗号/引号/中文/`none`、HTML 字样按文本展示、多选 OR 与其他条件 AND、缺失字段、无匹配、同等级稳定排序、跨范围延续组、看板栏内顺序及任务归属顺序。

测试复用现有 Change 与延续组浏览器 fixture；增加必要的筛选/查询纯逻辑用例，并执行：

```bash
node --conditions=react-server --test tests/changes.test.ts tests/follow-ups.test.ts tests/change-creation-order.test.ts
npm run test:e2e -- tests/browser/changes.spec.ts tests/browser/follow-ups.spec.ts
npm run typecheck
npm run format:check
npm run build
```

新增纯逻辑测试随所在测试文件纳入命令。浏览器检查覆盖刷新、前进后退、清除条件、详情返回与焦点、切仓库清理，以及桌面和 320px 下的多标签、长名称与浮层操作。构建在任务 worktree 串行执行，浏览器 fixture 使用既定 `.next-e2e` 和隔离数据，不占用长期服务产物。

## 整体验收与交付

两项任务均完成并提交推送后，按需求逐项核对实现和证据，安排独立评审，覆盖整个差异、兼容性、skill 是否精简及前端实际行为。定向检查已通过时不无故重复或扩大测试；只有新增改动、失败或未解决问题时补充验证。

提供给用户的验收材料包括：多个自定义标签及各档/空紧急程度的演示，标签筛选与排序、历史无标签记录，以及窄屏和键盘操作结果。medium Change 待用户验收后，同步 Change 状态维护及 Change 追踪两处 Specs，归档并集成 develop。

实施前从最新 develop 移交到 `codex/change-labels-urgency` 和默认独立 worktree，核对实际工作区归属。集成后由主工作区更新 11117 长期服务，检查运行提交和实际页面；真实登录冒烟使用 `withSmokeSession` 完成独立会话退出与清理。保留账号、绑定和偏好，服务验证通过后再按既有约定清理来源分支与 worktree。
