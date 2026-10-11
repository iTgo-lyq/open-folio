# 执行证据

## T1

workflow 增加可选服务地址及三种托管选择，setup 原子保存并保留已有选择；新 hosted 包构建到 dist，原 Git 包和现有构建不被改写。移除设置字段、来源白名单和不同源要求，旧 prototypeOrigins 读取时忽略、保存时清除。

35 项配置、原型契约、setup、发布及预览测试通过；设置页面 6 项浏览器测试通过。类型检查、diff 检查及两个 skill 的 quick_validate.py 通过。浏览器测试使用本 worktree 的 .next-e2e，运行中的原工作区生产预览未改动。

依赖已集成：配置与访问 Change 在用户验收后归档于 f979022，合入当前分支；原型 UI 规则交付为已归档的 8a14dc8。
