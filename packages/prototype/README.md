# 原型构建与 R2 发布

当前清单维护七组 `quiet-*` 业务页面片段，依据见 [DESIGN.md](DESIGN.md)。包内 TSX 入口直接引用 `src/components`，使用内存 mock，不启动 Next、后端或应用路由。`npm run build --workspace prototype` 使用仓库已有的 React/Vite/CSS Modules 技术栈，按清单输出自包含 `dist/<id>/index.html`；构建清理旧 dist，但不会上传或改动清单，dist 不提交。不保留旧手写工作台、专属数据或兼容层。

## 七组业务片段

`quiet-home`、`quiet-specs`、`quiet-changes`、`quiet-prototypes`、`quiet-credentials`、`quiet-public`、`quiet-share` 分别对应我的仓库与侧栏、Specs 阅读、Changes 列表与详情、原型总览与画布、账号与 Token、匿名公开原型、Change 分享阅读。源码位于 `src/pages/<id>.tsx`，数据/请求/资源边界位于 `src/mocks`。构建替换只作用于原型，不改业务模块或导出。

所有仓库、人员和工程材料均为虚构。顶部评审栏切换该片段适用的场景与明暗主题。示例账号 `demo-lin` / `demo12345`，添加 Token 时输入 `demo` 或 `demo-work`；不要输入真实信息。交互、剪贴板、localStorage/sessionStorage 均在原型内存中模拟，刷新或切换场景重置。其他模块导航只提示另开入口；不再提供整应用 hash 路由或旧视觉方案开关。

截图沙箱不允许原生表单导航。启动层将提交按钮和输入框 Enter 转发为可取消的本地 submit 事件，保留浏览器字段校验与业务 onSubmit；请求仍经过内存 API，不增加 `allow-forms` 或放宽 CSP。

画布外层复用 `Prototypes`、`ChangePreviews`、`PublicPreviewView`，内部 `PrototypeFrame` 替换为包内虚构交互占位，不加载外部页面，以兼容现有截图 CSP 的 `frame-src 'none'`。分享入口组合 `PublicShell` 和 `ChangeReading`，不启动认证和分享解析。跨域嵌入、真实权限、后端和发布握手不是这些 mock 片段的验证范围。

验证：`npm run typecheck --workspace prototype`、`npm run build --workspace prototype`、`npm test --workspace prototype`、`npm run verify --workspace prototype`。浏览器检查使用仅授予 `allow-scripts` 的 iframe 与项目 CSP，覆盖七入口 × 两主题 × 1440/834/390/320px 及主要交互，截图输出到 Git 忽略的 `artifacts/prototype-fragments/`。静态访问可在仓库根目录运行 `python3 -m http.server 10684 --bind 127.0.0.1 --directory packages/prototype/dist`，打开 `/quiet-home/index.html` 等入口；无需 `.env`。

发布七组入口时直接使用干净的 `dist` 和 `publish-quiet-entries.json`，不要在 dist 内嵌套复制 release 目录。发布前提交源码；只有获得公开上传授权并验证成功后，才通过 SpecTrail 登记新固定引用。清单 artifact 的源码提交和摘要标识实际发布内容，不以本地构建代替线上证据。

获授权替换旧原型时，新版本验证成功后更新引用，不覆盖旧 immutable URL 的字节。旧架构数据不迁移、不备份；删除旧制品前核对已推送分支、标签及 Change，仍被未切换入口使用的对象不提前删除。Git 历史、归档正文和真实工作台数据不属于该清理范围。

## 首次配置

在 Cloudflare 控制台开通 R2，创建 Standard 桶，启用 Settings → Public Development URL。r2.dev 用于开发预览且有限流；正式使用可连接自有域名。不要给历史版本设置自动删除规则。

创建只授权该桶的 Object Read & Write S3 API 凭据。按[根目录环境变量模板](../../.env.example)在发布机器的仓库根目录 `.env` 中填写五项 `R2_*` 配置；首次配置可复制模板，已有 `.env` 时补充对应项，文件权限设为 600。凭据只在发布机器使用，不放聊天、Git 或 workflow。

发布 CLI 依据脚本位置自动定位仓库根目录，使用与开发服务相同的 `@next/env` 加载方式，无需 `--env-file`。进程环境变量优先于 `.env.local` 和 `.env`，也支持 Next.js 对应环境的文件；默认按 production 加载。以当前工作目录解析 request/result 路径。

本适配器使用默认 jurisdiction 的账户 endpoint。公开地址填桶的 r2.dev 或已绑定域名，不填 S3 API 地址。Standard 有免费额度，超额按 [R2 定价](https://developers.cloudflare.com/r2/pricing/) 计费；[公开访问](https://developers.cloudflare.com/r2/buckets/public-buckets/)与[凭据设置](https://developers.cloudflare.com/r2/api/tokens/)见官方文档。

## 发布

在仓库根目录运行。先提交源码和构建脚本，保持工作区干净；协议文件放仓库外。以下 `your-change-id` 替换为本次发布所属的活动 Change。

```bash
npm ci
npm run build --workspace prototype
# 对本次发布的每个页面执行截图；示例替换为实际入口。
npm run screenshot --workspace prototype -- --entry dist/quiet-home/index.html
node .agents/skills/spec-trail/cli.mjs prototype prepare \
  --directory packages/prototype/dist \
  --entries packages/prototype/publish-quiet-entries.json \
  --repository https://github.com/iTgo-lyq/open-folio \
  --out /tmp/open-folio-r2-request.json
node packages/prototype/publish-r2.mjs \
  --request /tmp/open-folio-r2-request.json --result /tmp/open-folio-r2-result.json
```

上传以 requestId 为固定目录，条件创建对象，重试比对已存在内容，拒绝覆盖。全部文件通过公开访问和字节校验后才返回成功；失败结果不能登记。这里不创建桶、不管理账号、不运行服务器。

上传成功后，再执行以下登记；失败时保留已有配置和引用，原请求可重试：

```bash
node .agents/skills/spec-trail/cli.mjs prototype configure --hosting custom
node .agents/skills/spec-trail/cli.mjs prototype register \
  --request /tmp/open-folio-r2-request.json --result /tmp/open-folio-r2-result.json \
  --change your-change-id
node .agents/skills/spec-trail/cli.mjs prototype validate --browser
```

固定引用包含源码提交、内容摘要和公开 URL。登记后验证各设备交互，再提交清单、workflow 与新 Change；引用推送至配置的协作分支后更新项目总览。上传失败不切换 Git 兜底，也不覆盖历史引用。

## 截图

本项目发布页面原型必须提供声明设备的卡片截图。构建后、prepare 前对本次发布的每个页面运行（示例替换为实际入口，并按 devices 选择设备）：

```bash
npm run screenshot --workspace prototype -- --entry dist/quiet-home/index.html
npm run screenshot --workspace prototype -- --entry dist/quiet-home/index.html --device mobile
npm run screenshot --workspace prototype -- --entry dist/quiet-home/index.html --viewport 320x720 --out /tmp/open-folio-screenshots
```

默认在入口旁生成 `pc-web.png`、`ipad.png`、`mobile.png`，对应 1440×900、834×1194、390×844，尺寸复用产品定义。`--device` 可重复指定；`--viewport WIDTHxHEIGHT` 生成 `custom.png`，每边范围 1–4096，与 `--device` 二选一。`--out` 可指定输出目录；路径按当前工作目录解析，npm workspace 命令的工作目录是本包。

截图使用 Playwright Chromium、OS 沙箱和仅授予 `allow-scripts` 的不透明 iframe，入口须为自包含 HTML，复用既有 HTML 校验与 CSP。页面错误或资源加载失败时明确失败，不降级为无沙箱运行。可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定已安装的 Chromium；直接调用截图脚本时通过环境或 Node `--env-file` 注入。

适配器按 entryPath 所在目录查找标准命名图片，与入口一起发布并登记，不依赖入口 id 与目录名相同。以 dist 为产物目录时，入口可为 quiet-home/index.html，图片为 quiet-home/pc-web.png；仅发布单页面目录时，入口为 index.html，图片为 pc-web.png。自定义截图供本地验证，不自动登记为标准设备缩略图。截图脚本负责渲染与导出，具体交互由当次任务的 Agent 验证。当前单 HTML 已内联资源；后续改为 ESM 或外部字体时，需要为桶配置允许无 Cookie 跨域读取的 CORS。

## 发布验收

页面可打开、原型交互通过或上传成功，不代表卡片截图交付完成。负责发布的 Agent 必须完成以下检查并将结果写入本次 Change 的验证证据：

1. 核对发布 result、当前清单与本次 Change previews 中的 thumbnails，覆盖本次页面声明的每种设备；图片属于对应入口的固定版本，URL 可公开读取。
2. 将引用推送至协作分支后，在真实工作台刷新项目，进入原型总览，逐项切换桌面、iPad、手机筛选，确认本次页面的卡片图片加载成功（浏览器检查 img.complete 且 naturalWidth > 0），没有缺图或加载失败占位。
3. 从卡片进入原型页面并验证交互；保留卡片截图或等效浏览器断言证据。未通过时记录失败并修复，不能仅以本地 artifacts 截图代替发布验收。真实登录使用项目的测试会话清理约定，结束后核验退出结果。

本地 Agent 可从本机配置发布。向远端交接时只传 request/result 的非敏感内容；request 的 artifactDirectory 是发布机器本地路径，远端登记前需指向内容摘要完全相同的构建目录。不要传 S3 凭据。

## Changes 动态视图预览

`quiet-changes` 直接复用当前业务的个人视图管理、筛选/显示、协作者列表与详情阅读。初始“我的”包含虚构创建者的进行中 Change，其中有等待确认、受阻和暂缓示例；已完成、已归档、已取消可从状态页签查看。进入“管理视图”编辑名称或条件，“完成编辑”后仍需在管理面板“确认”；“取消”丢弃草稿。所有配置仅在内存中。

聚焦验证：构建后运行 `npm run verify --workspace prototype -- --entry quiet-changes`；只复测交互可加 `--interactions-only`。浏览器由脚本独立启动和关闭，不连接用户 Chrome 或真实账号。只发布此入口时，用 `dist/quiet-changes` 作为产物目录，入口清单为 `[{"id":"quiet-changes","entryPath":"index.html"}]`，保留其他六组已有固定引用。
