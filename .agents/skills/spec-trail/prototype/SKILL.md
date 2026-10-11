---
name: spec-trail-prototype
description: SpecTrail 原型协作：选择 OpenFolio 或自建托管、Git 兜底，维护项目当前入口与 Change 固定版本引用。
---

# SpecTrail Prototype

每项目一个原型包，默认 `packages/prototype`。项目维护源码、mock 和构建，静态产物交给所选服务或 Git。UI 组件库的独立预览不自动进入项目原型清单。

## 接入与设计

读取 AGENTS、设计规范、现有组件及 `workflow.json.prototype`，基线为已推送 main。未选择时按需询问；disabled 不重复建议；pending 修复接入；enabled 复用已有包。

原型已启用时，按 UI 影响范围处理，不以 Change 规模代替判断：

- 小型变化：先询问是否绘制原型；可先推进无关工作，较长时间未回复时说明后跳过。
- 大范围变化：实现前必须先绘制或更新原型，并提供预览。

```bash
node .agents/skills/spec-trail/prototype/scripts/setup.mjs --accept --package packages/prototype
node .agents/skills/spec-trail/prototype/scripts/setup.mjs --decline
```

接入决定沿用会话授权，历史由 Git 保存。需要发布时先读 workflow：未记录 openfolioUrl 时，询问是否有自建 OpenFolio，保存服务地址或 null；未记录 prototype.hosting 时，询问选择 OpenFolio、其他自建托管或 Git 兜底。已有选择直接复用，不因一次发布失败换方案。

OpenFolio 选择保存管理员提供的 uploadUrl；持有地址即可上传，可提交到仓库供成员使用。custom 可记录上传地址，使用项目适配器；git 不填上传地址。无自建 OpenFolio 时先选 custom/git，或补齐实例地址。保存选择：

```bash
node .agents/skills/spec-trail/prototype/scripts/setup.mjs --configure --openfolio-url https://folio.example.com --hosting openfolio --upload-url "$OPENFOLIO_UPLOAD_URL"
# 无实例使用 --openfolio-url none；其他方式用 --hosting custom 或 --hosting git。
```

首次初始化可将这些参数与 --accept 一起使用。新 hosted 包默认输出 dist，Git 输出 preview/id/index.html；已有工程保留原构建命令，发布时显式指定产物目录。

setup 不安装框架，不覆盖已有文件；采用现有工程时提供 package.json、AGENTS、DESIGN 和合法 prototype.json，再运行 --enable。保留原包管理器，原型包 private:true。源码可用 HTML、React 及项目 UI 包，宿主保证正常 build 与浏览器交互，局部状态和 mock 不依赖真实业务服务或持久存储。

## 当前清单

`<packagePath>/prototype.json` 是 main 总览唯一清单，Git 保存源码及描述，dist 默认忽略。格式由 [共享契约](./scripts/contract.mjs) 校验：

```json
{
  "schemaVersion": 1,
  "entries": [
    {"id":"orders","title":"订单列表","description":"包含筛选与空态","sourcePath":"packages/prototype/src/orders.tsx","kind":"page","devices":["pc-web","mobile"]}
  ]
}
```

id 稳定且项目内唯一；名称可改。component 在 devices 和 1–4096 CSS px 的 viewport 中二选一。artifact 缺失表示未交付。删除 main 清单项即从总览移除，不清除旧发布或 Change 历史；源码或主题变化不强制重发所有参考原型。

## 宿主发布

先提交源码，以干净提交运行项目正常构建；自建适配器的存储凭据由宿主环境注入。准备协议请求：

```bash
# entries.json 是 [{"id":"orders","entryPath":"index.html","hash":"#/orders"}]
node .agents/skills/spec-trail/prototype/scripts/publish.mjs prepare --directory packages/prototype/dist --entries /tmp/entries.json --repository https://example.org/team/project.git --out /tmp/request.json
# 宿主自己的发布程序读取 request.json，上传到自己的静态托管并生成 result.json。
node .agents/skills/spec-trail/prototype/scripts/publish.mjs register --request /tmp/request.json --result /tmp/result.json --change change-id
```

请求包含 schemaVersion、repository、sourceCommit、artifactDirectory、digest、entries、requestId。requestId 基于内容和入口确定；实现见 [publishing.mjs](./scripts/publishing.mjs)，[文件系统宿主示例](./examples/filesystem-host.mjs) 可用于 CI 挂载的静态存储和测试，不是 OpenFolio 托管服务。

成功结果包含 schemaVersion:1、status:published、原 requestId/sourceCommit/digest、固定 version 及 entries；每项是 id/url，可提供 thumbnails 数组（device/url；固定 PNG/WebP）。失败返回 status:failed、requestId、code、message、retryable。宿主先完整上传再原子发布，重复请求返回同版本，绝不覆盖旧版本字节；失败不替换引用，也不自动提交 dist。

登记命令校验结果后一起更新当前 artifact 与可选 Change previews；无 --change 可只更新当前清单。多文件更新中断后运行 `publish.mjs recover`，遇到新用户编辑停止恢复，不覆盖。若进程异常退出遗留 Git common-dir 下的 `spec-trail-state.lock`，命令不会抢占锁：先读取其中的 owner.json（PID、主机、工作区、开始时间），核实对应主机上的进程已结束、仓库无其他状态操作并检查工作区及事务日志，再清理已确认失效的锁目录，重新运行 recover。没有 owner.json 的共享锁也必须先核实持锁进程；无法确认时保留锁与日志。不要删除事务日志来绕过恢复。随后提交推送；引用进入 main 才更新总览。Change 保留自己的显示信息、视口、固定地址和构建源码 commit，不跟随当前清单变化。预览引用使用无凭据、无 query 的 HTTP/HTTPS，可用 hash 路由；上传地址只保存在 workflow，不放进预览引用或成功日志。

宿主负责保留被历史引用的版本。Git 标签仅保留记录和源码，不能代替外部存储的保留承诺。

## 嵌入与验证

原型使用 HTTP/HTTPS，无来源白名单或不同源要求。iframe 保留 `sandbox="allow-scripts"`，不授予 allow-same-origin。ESM、动态模块和字体等静态资源需允许无 Cookie 的 CORS（如 Access-Control-Allow-Origin:*），资源用相对路径，路由用 hash/memory。宿主允许嵌入并配置 CSP；OpenFolio 不代理第三方登录、下载或转发凭据。

宿主可使用 [就绪桥接](./scripts/bridge.mjs) 回复工作台的 ready/error 握手。未确认就绪时工作台显示未确认，iframe load 不等于应用成功。

```bash
node .agents/skills/spec-trail/prototype/scripts/validate.mjs
node .agents/skills/spec-trail/prototype/scripts/validate.mjs --browser
```

浏览器检查使用宿主安装的 Playwright；可用 --playwright 指向已有模块。静态检查不代替浏览器检查，初始加载也不代替关键交互及各声明视口验证。宿主可按视口提供截图引用，缺失时总览使用占位；不要求 OpenFolio 服务联网截图。

## Git 兜底

显式采用 Git 兜底时，宿主生成 `<packagePath>/preview/<id>/index.html` 自包含 UTF-8 HTML，脚本/CSS/mock 内联，图片字体用 data URL；不允许外链资源、存储或真实业务请求。普通 Vite dist 不是单文件兜底，框架内联构建由宿主维护。

```bash
node .agents/skills/spec-trail/prototype/scripts/publish.mjs register --git-entry orders --change change-id
```

该操作记录源码 commit，当前产物留在包内，并复制一份到 Change 的 previews/id；后续更新当前产物不覆盖旧 Change。归档操作移动快照并更新 artifact.path。不要因为构建一个入口就清空其他入口。

## 归档

主 skill 完成验证、人工验收与 Specs 同步后提交归档。非空 previews 继续需要保留标签：

```bash
node .agents/skills/spec-trail/prototype/scripts/archive.mjs --change change-id --push
```

分支与 `spec-trail/archive-v2/<id>` 标签均核实后才报告完成。相同提交可重试，不覆盖同名异提交标签。缺少标签或远端产物时明确说明，不回退其他版本。


## 一次性旧存档迁移

运行时只接受 artifact 引用，旧 previews.path 格式不再兼容。用户明确要求迁移旧存档后，在非守护分支运行：

```bash
node .agents/skills/spec-trail/prototype/scripts/migrate.mjs --change old-change
# 原标签不存在时须提供原交付的完整 --revision。
# 核对迁移字节与来源，提交推送后：
node .agents/skills/spec-trail/prototype/scripts/archive.mjs --change old-change --push
```

迁移只从确定的原交付提交读取 HTML，复制到 Change 的 previews/id 并更新引用；保留其他历史事实，拒绝覆盖不同字节和之后已修改的关联。同参数可重试；中断后用 publish.mjs recover 恢复事务。源码提交采用所迁移的原交付提交，可由该提交核对当时源码及产物。

新保留标签统一为 spec-trail/archive-v2/id，旧标签和 Git 历史不改写；迁移后分享新提交链接，旧格式固定链接不再预览。服务 pin 按新命名空间隔离，并保留旧缓存 pin；新标签一经观察同样禁止替换。
