# SpecTrail 原型

涉及产品 UI 的 Change 按主 skill 的原型接入规则读取本说明；常规 Change 推进回到主 skill。每项目一个原型包，默认 `packages/prototype`。原型包直接引用业务代码，用 mock 代替后端，按业务仓库自己的技术栈构建成多个静态页，产物交给所选服务或 Git。下文脚本涉及的配置、清单和 Change 引用写入遵循[主 skill 的写入状态](../../SKILL.md#写入状态)。

## 原型片段

**原型的输出单位是业务页面片段，不是传统意义上的组件。** 一个清单入口对应从真实业务页面中切出的一块，有完整的业务含义，可以单独查看和评审，例如：

- 页面框架：顶栏、侧栏导航、面包屑，内容区留空或放占位；
- 业务大表单：分组、联动字段、校验提示、提交中与提交失败；
- 列表区：筛选、表格、分页与空态；
- 详情抽屉或多步弹窗。

按钮、输入框、卡片等原子组件属于组件库自己的预览，不进入项目原型清单；完整应用也不是原型目标，不带路由、登录和后端。需要看整体效果时另建组合入口，把页面框架与表单等片段拼在一起，它仍是一个独立入口。

片段范围由本次 Change 实际影响的界面决定，只画受影响的片段，不为一个需求重画整个应用。评审关注业务布局、字段、流程与状态。同一入口内可切换空态、加载、出错、长内容、无权限等状态；表单校验、步骤切换等局部交互使用内存状态。

清单的 `kind` 只区分展示方式：整页宽度的片段（如页面框架）用 `page` 按设备展示，有固定尺寸的片段（如表单、抽屉）用 `component` 按 viewport 展示，两者都是业务页面片段。

## 原型包与业务代码

原型包独立存放入口源码、mock 与构建配置，清单 `sourcePath` 指向包内的入口源码。本次 Change 要新增或修改的界面，在原型阶段就直接写进业务代码，原型入口引用它；既有的业务组件、样式和主题直接复用。**不为原型改造业务仓库**：

- **直接跨包引用**：原型包按源码路径或业务仓库已有的路径别名引用业务模块，不经业务包的 `exports`、入口文件或 barrel。业务仓库不为原型新增导出、入口、预览专用 props 或配置。
- **mock 放在数据边界**：数据优先通过 props 传入；组件内部取数时，由原型包的构建配置把数据请求、路由、服务端模块等边界模块替换为包内 mock。后端尚未就绪时同样用 mock 顶上。mock 只在内存中运行，不访问真实业务服务或持久存储。
- **轻量实现兜底**：引用某块既有业务代码需要大改业务仓库时，在原型包内做轻量实现，并在入口说明中注明。
- **不引入完整应用框架**：片段在原型包自己的轻量入口中渲染，不启动业务应用的服务端、路由和登录体系。

原型阶段写下的业务代码只要能评审，允许简陋，例如临时写法、未接真实接口或缺少测试。Plan 的实现任务要覆盖这些代码，实现时按正式标准重新优化，见[执行与交付](../delivery/delivery.md#执行)。

业务仓库的代码组织本身应适合被原型包引用：展示组件与数据获取分开，数据请求、路由和服务端调用集中在少数边界模块，模块导入时没有副作用。原型和实现阶段编写业务代码时都保持这种组织；既有代码不满足时，不为原型专门重构，按上文在原型包内轻量实现。

## 构建

构建沿用业务仓库现有的技术栈、构建工具与配置（路径别名、样式管线、TypeScript 等），SpecTrail 不提供或推荐脚手架。原型包 `package.json` 的 `build` 脚本是唯一构建入口，按多页面静态构建输出，每个清单入口一个静态页：

- 托管：`<packagePath>/dist/<id>/index.html`，资源使用相对路径，入口之间可以共享资源文件；
- Git 兜底：`<packagePath>/preview/<id>/index.html` 单文件，见 [Git 兜底](#git-兜底)。

产物不依赖后端或开发服务器，用任意静态服务器打开即可交互。dist 默认不入 Git。

## 接入与设计

读取 AGENTS、设计规范、现有组件、业务构建配置及 `workflow.json.prototype`。

需求确认并移交后，在所属 Change 的独立工作区绘制或更新原型，small 沿用主流程确认规则。绘制前核对其他进行中 Change 的修改范围，有重叠时先协调公共修改、依赖和合入顺序。

原型已启用时，按 UI 影响范围处理，不以 Change 规模代替判断：

- 小型变化：先询问是否绘制原型；可先推进无关工作，较长时间未回复时说明后跳过绘制。
- 大范围变化：实现前必须先绘制或更新原型，并提供预览。

```bash
node .agents/skills/spec-trail/cli.mjs prototype accept --package packages/prototype
node .agents/skills/spec-trail/cli.mjs prototype decline
```

接入决定沿用会话授权。accept 不安装框架、不生成构建，也不覆盖已有文件。空目录只生成 private 的 package.json、.gitignore、空 prototype.json、AGENTS 和 DESIGN，并登记到根工作区，接入保持 pending；按[构建](#构建)用业务技术栈补上 build 脚本和依赖后，运行 `prototype enable`。采用现有工程时提供带 build 脚本的 package.json、AGENTS、DESIGN 和合法 prototype.json，再运行 `prototype enable`。保留原包管理器，原型包 private:true。

### 托管方式

需要发布时先读 workflow；托管方式尚未选择时，先询问是否有自建 OpenFolio（openfolioUrl 保存地址或 null），再询问 OpenFolio、其他自建托管或 Git，保存到 prototype.hosting。会话或配置已有选择时直接复用，只补齐该方式必需的信息，不因一次发布失败换方案。

OpenFolio 保存管理员提供的 uploadUrl；持有地址即可上传，可提交到仓库供成员使用，OpenFolio 上的静态文件公开读取。custom 可记录上传地址，使用项目适配器；git 不填上传地址。无自建 OpenFolio 时先选 custom/git，或补齐实例地址。保存选择：

```bash
node .agents/skills/spec-trail/cli.mjs prototype configure --openfolio-url https://folio.example.com --hosting openfolio --upload-url "$OPENFOLIO_UPLOAD_URL"
# 无实例使用 --openfolio-url none；其他方式用 --hosting custom 或 --hosting git。
```

首次初始化可将这些参数用于 `prototype accept`。管理员可在本地设置 OPENFOLIO_ADMIN_PASSWORD，将 --upload-url 换为 --fetch-upload-url 自动获取并保存地址；不把管理密码写入仓库。

### DESIGN.md

已有规范用 --design 引用，避免复制出第二份权威；没有时，setup 从 [模板](./assets/DESIGN.template.md) 生成包内 DESIGN.md，绘制前按项目事实补全。先读主题/token、共享组件和代表页面，必要时对照截图；写清视觉方向、色彩用途与数值、字阶、布局/断点、组件状态及无障碍约定。链接依据，区分现状与新决策；未知项标明待定，删除无关章节。后续原型沿用该规范。

## 原型验收

只要绘制或更新了原型，无论 Change 规模，都必须提供预览并由用户明确验收通过，才能开始对应实现。实现后的核对见[执行与交付](../delivery/delivery.md#原型核对)。

## 当前清单

`<packagePath>/prototype.json` 是集成分支当前总览唯一清单，Git 保存源码及描述，dist 默认忽略。格式由 [共享契约](../../scripts/prototype/contract.mjs) 校验：

```json
{
  "schemaVersion": 1,
  "entries": [
    {"id":"order-form","title":"订单编辑表单","description":"分组字段、联动校验与提交失败","sourcePath":"packages/prototype/src/order-form.tsx","kind":"component","viewport":{"width":960,"height":720}}
  ]
}
```

id 稳定且项目内唯一，与构建产物的 `<id>` 目录一致；名称可改。page 必须声明 devices，component 在 devices 和 1–4096 CSS px 的 viewport 中二选一。artifact 缺失表示未交付。删除集成分支清单项即从总览移除，不清除旧发布或 Change 历史；源码、引用的业务组件或主题变化不强制重发所有参考原型。

## 发布与登记

先提交源码，以干净提交运行原型包的 build 脚本；自建适配器的存储凭据由宿主环境注入。准备协议请求：

```bash
# entries.json 是 [{"id":"order-form","entryPath":"order-form/index.html"}]
node .agents/skills/spec-trail/cli.mjs prototype prepare --directory packages/prototype/dist --entries /tmp/entries.json --repository https://example.org/team/project.git --out /tmp/request.json
# OpenFolio：按 workflow 中的地址上传，并登记当前清单及可选 Change。
node .agents/skills/spec-trail/cli.mjs prototype upload --request /tmp/request.json --result /tmp/result.json --change change-id
# custom：由项目适配器读取 request.json，上传并生成 result.json，再登记。
node .agents/skills/spec-trail/cli.mjs prototype register --request /tmp/request.json --result /tmp/result.json --change change-id
```

请求包含 schemaVersion、repository、sourceCommit、artifactDirectory、digest、entries、requestId。requestId 基于内容和入口确定；实现见 [publishing.mjs](../../scripts/prototype/publishing.mjs)，custom 模式可参考[文件系统适配器示例](./examples/filesystem-host.mjs)。

成功结果包含 schemaVersion:1、status:published、原 requestId/sourceCommit/digest、固定 version 及 entries；每项是 id/url，可提供 thumbnails 数组（device/url；固定 PNG/WebP）。失败返回 status:failed、requestId、code、message、retryable。宿主先完整上传再原子发布，重复请求返回同版本，绝不覆盖旧版本字节，并负责保留被历史引用的版本；失败不替换引用，也不自动提交 dist。

登记命令校验结果后一起更新当前 artifact 与可选 Change previews；无 --change 可只更新当前清单。OpenFolio 上传失败可原请求重试；上传成功但本地登记失败时，用保存的 request/result 重试 register。临时协议文件放仓库外。

需要直接替换 Change 关联的预览时运行 `node .agents/skills/spec-trail/cli.mjs prototype previews --change change-id --file /tmp/previews.json`，文件只含 PreviewEntry 数组，其余状态保留；新增或更新要求原型已启用，停用后仍可删除旧关联。Change 保留自己的显示信息、视口、固定地址和构建源码 commit，不跟随当前清单变化。预览引用使用无凭据、无 query 的 HTTP/HTTPS，可用 hash 路由；上传地址只保存在 workflow，不放进预览引用或成功日志。

多文件登记中断后运行 `node .agents/skills/spec-trail/cli.mjs prototype recover`，遇到新的用户编辑或提交即停止，不覆盖，随后重新运行 register 或 upload。遗留的 Git common-dir 下 `spec-trail-state.lock` 不会被抢占：读取其中的 owner.json，核实持锁进程已结束、仓库无其他状态操作并检查工作区与事务日志后，再清理锁目录；无法确认时保留锁与日志，不删除事务日志来绕过恢复。

引用提交推送后进入集成分支即更新预发布总览，不必等待发布分支；再按[分享链接](../../SKILL.md#分享链接)提供定位此原型的 Change 阅读链接。

### 子模块中的原型包

- `packagePath` 相对主仓库，可指向子模块根目录或内部包，如 `frontend/packages/prototype`；清单的 `sourcePath`、Git `artifact.path` 相对子仓库根目录。复用前端工程，子仓库无需另接入 SpecTrail。
- 前端先提交干净源码 A，再构建发布、登记并提交/推送清单 B。发布命令指定 `--repo 前端目录 --package packages/prototype`（根包用 `.`），directory/repository 属于前端；OpenFolio 上传另传 `--openfolio-url`、`--upload-url` 或 `OPENFOLIO_URL`/`OPENFOLIO_UPLOAD_URL`。前端登记不传 `--change`。
- 主仓库执行 `node .agents/skills/spec-trail/cli.mjs prototype associate --repo 主仓库目录 --change change-id [--entry id]`，读取已提交 B，只写 Change 及 Git 快照；最后一次提交/推送 gitlink B、Change 和快照。嵌套模块先从内向外提交。新 artifact.source 记录仓库/包路径，sourceCommit 为 A。历史按固定 gitlink 追溯，不随子分支变化，无权限或缺版本明确提示。工具不代提交。
- 发布登记与关联分别使用所在仓库的 `recover`，不跨库联合写入。

## 嵌入与验证

原型使用 HTTP/HTTPS 地址，资源用相对路径；宿主需允许嵌入，跨域资源按浏览器规则配置 CORS。OpenFolio 的预览不限制原型的浏览器能力，也不代理第三方登录或转发凭据。宿主可使用 [就绪桥接](../../scripts/prototype/bridge.mjs) 回复工作台的 ready/error 握手，这一握手是可选的。

```bash
node .agents/skills/spec-trail/cli.mjs prototype validate
node .agents/skills/spec-trail/cli.mjs prototype validate --browser
```

validate 检查已登记入口和包内 Git 兜底产物；托管产物发布前，用静态服务器打开 `dist/<id>/index.html` 逐个核对。浏览器检查使用宿主安装的 Playwright；可用 --playwright 指向已有模块。静态检查不代替浏览器检查，初始加载也不代替关键交互及各声明视口验证。OpenFolio 自动生成托管原型截图，项目提供的截图优先覆盖对应视口。

## Git 兜底

显式采用 Git 兜底时，build 脚本为每个入口生成 `<packagePath>/preview/<id>/index.html` 自包含 UTF-8 HTML，脚本/CSS/mock 内联，图片字体用 data URL；构建产物不引用外链资源；运行时浏览器能力与托管原型一致。业务工具链的普通多文件产物不是单文件兜底，内联由原型包的构建负责。

```bash
node .agents/skills/spec-trail/cli.mjs prototype register --git-entry order-form --change change-id
```

该操作记录源码 commit，当前产物留在包内，并复制一份到 Change 的 previews/id；后续更新当前产物不覆盖旧 Change。不要因为构建一个入口就清空其他入口。

## 归档

主 skill 完成验证、验收与 Specs 同步后提交归档，再按[PR 合入](../delivery/delivery.md#pr-合入)形成合并提交 M。归档命令将 Git 原型固定到本 Change 的 previews 快照目录并更新 artifact.path，保留 sourceCommit；共享目录引用先复制，路径冲突则停止。已合入 Change 从 M 定位固定原型；Git HTML 读取归档快照，hosted 保留原版本、地址、摘要、截图和 sourceCommit。未合入来源仍固定到已推送 SHA。

已归档引用不改写，旧归档没有有效 M 时留空。清理来源前验证 Git 文件、源码对象与托管产物可用性；已准备的公开版本独立保留。
