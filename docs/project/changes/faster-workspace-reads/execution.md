# 实施与验证证据

## T1

普通缓存读取由 12 次 GitHub API 与两次 Git 探测，精简为一次仓库解析和一次内容权限检查；不增加授权结果缓存。读取结束检查本地设备会话；刷新及原型发布通过显式回调重新确认远端权限。仓库列表删除串行首轮和整页二次复查，以已有 8 并发上限完成一轮检查，并保持条目顺序与不可用条目计数。发现进度与恢复已有记录只读取当前工作台的本地状态。

验证证据：

- `npm test`：144 项通过，包含授权失败、工作台隔离、撤销设备、Git 刷新失败及并发目录检查。
- `npm run typecheck`：主应用及 UI 包通过。
- `npm run test:e2e -- tests/browser/api.spec.ts tests/browser/personal.spec.ts tests/browser/token-workspaces.spec.ts tests/browser/specs.spec.ts tests/browser/credentials.spec.ts`：29 项浏览器测试通过，覆盖真实 UI 的登录、读取、失权、跨设备与窄屏流程。
- 修改文件 Prettier 检查及 `git diff --check` 通过。
- 权限策略测试明确覆盖：本次读取开始后发生的远端撤权由下一次请求识别；本地设备撤销仍阻止在途交付；Git 通道失败不额外阻止通过 API 授权的缓存读取，但会使实际 Git 刷新失败并保留原快照。
