# 协作者原型验证

本轮由 `gpt-6-astra` subagent 绘制现有 `quiet-changes` 原型。成员最多显示三个头像，其余用 `+N` 收拢，点击头像组查看完整可滚动名单；创建者固定第一。独立创建者列默认隐藏，可在显示菜单恢复，并随个人视图保存。原型保留原有筛选语义。

## 本地验证

- `npm run build --workspace prototype` 成功。
- Astra 复用常驻 Chrome CDP 验证浅色/深色 × 1440、834、390、320px：12 人名单、创建者首位、默认隐藏创建者列、列开关及横向溢出检查均通过。
- `node packages/prototype/verify-deferred-requirement.mjs` 的八组暂缓需求回归通过，无页面错误。
- `npm run screenshot --workspace prototype -- --entry dist/quiet-changes/index.html` 成功生成桌面、iPad、手机标准截图；该命令为受限 iframe 截图使用独立浏览器。
- 本地交互截图位于 Git 忽略的 `artifacts/change-collaborators/`。

## 发布验收

固定版本已上传 R2 并登记到当前清单与本 Change 的 previews；源码提交为 `2889d65`，产物与三种标准截图均通过适配器的公开字节校验。

引用推送后，使用 `withSmokeSession` 在真实工作台刷新仓库，核对目录中的版本及 thumbnails 与发布结果一致；逐一切换 PC Web、iPad、手机，卡片图片均为 `complete=true` 且 `naturalWidth` 分别为 1440、834、390。卡片截图保存在 `artifacts/change-collaborators/gallery-*.png`。

从卡片进入托管原型，以真实鼠标点击 12 人头像组，验证完整名单与创建者首位，通过；截图为 `artifacts/change-collaborators/hosted-preview.png`。初次普通 locator 点击遭遇仓库已记录的 Playwright 1.63 缩放 iframe 坐标问题，按既有 `iframe-click-regression` 回归方法换算可视位置，核对内外层命中及可信鼠标事件后通过，未使用强制点击或 DOM click。

真实浏览器使用独立上下文隔离测试 Cookie，复用常驻 Chrome 服务。测试结束后包装器验证退出及匿名、无可见绑定，通过；账号绑定保留。正式服务实现未变，本轮仅刷新远端原型清单，无需重建服务。

这是需求讨论用原型，正式业务尚未实施，等待用户审阅。
