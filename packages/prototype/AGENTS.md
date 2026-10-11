# Prototype package

遵循根 AGENTS.md 和本包 DESIGN.md，以现有产品为设计基线。当前只维护 workspace-shell 页面外壳，不添加测试业务 demo；交互在内存运行，不访问真实接口或持久存储。

本项目已选择 Git 直接存储。运行 npm run build --workspace prototype，生成自包含 preview/workspace-shell/index.html；脚本、CSS 和图片全部内联。源码和产物入 Git，prototype.json 维护当前入口，Change 保存固定快照。清理当前入口不改写已归档交付。
