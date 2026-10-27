# 执行证据

## T1 子项移交与来源读取

子项移交以父分支为基线，将集中登记作为独立提交合入子分支；发布顺序为子分支、集中登记，集中分支不接收父项实现。失败后用现有合并提交重试，不引入日志文件。CLI 与工作台优先读取父分支中的有效子项归档，保留子项原始 branch。

验证：`node --conditions=react-server --test tests/workspace-routing.test.ts tests/routing.test.ts`，19 项通过；新增 `tests/xlarge-integration.test.ts`，2 项通过，覆盖代码隔离、发布失败重试、删除子分支后的 CLI 与工作台读取；`npx tsc --noEmit` 通过。
