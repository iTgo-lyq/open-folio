# 调查依据

## 本地实现，2026-10-12

- src/server/personal-sessions.ts：现有 Session 包含多个 Connection，Cookie 仅保存摘要；新增或替换连接轮换整个 Session Cookie。加密 AAD 绑定旧 sessionId、connectionId、revision；退出和过期删除会话内密文。新设计必须拆开凭据与设备生命周期，并重新加密迁移。
- src/server/repositories.ts、src/server/discovery.ts：私有缓存与发现路径含 sessionId、connectionId 和 revision，因此同 token 在新会话中不会命中旧缓存。需要改成凭据工作台归属，保留远端校验与交付复验。
- src/server/providers/types.ts 与 GitHubProvider：公共身份已含 providerId、instanceId、subjectId；Git 用户名目前使用 GitHub 返回的 login。新核心身份可以由平台实例及 token 定义，不依赖 GitHub 登录系统，但表单用户名需通过适配器规范化与校验。
- packages/prototype：已启用 custom R2、自包含 HTML、示例数据、固定版本引用和三个设备截图。可增加 token-workspaces 流程入口，保留既有个人工作台历史引用。
- node_modules/next/dist/docs/01-app/02-guides/authentication.md：安装包指引区分认证、会话与授权，Route Handlers 仍须在服务器验证授权；本方案沿用现有 Route Handler 边界。未改正式产品代码。

## 一手资料

2026-10-12 阅读 [GitHub PAT 文档](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)：Git HTTPS 要求用户名，但 PAT 决定身份。此事实支持把 GitHub 登录输入的用户名视为展示／校验字段，不能按它合并不同 token。

同日阅读 [GitLab PAT 文档](https://docs.gitlab.com/user/profile/personal_access_tokens/)：Git HTTPS 的用户名可以是任意非空值。由此推断用户名规则应由各平台适配器处理；本 Change 不据此新增 GitLab 支持。

## 验证边界

旧能力已有 personal-workbench 的测试证据，本 Change 需要重新验证跨设备、指纹匹配、设备撤销、复制接口与迁移。文档依据只能证明平台鉴权语义，不代替新实现或真实部署验收。

## 交互原型验证，2026-10-12

`npm run build --workspace prototype` 导出自包含入口，HTML 静态安全检查通过。使用 Playwright Chromium 并开启 OS 沙箱验证登录／恢复、不同 token 隔离、无效切换保留原凭据、复制与手动复制回退、单设备与全部设备退出、旧连接选择；检查 1440×900、834×1194、390×844、320×844 下六个评审场景及当前凭据页无横向溢出，沙箱 iframe 中复制回退可用，无浏览器运行错误。

三个声明设备及 320px 窄屏已截取凭据页。以上是内存示例流程的验证，不表示服务端多设备共享、会话撤销或迁移已经实现。
