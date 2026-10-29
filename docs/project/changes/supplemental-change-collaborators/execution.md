# 实施与验证

## T1 补充协作者配置

新增可选 `collaborators` 成员数组，创建命令接受 `--collaborators`，活动记录使用 `collaborators --members` 更新。共享校验约束显示名及可选 GitHub 身份，拒绝未知字段、邮箱字段和非法值；空数组清除配置，其他流程状态保持原样。

索引仅从正式材料来源读取补充名单。先保留完整的 Git 自动名单和排序，再将配置成员去重追加；配置中的别名不会折叠或重排已存在的历史成员。非法配置沿用其他可选展示字段的诊断方式，保留 Git 成员、有效完成状态及依赖。分享复用合并投影，扫描指纹升级使既有缓存重新索引。

Agent 已对照 Requirement 自查整个实现差异，重点核对补充而非覆盖、创建者优先、相同身份保留历史显示信息、身份冲突、正式来源及清空配置。既有页面交互保持适用，无需新增原型。

验证结果：

- `node --conditions=react-server --test tests/change-creation-order.test.ts tests/changes.test.ts tests/state-commands.test.ts`：47 项通过，涵盖成员合并、正式分支与分享投影、无效可选配置、CLI 创建/更新/清空及归档/取消只读约束。
- 最终调整为先固定 Git 名单后，重新运行 `tests/change-creation-order.test.ts`：8 项通过，含配置别名不能折叠既有历史成员的回归。
- `node --conditions=react-server --test tests/incremental-cache.test.ts tests/store.test.ts`：11 项通过，覆盖扫描规则更新、缓存重建和读取持久性。
- `npm run typecheck`、最终 `npm run build`、改动文件的 Prettier 检查与 `git diff --check` 全部通过。
- 最终生产构建在独立临时数据目录、回环端口 11118 启动，首页、匿名会话 API 和分享入口均返回 200；会话为匿名且无绑定。检查完成后关闭本次进程并清理临时数据。

常驻服务更新需在 PR 获准合入 `develop` 后执行，当前验证未占用或修改常驻数据目录。
