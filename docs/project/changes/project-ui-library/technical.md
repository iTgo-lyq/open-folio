# 方案导读

依据 [Requirement](./requirement.md) 与 [Research](./research.md)，推荐维护两条独立路径：UI 包通过自己的预览站查看共享组件；被管理项目自行构建、托管原型，OpenFolio 读取 Git 中的当前清单与 Change 固定引用。

这是技术方案草案。现有实现、依赖约束及浏览器隔离实验已有证据；真实个人素材接入方式尚未确认，完整工程构建和宿主协议端到端验证留在实施验收。这里定义的新字段、脚本能力和行为均为拟议交付，不代表已经实现。

## UI 包及独立预览

新增私有 workspace 包 `@open-folio/ui`，位于 `packages/ui`。公共入口导出 React 组件和类型，单独提供样式入口；预览入口和示例数据不在组件公共导出中。

首批从主应用抽取 `Button`、`IconButton`、`Badge`、`EmptyState`。组件接收标准 DOM 属性、内容、展示变体及事件；IconButton 要求可访问名称，按钮处理 disabled/loading 状态。Badge 只表达中性、信息、成功、警告等展示语义；Change 阶段与任务状态映射继续留在业务调用方。EmptyState 接收标题、描述、图标及可选操作，不读取项目数据。

组件样式使用带包前缀的类名，公共颜色、间距与字体 token 由 UI 包唯一维护；主应用既有变量可以作为过渡别名指向这些 token。应用布局、业务状态映射和全局 reset 不迁入包。两端在各自入口导入公共样式，验证主应用全局规则不会覆盖组件的禁用、焦点和布局状态。

包内 React 作为 peer dependency，版本范围与根工程实际版本一致，避免第二份 React。仓库消费 TypeScript 源码，由 Next 和独立预览各自编译；不增加 npm 发布或预编译组件包流程。交互实现保留正确的客户端边界，不把整个主应用变成客户端组件。

独立预览采用 Vite `8.3.4`、`@vitejs/plugin-react` `6.1.2`，固定版本及锁文件。开发服务默认 `127.0.0.1:10683`，占用时明确失败，不改变主应用的端口。提供根命令 `ui:dev`、`ui:build`、`ui:preview`，包自身提供相应 dev/build/preview/typecheck；预览产物位于包内 `dist` 并忽略 Git。UI 包及预览使用自己的 TypeScript 配置，主应用的类型检查排除独立预览配置和生成文件，同时通过包导入检查共享类型。

预览以组件名称导航，展示默认、禁用、加载、不同内容长度及实际交互。使用内存示例数据，不启动 Git 采集服务；预览中的组件从包公共入口导入。首批组件逐项替换主应用中对应的真实使用点，保留业务行为和现有视觉基线。

## 项目原型目录与身份

继续使用 `workflow.json.prototype.packagePath` 指向项目唯一原型包。原型包约定：

```text
packages/prototype/
  prototype.json       当前入口清单，随 Git 保存
  src/                 宿主维护的源码，内部组织自由
  dist/                普通构建产物，默认不入 Git
  preview/<id>/        显式选择 Git 兜底时的当前单 HTML
```

宿主可以采用现有构建目录，但必须在自己的发布请求中给出实际目录，不强制迁移 React 工程结构。描述文件固定为 `<packagePath>/prototype.json`，不提供多个候选路径扫描。

描述格式为 `{ schemaVersion: 1, entries: [...] }`。入口字段：

| 字段 | 约定 |
| --- | --- |
| `id` | 项目内唯一、稳定的 kebab-case；改名不改 id，删除后不自动回收旧 id 给无关页面 |
| `title`、`description?` | 展示名称与简短场景说明；用于查找，不要求展示源码路径 |
| `kind` | `page` 或 `component`，兼容已有组件原型 |
| `devices` / `viewport` | 沿用现有设备与视口约束；页面声明 devices，组件二选一 |
| `sourcePath` | 仓库相对源码入口，仅供溯源；必须位于原型包内，禁止穿越及符号链接 |
| `artifact?` | 最近成功登记的产物引用；省略表示尚未交付，不从 Change 自动补全 |

新产物采用显式联合类型：

```ts
type Thumbnail = {
  device?: "pc-web" | "ipad" | "mobile";
  url: string;
};

type Artifact =
  | {
      type: "hosted";
      version: string;
      url: string;
      sourceCommit: string;
      digest: string; // sha256:<64 位十六进制>，对应发布静态目录
      thumbnails?: Thumbnail[];
    }
  | {
      type: "git";
      path: string; // 仓库相对入口目录，包含自包含 index.html
      sourceCommit: string;
    };
```

`sourceCommit` 为真实完整 Git commit，表示构建所用源码，而非随后记录发布引用的提交。先提交源码，基于干净的源码提交构建，再提交引用；校验源码提交属于当前仓库且是记录提交的祖先，不要求把引用提交自身的 hash 写回自身。`sourcePath` 要在所声明源码提交中存在。

托管 URL 必须是无用户名、密码及 query 的 HTTPS URL，可用 hash 表达前端路由；不保存短期签名地址。版本、URL 和 digest 组合保持不变。缩略图为同一发布版本的 PNG/WebP 静态地址；页面按声明设备关联，组件只有一个视口时省略 device。

Change 新 `previews` 记录入口 id、标题、类型、视口和 `artifact`，保存交付时的显示信息与源码提交，不通过当前清单反查历史。当前清单与 Change 可以引用完全相同的托管产物。旧 `{ id, title, path, kind, devices/viewport }` 仍按旧协议解析，不把 path 自动解释为 URL。

## 宿主发布与登记协议

协议为宿主侧 CLI/CI 可实现的 JSON 输入输出约定。OpenFolio 服务不执行第三方仓库命令，不接收文件；宿主 Agent 或 CI 调用自己的发布程序。发布程序由宿主工程指引明确，不从远端描述文件自动执行任意 command。

一次请求可以包含同一构建目录内的多个入口，避免逐页面重复上传：

```ts
type PublishRequest = {
  schemaVersion: 1;
  repository: string; // 无凭据的仓库身份
  sourceCommit: string;
  artifactDirectory: string; // 只供本地宿主使用，不写入远端引用
  digest: string;
  entries: { id: string; entryPath: string; hash?: string }[];
  requestId: string;
};

type PublishResult =
  | {
      schemaVersion: 1;
      status: "published";
      requestId: string;
      sourceCommit: string;
      digest: string;
      version: string;
      entries: { id: string; url: string; thumbnails?: Thumbnail[] }[];
    }
  | {
      schemaVersion: 1;
      status: "failed";
      requestId: string;
      code: string;
      message: string;
      retryable: boolean;
    };
```

输出缩略图沿用 Artifact 中的严格结构。协议与校验器共用明确定义，拒绝未知字段、重复入口、缺失入口及超限输入。

digest 对规范化相对路径和文件字节生成确定性的 SHA-256，采用长度前缀避免拼接歧义；禁止目录外文件、符号链接和秘密配置。requestId 由仓库身份、源码提交、digest、入口声明确定，作为重试的幂等键。宿主实现对同请求返回同发布结果，对同版本但不同字节拒绝覆盖。

宿主先上传完整版本目录，再提交发布可用标记，确认全部入口及资源可读后返回成功；失败结果不能携带可登记的新引用。任何部分上传、超时或结果校验错误都保留原引用，重试使用相同请求身份。清理未引用的部分产物是宿主职责，不能删除既有发布版本。

登记由原型子 skill 提供的语义脚本完成：读取已验证的成功结果、更新当前入口，并按显式参数关联某个活动 Change。只登记到当前工作分支，Git 推送与合入 main 仍遵循现有流程。发布动作本身不修改 main 总览。登记前检查全部文件及版本条件，持仓库锁，以事务日志和原文校验写入清单/Change；写入失败恢复两份原文，崩溃后先恢复未完成事务，禁止留下看似完整的半次登记。无 Change 参数时允许仅更新当前清单。

`previews-set`、提交 hook、归档工具共同支持新引用，做格式、路径、源码身份和已登记内容校验，不在 hook 中联网检查托管状态。新的幂等、发布结果及登记协议通过独立测试宿主验证成功、部分失败、重试、版本冲突和引用更新；测试宿主使用临时静态存储，不成为 OpenFolio 的托管功能。

## 当前总览与 Change 预览

原型总览固定读取 `refs/heads/main` 的一个确定提交，并从该提交读取 workflow 与描述文件。Specs 自己的 `specBranch` 选择不改变原型总览。main 缺失、配置未启用、描述文件缺失和描述文件损坏分别提示，不选择其他分支或从 Change 拼接清单。

采集时只增加该包内描述文件的受限读取，沿用 JSON 字节、入口数及总体采集限制；不全仓扫描源码或下载静态资源。主文档无效时报告清单错误；个别入口无效或重复 id 时隔离相关入口并显示诊断，其他有效入口可发现。源码变化而 artifact 不变时不触发发布或误标为最新编译结果。

总览以页面内容截图卡片为主体，支持名称/说明查找、设备筛选，点击直接预览；入口不要求关联任何 Change。删除 main 清单项后移除卡片，旧 URL 与 Change 引用不受影响。移除来源分支、Change 状态、历史版本选择器，不把提交信息作为卡片主信息。

预览读取统一解析两种来源：当前入口由 main 的固定清单提交加 entry id 定位；Change 由固定 Change 记录提交加 entry id 定位。服务响应明确区分 Git HTML 和托管 URL，客户端不把 URL 填入原有只处理 HTML 的路径。分享链接固定记录提交与入口，避免用户查看过程中刷新 main 后读到另一版本。

继续保留现有 Change 固定 URL 与归档标签检查。进行中 Change 从其已推送主来源读取引用；归档仍用 `spec-trail/archive/<id>` 保留记录与源码。外部版本保留由宿主负责，标签本身不能保证远端文件永不失效。

快照格式升级时单独迁移并保留已观测的 `archivePins`，再重建新索引；不能以丢弃旧缓存的方式信任被改写的归档标签。刷新失败保留上一份可用快照和明确错误，不悄悄混入别的 main 或分支结果。

## 托管页面的访问与隔离

服务配置在每个项目增加管理员维护的 `prototypeOrigins`，只接受精确 HTTPS origin，默认空；区别于现有工作台自身的 `allowedOrigins`。页面和缩略图 URL 必须命中该列表，且与工作台 origin 不同。仓库内容不能自行扩大允许来源。OpenFolio 后端不下载 URL、不转发访问凭据，避免把展示协议变成通用代理。

托管页面放入 `sandbox="allow-scripts"` 的 iframe，使用 `referrerPolicy="no-referrer"`，不开放存储、弹窗、顶层跳转、表单提交或摄像头等权限。宿主必须允许工作台 iframe 嵌入，为 ESM、动态模块、字体等资源提供适配 opaque origin 的 CORS，静态演示资源不依赖 Cookie；使用 hash/memory 路由和内存 mock。普通构建即可输出多文件，不要求内联成单 HTML。

宿主宜用独立静态 origin，资源自包含在发布目录，并以自己的 CSP 约束资源和连接。父页面 sandbox 可以隔离工作台访问，但不能替宿主响应添加 CSP，也不能保证远端页面永不联网；OpenFolio 不宣称外部原型具备现有 Git HTML 的完全离线保证。宿主构建及发布验证应阻止真实业务请求。

私有存储可由宿主在自己的发布层提供符合上述条件的受控静态访问；任意 SSO、第三方 Cookie 或自定义鉴权头不自动兼容。OpenFolio 不持有宿主登录态、不代理鉴权、不将令牌拼入分享链接。不能满足嵌入条件时显示限制，允许用户在新窗口打开已批准的固定 URL，由宿主自行鉴权。

iframe `load` 不表示应用成功。提供轻量可选消息协议：父端发送含随机 requestId 的初始化消息，宿主在应用可交互后回复同 requestId、版本和 ready，或回复 error。父端核对 `event.source === iframe.contentWindow`、当前请求与版本，不把消息当作上传授权；不依赖 opaque iframe 的 `event.origin` 判断宿主身份。超时显示“尚未确认预览就绪”，不伪造具体 HTTP 或登录失败原因，并提供重试与新窗口入口。

允许来源只约束登记 URL 与直接打开目标，不等于浏览器网络防火墙；重定向、响应头和资源访问策略属于宿主契约，并在接入验证中检查。不得用关闭 sandbox 的方式自动修复不兼容宿主。

## 截图与 Git 兜底

托管预览的缩略图由宿主按声明设备生成并一起发布，OpenFolio 在浏览器中使用批准来源的图片引用及 no-referrer；缺少截图、图片超时或加载失败时提供可辨识占位和打开入口。工作台不运行可访问任意远端 URL 的截图浏览器。实际演示宿主提供截图，验证总览发现页面的完整路径。

Git 兜底继续支持现有自包含 UTF-8 单文件 HTML，不把普通 Vite dist 误判为可用兜底。需要 Git 兜底的 React 项目由宿主自行配置内联构建。保留当前离线 iframe/CSP 与截图器。

显式登记 Git 兜底时，当前产物位于 `<packagePath>/preview/<id>/index.html`；Change 快照复制到该 Change 的 `previews/<id>/index.html`。新 Change 引用的 path 随归档目录移动由语义归档操作更新，内容不变；固定旧提交链接仍读取旧位置。更新当前原型不得覆盖以前 Change 的快照。旧格式引用仍从其原有包路径和固定提交读取，不搬迁或改写已归档记录。

失败发布不自动切换兜底，也不自动添加 dist 到 Git。选择兜底与清除当前入口均须有显式本地操作，不因为构建一个页面清空其他页面。

## 协作指引与个人素材

主 skill 对 enabled 项目且明显改变产品 UI 的 Change 建议优先制作/更新原型；缺省选择、disabled、pending 的接入语义保留。未采纳建议或没有 previews 不阻断流程。原型子 skill 改为说明宿主构建、发布、登记、验证与保留责任，不要求每个项目安装 React，也不要求使用本仓库 UI 包。

个人素材接入工具安装在用户环境，项目只保存适配后的源码、普通依赖、必要授权声明及通用使用说明。真正需要素材时在用户临时目录建立最小获取工作区，完成后迁入 UI 包并去除非必要来源连接；不会把个人 registry 配置、供应商身份或凭据写进仓库。已入库组件不自动追踪上游。

实际工具尚未获知；待用户提供名称、路径或说明后核实可用接口、授权范围及凭据注入方式，再确定个人 skill 的具体调用。没有真实素材和授权时只能验证无凭据失败路径，不能报告真实素材接入验收通过。该输入不影响完成 UI 包和原型协议的技术设计，但应在整体技术/计划确认前明确，或由用户接受为执行依赖。

## 验证与迁移

| 验收范围 | 关键验证 |
| --- | --- |
| UI 共享实现（1–5、8） | 无个人配置的干净安装；主应用和 UI 预览生产构建；同一组件两端状态、键盘焦点和交互；预览独立运行 |
| 素材接入（6–8） | 一次获授权的真实按需获取及适配；无凭据失败路径；检查 Git、依赖、产物及普通构建网络请求 |
| main 总览（9–10） | 有/无 Change 关联、main 删除项、开发分支新增项、源码变化但引用不变、缺失/损坏描述、无 main 的 Git fixtures |
| 固定交付（11–14） | 两个 Change 发布同入口不同版本；当前引用更新后旧分享不变；React 多资源原型加载和交互；拒绝来源、CORS/嵌入限制、就绪信号超时 |
| 协作规则（15） | 四种项目选择与 UI/非 UI 变化的指引；无 previews 的状态推进继续通过 |
| 发布与兜底（16–17） | 成功、部分失败、同请求重试、冲突版本、登记中断恢复；当前 Git HTML、Change 快照、旧归档固定链接及 archivePins 迁移 |

实施时先稳定共享格式及发布/登记失败行为，再接入读取、预览和总览。协议改变的自动化测试应覆盖信任边界与兼容路径，避免只断言实现细节。UI 构建、类型检查、现有相关单元/浏览器回归与独立评审通过后再进入人工验收。

现有项目新增描述文件后才出现在新版当前总览；没有描述文件时显示接入说明，不从历史自动推算清单。OpenFolio 自身的既有原型作为普通项目，显式登记仍在维护的入口，可先使用 Git 兜底；UI 包预览不加入该清单。

服务端协议与消费方同时升级，旧记录继续可读。升级前保存缓存和配置；新格式引用发布后，旧版程序无法识别，回退需恢复服务配置及对应 main 描述/活动 Change 记录的兼容版本，不能修改归档历史或删除已发布版本。
