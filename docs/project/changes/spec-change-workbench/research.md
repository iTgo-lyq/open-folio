# 调查依据与实现准备

读取日期：2026-10-02（Asia/Shanghai）。

## 当前仓库与来源

- 已确认：当前仓库 `iTgo-lyq/open-folio` 为私有仓库，默认分支 `main`；`workflow.json` 已登记 `main` 为守护分支，提交前校验通过 `.githooks/pre-commit` 接入。
- 已确认：本次 `git fetch origin` 成功，起点为 `fcfa606`；本地仅有 main，无可复用 Change。产品源码、Specs 与已归档 Change 均尚不存在。
- 已确认：当前 CLI 能读取该中心仓库。应用进程的认证注入、远端刷新和快照持久化尚未实现，须在 Technical 中验证，不能把 CLI 可读当作应用已接通。
- 用户已明确选用已推送的中心仓库记录；即使服务运行在当前开发机，也不能直接扫描当前工作目录作为产品事实。

## UI 参考与复用

参考目录：`/home/tiger/workspace/open-folio-prototype-archive-20260930`。该目录与更早的 `open-folio-archive-20260930` 不同。

- 已确认：现有应用以 Next.js、React、Tailwind 和 shadcn/Radix 实现，运行进程实际工作目录为上述归档目录，端口为 10680。
- 已确认：用户认可 UI 框架。C 方案包含蓝紫背景、玻璃导航、可收起侧栏、深海蓝品牌、桌面右侧详情抽屉与手机底部导航。
- 已验证：本次在现有运行应用复跑 `playwright test`，18 个浏览器场景全部通过（45.2 秒），覆盖文档检索、深层目录、Change 与任务、异常来源、导航、详情抽屉、手机及设计相关流程。产品范围仅复用 Spec／Change 对应经验。
- 本次截图位于 `/home/tiger/.codex/visualizations/2026/10/01/01a0f9c4-869a-7d70-918c-244c209ce8a2/prototype-review-20261002/`。原归档的 `artifacts/` 也保存了历史截图。
- 来源代码：`src/components/workspace.tsx`、`src/app/workspace-shell.css` 提供外壳；`specs.tsx`、`changes.tsx` 提供交互参考；`public/brand/openfolio-mark-deep-blue.png` 为用户已选品牌资源。
- 资源记录：归档 `docs/RESOURCE_USAGE.md` 说明已购买模板的本项目适配及来源。复用仅限本项目应用，不复制 `.env.local`、私有 registry 回执或 `.resources/` 到产品或公共资源。

## 原型与当前规则的差异

| 原型实现 | 新工作台要求 |
| --- | --- |
| `src/lib/data.ts` 与 `nested-specs.ts` 中的预置数据 | 读取中心仓库已推送提交中的真实文件 |
| `changeDocument()` 拼接示例 Markdown | 原样读取实际正文，缺失时说明来源问题 |
| 数字阶段、中文状态与简化 Change 类型 | 保持当前 `ChangeState` 的 id、size、status、stage、branch 等字段语义 |
| 通过阶段位置画此前已通过标记 | 确认必须由 JSON 记录证明，并考虑规模、返工与关闭步骤 |
| 任务对象中的 `deps` 数组 | 当前 skill 的任务依赖只在 Plan 执行顺序表维护 |
| CH-016 为“已取消并归档” | cancelled 保留在 changes，completed 才属于成功关闭归档 |
| 原型主题、反馈、版本保存在 localStorage | 首版只保留必要浏览偏好，不移入原型模块和模拟 AI |
| 三套 UI 共存与演示项目选择 | 本次以已认可 C 外壳为基线，配置真实项目并重做内部信息结构 |

## 数据规则与技术阶段核实事项

- 已确认：当前 skill 的 schemaVersion 为 1，字段约定写在主 SKILL.md；现有 hook 对类型、字段和部分条件约束做校验，不能替代完整流程语义或依赖校验。
- 已确认：Change 以声明主分支为准，Specs 和 Change 正文与 JSON 应绑定同一采集提交；保留来源和异常，不能混合多个分支得出完成结论。
- 已确认：任务状态在 JSON，依赖表在 Markdown。依赖解析应支持 skill 中的表格形式，并在缺失、歧义或损坏时回到原文，不猜测执行顺序。
- 尚未验证：应用采用的 Git 读取／缓存方式、认证配置、分支聚合策略、刷新失败恢复和资源上限；Technical 需给出端到端路径与验证证据。
- 尚未验证：依赖交付在当前分支可用的判断，尤其守护分支 squash 合入后，不能只用源提交祖先关系断言未交付。无可靠证据时应明确待核实。
- 尚未验证：Markdown 路径解析、图片与外链边界、仓库内容隔离和文档大小限制；读取服务不能变成任意文件或命令入口。
- 合理推断：现有 React 组件和样式可支持保留认可外壳；继续使用其技术组合或收窄依赖需要在 Technical 中决定，不能整仓复制后视为真实功能完成。

本阶段只形成需求与调查材料；不提前写正式产品代码。
