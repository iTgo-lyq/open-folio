# 执行与验证

## T1 当前契约清理与回归验证

删除配置与个人状态转换器、凭据恢复入口及界面、项目式 API 和原型 URL 转接、公开别名写入解析、缓存格式转换、备用项目缓存键、登录字段别名和无效分支选择参数。同步删除专属测试、夹具和原型演示场景。保留有效的设备会话、密钥轮换、当前 artifact 和 publicationId 访问。

README、当前 Specs、SpecTrail skill 和原型包说明改为当前契约。ISO 8601 时间读取、缓存失效重建、固定版本保留属于当前能力，继续保留。归档 Change 无修改，package 版本无修改。

验证：`npm test` 145 项通过（包括新增状态/快照非法输入不覆盖数据检查）；`npm run typecheck` 通过；完整 `npm run test:e2e` 67 项通过；原型包测试 13 项通过；`npm run format:check` 与 `git diff --check` 通过。删除路由后用 Next.js `typegen` 刷新生成类型，未保留空路由占位。最终移除无效分支参数后，单元和类型重新通过，浏览器相关回归在 T2 补验。

扫描范围覆盖 src、scripts、tests、README、当前 Specs、skills 和原型源码。保留正常业务中的“已发布版本”“失效缓存”“前一请求”等概念，不将固定产物或数据保留当作格式兼容删除。

## T2 开发机验证与 iclaude 独立验收

iclaude 第一轮发现两项当前能力测试被一并删除，以及若干文档/样式残留。补回晚到偏好响应的 switch/logout 浏览器测试，新增独立原型撤回 HTTP 鉴权测试，完成文案、无引用样式、目录参数和空目录清理；问题与复验结论见 review.md。

最终验证：单元测试 146 项通过，类型检查及格式检查通过；在已提交、干净的 064c755 上启动完整浏览器回归，69 项全部通过（无重试）。原型工具测试 13 项通过。`service:update` 生产构建成功，服务运行在 10680，commit 为 064c755、dirty=false，buildId 为 rOgIPFWc_HrxYKtpDwR_c。

停机时仅整理当前状态中的废弃字段；保留 1 个工作台和 1 个原设备会话。状态 schema 校验通过，工作台/设备 UUID 和两个密钥摘要在最终验证后仍一致。iclaude 复验通过后，本次最小状态临时备份及其索引已删除；没有删除其他运行数据。

真实工作台验证：token 登录、仓库发现、Specs/Changes 和正文读取成功；删除的入口普通 404；桌面 1440px 与手机 320px 的三个已发布原型、列表对齐、目录切换、加载及重新加载通过。验证设备均独立退出，原设备保持有效。

证据：`/tmp/openfolio-cleanup-unit.log`、`/tmp/openfolio-cleanup-types.log`、`/tmp/openfolio-cleanup-format-check.log`、`/tmp/openfolio-cleanup-e2e-release.log`、`/tmp/openfolio-cleanup-prototype.log`、`/tmp/openfolio-cleanup-service-final.log`、`/tmp/openfolio-cleanup-smoke-final.log`、`/tmp/openfolio-cleanup-live-final.log`、`/tmp/openfolio-iclaude-recheck.log`。

独立复验确认 R1–R5 均解决、未引入新缺陷、无阻塞项。单元与类型测试先通过，再提交相同实现；完整浏览器及生产构建在该固定提交上执行。iclaude 仅查看代码和测试日志，真实环境操作由实施 Agent 完成，未冒称由独立评审者重做。
