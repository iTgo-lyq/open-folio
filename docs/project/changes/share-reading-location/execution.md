# 执行证据

## T1 保存并恢复分享时的材料与阅读位置

分享弹层按公开阅读白名单提取当前材料、文档、章节、原型及合入文件位置，与目标一起写入不可变映射；同一目标和定位参数复用标识，切换位置不覆盖先前短链。可选 location 保留旧映射的解析与旧标识生成。公开页面从保存位置初始化，后续材料选择清除旧文档和章节，章节或设备调整保留所属材料。不同短标识分别建立阅读上下文，避免相同 Change 的不同位置互相串用。Agent 默认读取保存的文本材料，显式 document 仍经过同 Change 范围检查。

验证结果：

- `npm run typecheck`、修改文件的 Prettier 检查与 `git diff --check` 通过；`npm run build` 生产构建通过。
- `node --conditions=react-server --test tests/share-location.test.ts tests/shares.test.ts tests/share-cli.test.ts`：29 项通过。覆盖身份和私有列表参数排除、保存位置与显式导航覆盖、同定位参数复用、不同位置独立、重新创建存储实例后仍可解析、执行记录和额外文档默认单篇、Agent 显式文档与越界拒绝、原型位置、旧短链及离线 CLI 兼容。非法位置长度返回 400。
- `npm run test:e2e -- tests/browser/change-sharing.spec.ts tests/browser/change-reader.spec.ts --grep-invert 'adjacent Changes'`：11 项通过。新增场景验证材料及章节恢复、短地址无长查询串、刷新和前进返回、执行记录缺失时保留对应缺失页、额外材料及旧短链不被覆盖；章节恢复通过观察原生 scrollIntoView 目标验证，避免将短文档无可滚动距离误判成定位失败。原有看板相邻导航测试的基线失败已在前序 Change 记录，本次未计入通过。
- 真实生产构建冒烟复用持久数据和配套配置，在停止常驻服务后启动单独测试实例。使用 `withSmokeSession` 管理专用账号，通过常驻 Chrome CDP 连接的隔离上下文验证：从真实 execution.md 准备短链，无查询地址直接显示「执行证据」正文，Agent 默认返回 execution.md，手机无横向溢出，空间名导航仍可用。包装器退出并复查匿名成功；重启测试实例后同一短链仍可读取。测试结束已停止实例并恢复原常驻服务，未修改或重置用户凭据。
- Agent 自查全部差异：只保存公开阅读字段，不保存私有连接或快照；来源、权限与单个 Change 范围检查保持原路径，没有未解决的本次实现问题。

常驻服务的正式更新待本修复合入 develop 后执行；临时冒烟脚本和日志位于 /tmp，不作为正式工程脚本保存。
