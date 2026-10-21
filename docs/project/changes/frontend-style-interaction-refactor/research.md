# 原型材料

## 需求来源

用户最初要求探索更现代、易读、易操作、冗余信息少且漂亮的后台，保留蓝色主题，少量组件使用苹果液态玻璃风格，并授权自由探索、先输出原型。后续要求发布该原型，以便从 OpenFolio 原型总览直接访问。

用户已明确整体目标是大型前端样式与交互重构，现阶段继续围绕原型讨论。现有发布检查仅证明原型可访问和可操作，不表示需求、设计方案或正式产品改版已经验收。

## 第一版讨论稿

[打开蓝色玻璃工作台原型](https://pub-cc623a99ce8e4606a3491cc2d4b4436c.r2.dev/open-folio/b5795adb098c8063f19e164f7257d1836e69cee2e2534dee955426571e066f0a/index.html)

第一版包含仓库搜索与收藏、Specs 阅读、Change 详情、原型设备快照和明暗主题，使用示例数据，操作在内存中运行。正式工作台尚未应用这一视觉方案。

此前已验证原型在桌面、iPad、手机和 320px 窄屏的布局及主要交互；真实总览三种设备的卡片图片均加载成功。下面的卡片截图是发布检查证据，仅用于对照当前讨论稿。

![桌面原型卡片](assets/pc-web-gallery.png)

![iPad 原型卡片](assets/ipad-gallery.png)

![手机原型卡片](assets/mobile-gallery.png)

## 六组明暗主题原型（已被第二轮返工取代）

2026-10-22 用户审阅后要求返工（见 [Requirement](requirement.md#第二轮返工2026-10-22)），本版不再请求验收，以下记录仅作对照。

用户确认需求并授权提交、推送和设计原型；需求确认提交为 `11284f8`。新设计以 `develop@fee9a9f` 已集成产品与本 Change 的需求为依据，旧蓝色玻璃稿仅保留参考。六组入口为 `quiet-home`、`quiet-specs`、`quiet-changes`、`quiet-prototypes`、`quiet-credentials`、`quiet-public`，共同支持浅色/深色和桌面、平板、手机。设计规则及 shadcnuikit 参考 id 见 [DESIGN.md](../../../../packages/prototype/DESIGN.md)。

原型仅使用虚构数据和内存交互；登录接受 `demo` / `demo-other`，对应现有 Token 身份模型。工程记录只读，不增加搜索、收藏、统计、批量写入或账号密码能力。Changes 的材料均标明虚构示例，不是本 Change 的 Technical/Plan。表单采用内存事件并支持 Enter，兼容工作台仅授予 `allow-scripts` 的 iframe。正文为实底，玻璃仅用于局部功能层，并支持透明度和动态效果降级。

### 本地验证（2026-10-19 UTC）

`npm run build --workspace prototype` 成功；`node packages/prototype/verify-quiet-workbench.mjs` 完成 86 项断言，失败 0、浏览器错误 0。

- 六入口 × 两主题 × 四档尺寸（1440×900、834×1194、390×844、320×720）共 48 项布局检查均无页面横向溢出；长文与画布局部滚动保持在阅读区内。
- 在真实不透明 iframe 沙箱及项目 CSP 下验证键盘导航、可见焦点、Escape 与嵌套弹窗焦点恢复、手机目录、触摸入口、过滤与分页、问答、只读任务视图、合入差异和限制状态。
- 设备画布的尺寸、旋转、适应/100% 映射准确；卡片截图与标题分别进入预览和详情，固定分享及匿名权限边界可演示。
- Token 添加/去重、切换失败保留当前身份、不同 Token 工作台隔离、设备退出范围、复制失败回退、减少透明度与减少动态效果通过。
- 验证加载、空态、部分失败、无匹配、离线、无权限、会话失效、来源失败、材料缺失、合入失败、未发布和公开链接撤回等场景。
- 六入口均执行包内正式 screenshot 命令，生成桌面、iPad、手机共 18 张标准卡片图；另保留两主题共 36 张布局检查图。结果和截图位于忽略目录 `artifacts/quiet-workbench/`。

仅更新原型包和本 Change 文档/语义状态；不修改产品前端代码、不编写 Technical/Plan，也不记录原型验收。固定发布和真实工作台检查记录如下。

### 固定发布

R2 固定版本 `dc671716fc3ceadc3eb7dc47fe201adeb06923357abc17024f3c4819ad4543c0`，源码提交 `300bb77e2fb00c706cee6883bfefc9c175beac5f`，内容摘要 `sha256:aaa9a50dfde0d0aa8c01a9fac895760d27a69a5b4dfeaa1ae5f5dd1a0d88cccb`。通过公开 GET 对所有上传字节和 MIME 校验后，使用 SpecTrail `publish register` 登记六入口；每项均包含桌面、iPad、手机缩略图，旧引用保持原值。

| 入口 | 浅色 | 深色 |
| --- | --- | --- |
| 仓库与导航 | [打开原型](https://pub-cc623a99ce8e4606a3491cc2d4b4436c.r2.dev/open-folio/dc671716fc3ceadc3eb7dc47fe201adeb06923357abc17024f3c4819ad4543c0/quiet-home/index.html) | [打开深色](https://pub-cc623a99ce8e4606a3491cc2d4b4436c.r2.dev/open-folio/dc671716fc3ceadc3eb7dc47fe201adeb06923357abc17024f3c4819ad4543c0/quiet-home/index.html#/home?theme=dark) |
| Specs 阅读 | [打开原型](https://pub-cc623a99ce8e4606a3491cc2d4b4436c.r2.dev/open-folio/dc671716fc3ceadc3eb7dc47fe201adeb06923357abc17024f3c4819ad4543c0/quiet-specs/index.html) | [打开深色](https://pub-cc623a99ce8e4606a3491cc2d4b4436c.r2.dev/open-folio/dc671716fc3ceadc3eb7dc47fe201adeb06923357abc17024f3c4819ad4543c0/quiet-specs/index.html#/specs?theme=dark) |
| Changes 与详情 | [打开原型](https://pub-cc623a99ce8e4606a3491cc2d4b4436c.r2.dev/open-folio/dc671716fc3ceadc3eb7dc47fe201adeb06923357abc17024f3c4819ad4543c0/quiet-changes/index.html) | [打开深色](https://pub-cc623a99ce8e4606a3491cc2d4b4436c.r2.dev/open-folio/dc671716fc3ceadc3eb7dc47fe201adeb06923357abc17024f3c4819ad4543c0/quiet-changes/index.html#/changes?theme=dark) |
| 原型总览与画布 | [打开原型](https://pub-cc623a99ce8e4606a3491cc2d4b4436c.r2.dev/open-folio/dc671716fc3ceadc3eb7dc47fe201adeb06923357abc17024f3c4819ad4543c0/quiet-prototypes/index.html) | [打开深色](https://pub-cc623a99ce8e4606a3491cc2d4b4436c.r2.dev/open-folio/dc671716fc3ceadc3eb7dc47fe201adeb06923357abc17024f3c4819ad4543c0/quiet-prototypes/index.html#/prototypes?theme=dark) |
| Token 登录与凭据 | [打开原型](https://pub-cc623a99ce8e4606a3491cc2d4b4436c.r2.dev/open-folio/dc671716fc3ceadc3eb7dc47fe201adeb06923357abc17024f3c4819ad4543c0/quiet-credentials/index.html) | [打开深色](https://pub-cc623a99ce8e4606a3491cc2d4b4436c.r2.dev/open-folio/dc671716fc3ceadc3eb7dc47fe201adeb06923357abc17024f3c4819ad4543c0/quiet-credentials/index.html#/credentials?theme=dark) |
| 匿名公开预览 | [打开原型](https://pub-cc623a99ce8e4606a3491cc2d4b4436c.r2.dev/open-folio/dc671716fc3ceadc3eb7dc47fe201adeb06923357abc17024f3c4819ad4543c0/quiet-public/index.html) | [打开深色](https://pub-cc623a99ce8e4606a3491cc2d4b4436c.r2.dev/open-folio/dc671716fc3ceadc3eb7dc47fe201adeb06923357abc17024f3c4819ad4543c0/quiet-public/index.html#/public?theme=dark) |

顶部「设计预览」可切换六组页面与场景，页面内主题按钮切换明暗。每个入口的固定目录另含 `dark-pc-web.png`、`dark-ipad.png`、`dark-mobile.png`，用于对照深色外观；它们是检查图，当前卡片仍使用标准设备缩略图。

该版本未经用户验收即进入第二轮返工。

### 真实工作台发布核验（2026-10-19 UTC）

固定引用推送至 `develop@ef05ff5` 后，用 `withSmokeSession` 创建独立真实登录并刷新 OpenFolio 仓库。26 项发布检查通过，测试结束后包装器已读取最新会话版本、退出自身授权并核验当前及记住的测试身份均已清除。首次坐标定位失败及后续重试也由同一包装器分别完成清理。

- 真实原型清单读取六个新入口；发布 result、清单与 Change 的版本/源码/摘要/设备缩略图一致，历史蓝色玻璃引用原样保留。
- 在真实总览逐项切换 PC Web、iPad、移动设备筛选，六张卡片共 18 张图片均满足 `img.complete && naturalWidth > 0`，图片地址属于本次固定版本。
- 从六张卡片分别进入预览，确认 iframe 仍只授予 `allow-scripts`；实际鼠标点击可以切换浅色/深色，加载/正常场景也可以切换。最终检查无浏览器运行错误。
- 自动化最初将 iframe 内坐标直接叠加到宿主位置，未计入画布 CSS 缩放，导致点击越界；按实际缩放后的鼠标坐标重试通过，未更改原型或产品来绕过限制。
- `node .agents/skills/spec-trail/prototype/scripts/validate.mjs --browser` 对当前 13 个已登记入口的 Chromium 沙箱加载检查通过。产品代码没有变更，此次仅刷新远端项目引用，不重建长期服务。

本地交互及尺寸断言见 [86 项本地检查](assets/quiet-local-checks.json)，真实卡片与预览断言见 [26 项发布检查](assets/quiet-published-checks.json)。真实总览三设备截图与六个预览检查截图保留于忽略目录 `artifacts/quiet-workbench/published-*.png`；此处不包含真实凭据或会话数据。
