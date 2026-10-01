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

## 数据规则

- 已确认：当前 skill 的 schemaVersion 为 1，字段约定写在主 SKILL.md；现有 hook 对类型、字段和部分条件约束做校验，不能替代完整流程语义或依赖校验。
- 已确认：Change 以声明主分支为准，Specs 和 Change 正文与 JSON 应绑定同一采集提交；保留来源和异常，不能混合多个分支得出完成结论。
- 已确认：任务状态在 JSON，依赖表在 Markdown。依赖解析应支持 skill 中的表格形式，并在缺失、歧义或损坏时回到原文，不猜测执行顺序。
- 已决定的方案见 [Technical](./technical.md)：独立 bare Git 缓存、固定提交和 blob 的文档快照、主分支归属、严格 schema、失败保留、受限图片和路径解析。应用级事务与 API 测试留待执行阶段，不能把下列原语实验写成应用验收。
- 依赖交付可用性不等同于归档记录存在。squash 合入后祖先关系可能不成立，且已合入交付可能被撤销；方案展示记录和 Git 证据，证据不足时待核实，不自动放行。
- 现有 React 组件和样式可支持保留认可外壳；只抽取实际需要的界面资源，不整仓复制演示逻辑。

## 技术阶段实验：私有远端与独立缓存

2026-10-02，在 `/tmp/open-folio-technical-1i2tenxf/source.git` 创建独立 bare 仓库，不复用当前工作区的 Git 对象，配置当前私有 HTTPS 远端，以非交互方式运行：

```text
git ls-remote --symref origin HEAD
git fetch --atomic --prune --no-tags --no-recurse-submodules origin +refs/heads/*:refs/remotes/origin/*
git for-each-ref --format=%(objectname) %(refname) refs/remotes/origin/
git ls-tree -rz --full-tree <commit> -- docs/project/
git cat-file blob <blob-id>
```

- 已验证：读取耗时 5.25 秒，远端 HEAD 为 main，独立缓存确为 bare，无 checkout。
- main 固定提交为 `fcfa6066a7f7cf563f67dd005a1a79164642d90a`，仅有 workflow；Change 分支为 `e5ab3fd9f1259107005ab7c17ac36d557144143f`，取得 JSON、需求、调查和 workflow 四份文件。
- JSON blob 为 `07a1539606c670092f33757a8a23962e7221d81a`，705 字节。文件读取以对象 id 完成，未读取本地未提交工作区。
- 又以 Node 24.21.0 的 execFileSync／参数数组复验 fetch，关闭 shell、交互、非 HTTPS 协议、HTTP 重定向、自动维护与 hooks；结果通过。现有 credential helper 足以支持当前运行环境。
- 原始非敏感结果保存在该临时目录的 `result.json`；临时产物不属于产品或远端工程记录。

## 技术阶段实验：推送边界与异常文件

用 `/tmp/open-folio-git-probe.py` 在 `/tmp/open-folio-git-fixture-g1higwb2/` 创建完全隔离的 bare 远端、作者仓库和读取缓存；测试专用 file 协议不用于产品配置。九项断言全部通过：

1. 作者工作区未提交内容不进入 fetch 结果。
2. 作者已提交但未推送的提交不进入读取缓存。
3. 推送后能取得新 JSON／正文对应的提交。
4. 固定旧 blob 后，新提交不会改变旧正文。
5. 指向 `/etc/passwd` 的符号链接仅是 `120000` 模式及链接文本，不读取宿主文件。
6. `ls-tree -z` 能无歧义区分带换行的路径，后续路径策略可明确拒绝这种名字。
7. 远端读取失败不改变既有 refs。
8. 远端删分支后 prune 移除跟踪 ref。
9. prune 后旧 blob 仍可读取；产品仍需自行保存完整快照并控制清理策略。

该实验没有修改产品仓库、真实远端或当前作者分支。产品的快照落盘事务、并发锁、过期响应和清理需要在执行阶段单独验证。

## 技术阶段实验：Markdown 与依赖版本

- 已核对归档 lockfile 和安装包：Next 16.3.7、React 19.3.0、TypeScript 5.9.3、Tailwind 4.3.3、Radix 1.6.7、react-markdown 10.1.0、remark-gfm 4.0.1、remark-parse 11.0.0、unified 11.0.5、Zod 3.25.76、Playwright 1.63.0。
- 已阅读该 Next 安装包内 `01-app/01-getting-started/15-route-handlers.md`、`02-guides/data-security.md` 和环境变量文档；Node Route Handlers 支持所需进程／磁盘读取路径，路由参数须按该版本约定处理，API 不依赖默认缓存行为。
- 已验证：unified + remark-parse + remark-gfm 能解析当前 SKILL.md 的执行顺序表示例，输出 T1 无、T2→T1、T3→T1、T4→T2/T3；样例中的行内代码、强调和链接标签可提取为相同编号，代码块内伪表不进入 table 节点。
- 已验证：react-markdown 保留默认 URL 处理并启用 skipHtml 时，测试中的 script 不渲染、javascript 链接不产生可执行 href，中文标题保留。自定义链接／图片组件仍须按 Technical 的边界测试，不能把默认行为推广为整个应用已经安全。

## 一手资料核对

2026-10-02 读取：

- [Git fetch](https://git-scm.com/docs/git-fetch)：atomic 控制本地 refs 的整体更新，prune 对应远端删除；本地 2.39.5 的实际命令已实验验证，不依赖网页中新版参数。
- [Git cat-file](https://git-scm.com/docs/git-cat-file)：按对象读取类型／大小／正文；本方案使用本地已验证参数，不启用 filters、textconv 或 follow-symlinks。
- [react-markdown security](https://github.com/remarkjs/react-markdown#security)：默认 URL 处理的边界，以及自定义插件和组件会引入额外责任。
- [Next self-hosting](https://nextjs.org/docs/app/guides/self-hosting)：持久自托管进程及外部访问边界；方案选择单实例，不承担多副本缓存协调。

本阶段产出技术方案和实验结论，不提前写正式产品代码或新的 Plan。
