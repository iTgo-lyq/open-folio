# 验证记录

交互原型统一使用不带 sandbox 的 iframe，按浏览器支持的指令委派权限；工作台、公开预览及 Change 分享共用配置。公开 HTML、内置托管资源及分享 HTML 不再附加 CSP 或禁用权限响应头。原型错误通知改为核对当前 iframe、实际来源及加载标识，保留脚本异常提示。验证工具采用相同权限配置。后台截图隔离和 Git 单文件打包检查保持原用途。

Agent 自查完整差异：版本引用、文件白名单、摘要校验、撤回及接口认证逻辑不变；相机等能力只解除容器策略限制，浏览器授权和外部宿主自身策略仍有效。SpecTrail 原型工具与说明同步更新，应用和技能统一版本为 0.1.14。

- `node --conditions=react-server --test tests/public-previews.test.ts tests/prototype-hosting.test.ts tests/prototype-tools.test.ts tests/previews.test.ts tests/shares.test.ts`：39 项通过。
- 七个相关浏览器测试文件覆盖原型、公开页面、分享、托管资源和加载错误；排除下面单独核对的既有布局用例后，35 项通过。新增真实交互检查在公开预览、Change 分享和跨域托管预览分别验证 confirm 的确定/取消、权限委派、存储、请求、Blob Worker、嵌套 iframe、表单、弹窗和下载。回归夹具使用独立账号和隔离上下文，避免复用用户会话。
- `npm run typecheck`、`npm run build`、改动文件 Prettier 检查及 `git diff --check`：通过。

`prototype-layout.spec.ts` 的四宽度画廊/画布/公开页检查在 320px 画布工具栏发生横向溢出；相同用例在未修改的主工作区 `develop`（9e253c3）也失败，位置均为工具栏 scrollWidth 检查。该既有问题与 iframe 能力配置无关，本次保留并明确记录，不计为通过。其他布局、缩放、点击和分享回归均通过。
