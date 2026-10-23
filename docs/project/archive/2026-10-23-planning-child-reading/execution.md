# 验证记录

## T1

关系索引将 xlarge 在 requirement、technical 阶段尚无集中记录的子项标为待创建，不产生缺失或反向声明诊断，流程满足性仍为 unknown。关系行显示中性“待创建”，子项不提供跳转；已存在但状态、来源、parent 异常的目标及 execution、close 阶段缺失子项仍保持诊断。更新扫描指纹，使旧索引在刷新时按新规则重建。

- `npm test`：316 项通过，覆盖规划与执行、关闭阶段边界，保留无效目标、自指、前置和父项诊断，并覆盖既有缓存重建规则。
- `npm run test:e2e -- tests/browser/changes.spec.ts tests/browser/change-reader.spec.ts tests/browser/previews.spec.ts tests/browser/change-sharing.spec.ts`：27 项通过。真实仓库夹具中的规划父项未进入异常列表，待创建子项不可跳转且显示“待创建”，结束数为 0 / 2；需求、技术文档正常读取，原型 iframe 加载且按钮可交互，既有材料与分享流程通过。
- `npm run typecheck`、`npm run build`：通过。
- 变更文件 Prettier 检查及 `git diff --check`：通过。

Agent 自查覆盖完整差异与需求验收条件；未发现待处理问题。数据格式、用户登录、凭据及持久数据目录无需迁移或重置。
