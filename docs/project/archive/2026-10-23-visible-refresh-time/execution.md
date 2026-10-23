# 执行与验证

## T1 顶栏直接展示刷新入口与当前内容更新时间

阅读页顶栏直接显示“上次更新”及快照时间，旁边保留独立刷新按钮。点击时间仍可查看来源、分支、提交与错误详情。窄屏收起日期、保留时分秒，Change 详情及原型聚焦页不再隐藏入口。读取中禁用刷新；失败时继续显示原快照时间。

沿用现有 `refresh()`、错误状态和 `capturedAt`，没有新增轮询、服务端接口或持久数据。

验证通过：

- `npm run typecheck`。
- `npm run build`。
- `npx prettier --check src/components/shell.tsx src/components/shell.module.css tests/browser/connected.ts tests/browser/workspace.spec.ts`。
- `npm run test:e2e -- tests/browser/workspace.spec.ts tests/browser/automatic-refresh.spec.ts tests/browser/prototypes.spec.ts`：20 项通过，覆盖桌面及 320px 窄屏顶栏、自动更新、手动刷新临时失败、恢复重试和原型阅读。
- 自查完整差异及桌面、手机原型总览和聚焦阅读页截图，刷新入口和更新时间可见，未发现横向溢出。

时间仍表示当前内容快照的成功采集时间；没有新快照的检查不会修改它。用户按技术澄清 Q1 选择直接实现，未绘制本次原型。
