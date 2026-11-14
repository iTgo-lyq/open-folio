# 执行验证

实现已按用户逐项指示提交，任务验证和完成状态在本轮补记。[计划](plan.md)保留 T1–T6 与主要实现提交的对应关系。

| 范围 | 检查与结果 |
| --- | --- |
| T1 接入与文档 | 核对项目入口声明、唯一的主 Skill 与接入说明，检查现行 Skill、文档和站点的许可文件及描述。介绍站构建与静态校验通过，覆盖 4 页和 10 个产物，发布工具测试 6 项通过。 |
| T2 CLI | 核对总帮助、组帮助和命令帮助。确认总帮助只有八个日常命令组。路由测试验证 CLI 与工作台均拒绝带 `checkForUpdates` 的配置。 |
| T3 CLI 与回归 | 应用测试 464 项、Skill 测试 21 项、定向工作流和原型回归 84 项通过。应用和 UI 包通过类型检查。 |
| T4 原型 | 原型包测试 16 项、托管浏览器测试 2 项通过。验证空目录接入保持 pending、enable 要求 build、发布登记、独立与子模块原型、Git 兜底和归档。OpenFolio 现有原型包的构建方式留待后续 Change 迁移。 |
| T5 依赖检查 | Skill 测试覆盖全包脚本的依赖及扫描规则。核对提交 hook 已移除依赖扫描，`setup check` 返回 ready。 |
| T6 阶段拆分 | 核对主 Skill 的阶段入口、共享提问、返工与 worktree 指引。Skill 及项目现行文档的 146 个本地引用通过目标文件和标题锚点校验。 |

## 复跑命令

```sh
node --conditions=react-server --test --test-concurrency=10 tests/*.test.ts
node --test .agents/skills/spec-trail/tests/*.test.mjs
node .agents/skills/spec-trail/cli.mjs setup check
npm run typecheck
npm test --workspace prototype
npm run test:e2e -- tests/browser/hosting.spec.ts
node website/build.mjs
node website/check.mjs
node --test website/*.test.mjs
```

首次 `npm test` 中服务生命周期测试停止超时，其余 463 项通过。该用例单独重试通过，随后同一测试集限制并发至 10 后 464 项全部通过。托管浏览器用例需要独立的测试会话及跨源权限，使用 Playwright 自带的 Chromium 与测试服务。

按用户要求免除独立评审。整体验证以需求、方案和计划逐项核对及上述实测结果为依据。
