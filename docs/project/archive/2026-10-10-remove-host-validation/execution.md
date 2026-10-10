# 执行记录

## T1 取消公共 Host 校验并验证请求行为

公共请求处理入口已移除 `Host` 及请求 URL 主机名的允许列表判断。README 已说明服务监听与代理配置。

验证结果：

- `npm test`：66 项通过，覆盖未登记 Host、未登记 URL 主机名和既有数据范围规则。
- `npm run typecheck`、`npm run format:check`：通过。
- `npx playwright test tests/browser/api.spec.ts tests/browser/previews-api.spec.ts`：6 项通过。未登记 Host 的读取返回 200；同 Host 的非空刷新请求进入请求体校验并返回 400；项目范围和原型沙箱回归通过。
- `NODE_ENV=production npm run build`：默认 `.next` 生产构建通过，浏览器测试沿用 `.next-e2e`；验证后类型引用指向默认产物，没有临时构建目录。
- 源码检索确认不再存在请求 Host 或请求 URL 主机名的校验逻辑。
- 独立 subagent 只读评审覆盖完整差异、需求、验收和验证证据，确认各入口及数据范围，无待修复问题。

用户明确回复“合入吧”，确认验收并授权直接合入 main。长期请求约束同步到 `project-knowledge` Spec；当前交付未引入多用户管理。
