# T1：自动初始化并可靠保存服务配置

实现默认数据目录下 `config.json` 与显式路径覆盖；首次读取以完整文件独占发布，父目录缺失时自动创建。新增 GET/PUT 配置接口、原文件内容版本校验、单进程写入串行与原子替换。保存保持显式符号链接的目标，损坏配置、非法请求和读写失败均返回具体错误。README 已补充默认部署方式。

验证：`node --conditions=react-server --test tests/config.test.ts tests/store.test.ts` 13 项通过，涵盖 20 次并发首次读取、并发保存冲突、外部修改、无效字段与 JSON、权限失败、符号链接及 API 请求边界；`npm run typecheck`、改动文件 Prettier 检查与 `git diff --check` 通过。页面功能和生产构建由 T2 集成验证。
