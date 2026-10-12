# Prototype package

遵循根 AGENTS.md 和本包 DESIGN.md，以现有产品为设计基线。维护 workspace-shell 页面外壳及 personal-workbench Change 的个人工作台流程；后者使用明确标识的示例仓库和状态，不添加无关业务 demo。交互在内存运行，不访问真实接口或持久存储，不录入真实 token。

原型构建输出各页面对应的自包含 dist/<id>/index.html，脚本、CSS 和图片全部内联；dist 不入 Git。按 README.md 使用项目 R2 适配器发布，凭据只放发布机器。上传验证成功后登记当前清单与新 Change，才移除当前旧 Git 产物；发布前保留已有引用。历史 Change、Git 快照和标签不改写。
