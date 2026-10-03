# 按 Change 状态简化浏览视图：验证依据

## T1：状态浏览与详情

取消 Changes 的全部范围；旧 all/非法范围链接回到进行中，保留详情。非进行中范围隐藏阶段和等待筛选，Change 阶段看板转为列表；保留任务状态看板、关系与历史材料。归档、取消、来源异常分别显示时间与完成结果、原因、来源问题，清除筛选留在当前范围。详情仅 active 且无来源错误时显示当前阶段和流程；其他状态的历史阶段在依据页签查看。

## 验证

- `npm run typecheck`：通过。
- `npx playwright test tests/browser/changes.spec.ts tests/browser/prototypes.spec.ts tests/browser/previews.spec.ts`：首轮 18 项通过，两项失败定位为警告被当作阶段失效、取消 fixture 的规模断言误写。调整为仅来源错误抑制 active 阶段，按原始 Large fixture 修正断言；`npx playwright test tests/browser/changes.spec.ts` 复验 11/11 通过。原型浏览与预览 9 项通过。
- Changes 覆盖四个范围、归档/取消/来源异常的摘要和时间、active 阶段与任务看板、历史证据、搜索、跨项目、旧链接、清除筛选、浏览器返回、320px 布局与弹层焦点。
- `OPENFOLIO_BUILD_DIR=.next-change-lifecycle npm run build`：生产构建通过；只用于此构建的 tsconfig 自动注入路径已移除。
- `npx prettier --check src/components/changes.tsx src/app/globals.css tests/browser/changes.spec.ts`、`git diff --check`：通过。
- 生产服务更新后通过本机回环代理读取真实 Git 快照，检查四个范围、归档列表/详情、验收依据、320px 列表/详情、all 深链接与已归档原型；来源异常为 0、浏览器错误为 0。实际私有网关的人工登录流程未重测。
- 自查桌面归档列表、归档详情及 320px 取消列表和真实归档详情截图，无页面横向溢出；历史文档与 JSON 没有被修改。

浏览器图片与本机真实服务检查脚本保存在被忽略的 `artifacts/`，不成为 Change 交付产物。自查未发现剩余验收缺口；本次仅涉及展示和 URL 状态，未修改 API、流程契约、权限或读取来源判定。
