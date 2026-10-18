# 验证记录

## T1：截图发布引用与卡片展示

R2 适配器从 entryPath 所在目录识别标准设备截图。新增发布回归覆盖根目录入口、与 id 不同的嵌套目录、多入口隔离、无图入口不误取 id 目录图片及重复发布一致性。当前清单与本次 Change 固定预览通过 register 命令补齐三个设备引用；原归档保持只读。

使用修复后的 publishToR2 重试原发布请求，校验所有已有对象的字节、类型和公开读取结果后重新生成 result。版本仍为 e6ba254d8c8b673efb06271fd5a5697e65fea4d60d26fdd3fbc9a564fe35a447，sourceCommit 和 digest 均未变化，没有覆盖远端文件。

- `npm run test --workspace prototype`：16 项通过，包含发布回归和沙箱截图测试。
- `node .agents/skills/spec-trail/prototype/scripts/validate.mjs`：4 个当前入口静态校验通过。
- `npm run typecheck`：应用和 UI 包均通过。
- `npm run test:e2e -- tests/browser/prototypes.spec.ts`：11 项中 10 项通过，包括新增逐设备验证 hosted 卡片图片解码、正常展示并进入原型的测试。
- 原有 `loaded hosted pages need no ready bridge and explicit errors survive page load` 在 iframe 内点击被 html 拦截而超时。定向重跑，以及从修改前 HEAD 提取完全未改的测试单独运行，均复现相同错误，属于本次修复前已存在的验证限制；未以强制点击绕过，也未修改该测试或相关产品实现。

README 与包内 AGENTS 已将截图引用完整性、发布后逐设备卡片实际加载、进入页面及测试会话退出核验列入发布验收。集成后的真实工作台截图检查与运行提交在交付回复及本地 artifacts 中补充记录，不改写已归档历史。
