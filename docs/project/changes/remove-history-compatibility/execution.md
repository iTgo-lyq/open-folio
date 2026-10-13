# 执行与验证

## T1 当前契约清理与回归验证

删除配置与个人状态转换器、凭据恢复入口及界面、项目式 API 和原型 URL 转接、公开别名写入解析、缓存格式转换、备用项目缓存键、登录字段别名和无效分支选择参数。同步删除专属测试、夹具和原型演示场景。保留有效的设备会话、密钥轮换、当前 artifact 和 publicationId 访问。

README、当前 Specs、SpecTrail skill 和原型包说明改为当前契约。ISO 8601 时间读取、缓存失效重建、固定版本保留属于当前能力，继续保留。归档 Change 无修改，package 版本无修改。

验证：`npm test` 145 项通过（包括新增状态/快照非法输入不覆盖数据检查）；`npm run typecheck` 通过；完整 `npm run test:e2e` 67 项通过；原型包测试 13 项通过；`npm run format:check` 与 `git diff --check` 通过。删除路由后用 Next.js `typegen` 刷新生成类型，未保留空路由占位。最终移除无效分支参数后，单元和类型重新通过，浏览器相关回归在 T2 补验。

扫描范围覆盖 src、scripts、tests、README、当前 Specs、skills 和原型源码。保留正常业务中的“已发布版本”“失效缓存”“前一请求”等概念，不将固定产物或数据保留当作格式兼容删除。
