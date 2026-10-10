# 执行证据

## T1 简化读取与刷新并清理全部遗留

读取、刷新和 Git 原型响应直接进入既有项目与数据范围检查。配置、调用、错误提示、部署示例及旧测试断言已完整清理；严格配置解析不保留过渡字段或兼容分支。非空刷新请求体仍返回 400，原型托管地址批准及浏览器沙箱继续生效。

按用户“彻底删除干净，不要遗留任何相关表述”的要求，同步当前 Specs 并修正旧交付材料中的失效说明。旧材料的修订单独提交，仅改变文字；两份归档状态文件经实现方和独立评审分别核对，除描述性的 summary/verification 字符串外全部一致，状态、日期和验证结果没有改写。历史 Git 提交保持原样。

验证结果：

- `npm test`：66 项通过。真实临时 Git 仓库的成功刷新、未推送内容隔离、失败保留、项目与文件范围均通过。
- `npm run typecheck`、`npm run format:check`：通过；新增 Change 正文与修改后的当前 Specs 另经 Prettier 检查。
- `npx playwright test tests/browser/api.spec.ts tests/browser/previews-api.spec.ts tests/browser/prototypes.spec.ts tests/browser/thumbnails.spec.ts`：首轮 17 项通过，1 项失败来自刷新错误状态码断言。修正为实际错误契约的 503 后，单独重跑 `tests/browser/api.spec.ts` 的 3 项全部通过；18 项相关场景均有通过结果。
- 浏览器测试仅登记项目：不同请求头组合均可读取，空请求体刷新进入 Git 采集并返回 fixture 预期的 `GIT_READ_FAILED`。该 fixture 使用本地 file remote，生产采集器仅允许 HTTPS，所以此处验证进入采集和失败保留，成功刷新由真实临时仓库单元测试覆盖。
- `NODE_ENV=production npm run build`：默认 `.next` 构建通过。浏览器测试使用 `.next-e2e`；类型入口最终指向默认产物，没有新增临时构建目录。
- 源码与文档检索无失效配置字段、公共校验入口、错误码或请求限制描述；`git diff --check` 通过。
- 独立 subagent 只读评审覆盖完整差异、需求、验收及测试契约，发现的状态码断言已修正并复核关闭，无未解决问题。

归档前同步 main 的规模判断指引与工作流 Spec，无合并冲突。应用代码、测试、依赖及构建配置与已验证提交 `fed2b60` 完全一致，既有验证结果继续适用；再次检索确认失效标识无残留，差异检查通过。
