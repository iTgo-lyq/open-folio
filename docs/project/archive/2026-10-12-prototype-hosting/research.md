# 调查依据

调查日期：2026-10-10。基线 `origin/main` 为 `02c34e7`；配置与权限交付为 `codex/visual-configuration` 的 `c057ef6`，规则交付为 `codex/prototype-ui-rules` 的 `8a14dc8`。

## 已确认

- `prototype/scripts/publishing.mjs` 已提供 prepare/register、SHA-256 摘要、请求身份和不可变结果协议。产物上限为 2000 文件、100 MiB；源码和引用由 Git 管理，普通 dist 忽略。当前没有 HTTP 上传客户端或服务器。
- `prototype/scripts/setup.mjs` 现只保存 status/packagePath，重新接入时会重建该对象；新增托管选择必须在这些操作中保留。共享状态校验与服务端 workflow schema 都会拒绝未知字段，需一起扩展。
- `src/server/previews.ts` 用 prototypeOrigins 限制页面和截图来源；`src/components/previews.tsx` 另拒绝同源 hosted 页面。`contract.mjs` 对 hosted 地址限定 HTTPS。这些均需按用户最新要求移除或放宽为 HTTP/HTTPS。
- `visual-configuration` 已实现默认数据目录、管理员登录 Cookie、配置文件读写及邀请码访问。上传地址的管理入口可复用 requireAdmin；静态读取和凭地址上传按本次需求独立于项目权限。
- 读取当前安装 Next.js 的 `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`：Route Handler 支持 Web Request/Response、流式请求体和 GET/POST/HEAD，动态文件读取不会成为构建期静态输出。

## 浏览器可行性实验

在临时内存 HTTP 服务中，用已安装 Playwright Chromium（启用 OS 沙箱）验证同源 `sandbox="allow-scripts"` iframe、响应头 CSP sandbox、静态 CORS `*`、ES module 及动态 import。模块正常加载，子页面访问 parent.document 被拒绝；受 CSP 限制的管理接口请求未到达服务器。模块请求的 Origin 为 null，不携带登录 Cookie。

实验支持内置多文件静态托管继续使用 opaque-origin 沙箱，无需 allow-same-origin 或额外静态域名。它只验证浏览器机制，未验证尚未实现的上传或落盘服务；后续需真实接口和浏览器回归。

## 已有用户选择

- 公开读取静态资源；专用上传地址由管理员取得，持有者可上传；可持久化到仓库。
- 删除来源配置及来源校验。
- 删除设置字段直接实现，不先绘制原型。
