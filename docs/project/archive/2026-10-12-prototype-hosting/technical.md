# 本地托管方案

依据 [需求](./requirement.md) 和 [调查](./research.md)。复用现有 hosted 引用协议，新增 OpenFolio 上传适配器及本地静态服务；自建托管和 Git 兜底继续保留。

## 配置与 skill 引导

workflow 仍为 schemaVersion 1，增加两个可选项：

```json
{
  "schemaVersion": 1,
  "protectedBranches": ["main"],
  "openfolioUrl": "https://folio.example.com",
  "prototype": {
    "status": "enabled",
    "packagePath": "packages/prototype",
    "hosting": {
      "provider": "openfolio",
      "uploadUrl": "https://folio.example.com/api/prototype-uploads/UPLOAD_KEY"
    }
  }
}
```

- openfolioUrl 缺失表示尚未询问，null 表示用户没有自建实例，字符串为服务 HTTP/HTTPS 地址。它独立于托管方式保存。
- hosting.provider 为 openfolio、custom 或 git。OpenFolio 必须有服务地址及 uploadUrl；custom 可保存其上传地址，由项目适配器解释；git 不需要上传地址。未配置 hosting 的旧项目继续可读，在下次需要发布时询问，不擅自改变历史交付。
- setup 增加配置入口，原子保存经过共享 schema 校验的结果；保留不相关字段。接入、启用、停用操作保留已选服务及托管方式，停用仍不允许发布。
- skill 先复用会话与 workflow 的选择；缺失时依次询问自建 OpenFolio 地址、三选一托管方式及必要上传地址。无 OpenFolio 实例时选择 custom/git，或先补齐实例；不假设存在公共 OpenFolio 云服务。
- 按用户本次明确的分发模型，uploadUrl 可提交到项目仓库。它只在 workflow 保存，不复制到原型 artifact、截图地址、Change 说明或成功日志。

新建 hosted 原型包默认构建到 `<packagePath>/dist`；发布可通过 `--directory` 指定其他目录。资源引用采用相对路径，路由使用 hash/memory。新建 Git 兜底包沿用自包含 `preview/<id>/index.html`。已有工程的包管理器和构建命令不被重写。

## 上传地址与本地存储

管理员通过 `GET /api/prototype-hosting` 取得相对 uploadPath；调用方基于已配置的 OpenFolio 服务地址拼接完整链接。接口复用 requireAdmin、返回 private/no-store；skill 可指导管理员用已有登录会话调用，或在本地从环境变量注入管理密码完成获取。上传客户端不将管理 Cookie 转发给上传目标。

服务首次需要时生成随机上传密钥，私有保存到 `<dataDir>/prototype-upload-key`，后续重启复用。`POST /api/prototype-uploads/<key>` 仅校验此密钥，不使用项目 id 或邀请码。密钥错误时在读取上传内容前拒绝；写入完成前再次核对。上传地址只能访问上传接口，不能换取管理员会话。

存储为 `<dataDir>/prototype-artifacts/<version>/`，发布描述文件与 `files/` 分开。version 使用现有 requestId，绑定 repository、sourceCommit、digest 和入口声明。repository 是发布来源信息，不作为项目权限或服务配置前提。

先写私有临时目录，逐文件校验、核对摘要和入口存在，再以原子目录 rename 发布。同请求重试核对已有描述和内容，返回同一版本；拒绝不一致碰撞。并发同版本不会覆盖既有目录。未发布目录不由 HTTP 暴露，失败清理临时内容；崩溃残留可在后续安全清理。服务不自动删除历史版本。

## 上传与登记

抽出不依赖 Git、构建或进程执行的发布契约和摘要算法，供服务与客户端共用。保留现有 request/result 字段及摘要算法；服务器不解释客户端 artifactDirectory 为本机路径。

上传传输采用有边界的二进制流：协议标识、长度限定的 JSON 请求及文件清单，然后按声明顺序发送文件原始字节。JSON 上限 1 MiB；完整产物沿用 2000 文件、100 MiB。流式写入并检查实际长度、摘要、重复/冲突路径及入口，拒绝穿越路径和特殊文件；不解压 ZIP/TAR。请求有超时和并发上限，超限明确失败，不累积无界内存或队列。

服务响应原 requestId/sourceCommit/digest、version 及各入口的相对静态路径。内置客户端基于 workflow.openfolioUrl 生成绝对 HTTP/HTTPS URL，转为现有 published result 并验证；不从 Host 或代理头推断写入 Git 的服务地址。

`publish.mjs upload` 读取 workflow 的 openfolio 选择，使用现有 prepare 生成请求、流式上传并完成 register；支持当前清单和可选 Change 引用。上传前要求干净源码提交，构建目录需已存在；拒绝重定向，不自动提交引用。注册失败保留发布结果以便重试登记；网络或服务失败不更换 provider、不修改旧引用。自建模式继续 prepare → 项目上传适配器 → register；Git 模式继续显式 register --git-entry。

## 公开读取与来源配置移除

`GET/HEAD /prototype-assets/<version>/<path>` 公开读取已发布清单中的普通文件，不访问项目权限或邀请码。按 MIME 返回 HTML、JS、CSS、图片、字体等字节；未知格式作为下载文件。固定字节可公开缓存，路径不允许访问存储元数据、临时目录或其他服务文件。

响应提供 CORS `*` 和 nosniff。HTML 等可执行文档同时通过响应 CSP sandbox 与 iframe 的 allow-scripts 保持 opaque origin，禁止访问工作台 DOM、Cookie、表单提交和宿主导航。模块、动态 import 和静态资源正常加载；服务只提供静态资源，不赋予上传脚本任何服务端执行能力。

移除 prototypeOrigins 表单、模型及来源检查；旧配置中的该字段读取时忽略，下次保存时清除，修订版本仍按实际原文件计算。引用契约接受 HTTP/HTTPS，取消不同源要求，页面及截图不做域名、端口、来源白名单校验。外部 hosted 地址仍直接由浏览器访问，服务不增加远端抓取或代理。

不新增管理界面。设置页仅删除原型来源输入，用户已明确选择无需先绘制原型。

## 验证与交付前提

配置契约及 setup 测试覆盖三种 provider、无实例、历史字段兼容、重试保留选择。上传测试覆盖成功、重复/并发、错误密钥、半成品、非法路径、限额、写入失败和重启读取。浏览器验证匿名同源与跨源预览、HTTP/HTTPS 引用、多文件模块与图片、沙箱隔离；回归已有管理员、邀请码、Git 和 custom 流程。

实现前需完成技术/计划确认，并验收归档 visual-configuration，使管理权限与默认数据目录依赖成立。该依赖的测试、独立评审与生产预览已完成；此次不重复请求 main 合入授权。合并到本 Change 分支后再执行三项任务，最终进行独立评审。

单实例持久卷需备份 prototype-artifacts 和上传密钥。当前运行预览使用原 worktree 的 `.next`，此分支的实现与验证不覆盖该产物。

## 本项目的设计基线与 Git 外壳

原型包 DESIGN.md 以共享 UI token、业务壳层样式和现有界面为依据，记录规则及来源。skill 自带中立模板；setup 未指定已有设计规范时采用模板，指定规范时继续链接原文，不覆盖用户已有 DESIGN.md。模板不预置某种产品风格，指南要求提取已存在的事实、标明待定项。

移除当前包的三个测试 demo、对应产物和专用素材，保留一个 workspace-shell 入口。自包含 HTML 复现当前导航、项目上下文、来源栏和内容容器，业务内容留空；交互限于模块切换、侧栏折叠及入口反馈。桌面/平板/手机沿用现有断点和 token，不新增正式产品 UI。通过既有 Git 登记命令保存当前入口及本 Change 固定快照，workflow 保存 provider:git；无上传调用。运行中的生产预览产物不需重新构建。
