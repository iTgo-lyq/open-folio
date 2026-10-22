# 共享 UI 与组件预览

OpenFolio 在 workspace 包 `@open-folio/ui` 维护基础 React 组件、公共主题样式和独立预览。主应用与预览使用同一份公共实现，业务组合和数据由调用方维护。维护入口见根 [AGENTS.md](../../../../AGENTS.md) 及 [包内 README](../../../../packages/ui/README.md)。

## 公共组件与主题

包导出 Button、IconButton、Badge、EmptyState、Card、Tabs 和 TabbedCard 及其组合部件。Button 支持样式变体和 loading；Badge 接收展示色调，业务状态映射留在应用；Card 提供内容结构，Tabs 和 TabbedCard 支持受控或内部选项状态、禁用项及键盘操作。

公共集合还包含 BrandMark、Avatar、Input、Textarea、Field、Menu、Popover、Dialog、Sheet、Tooltip、SegmentedControl、Switch 和 Skeleton。菜单、弹层与对话框提供键盘、焦点进入/返回和 Escape 关闭；Sheet 贴边呈现单层玻璃表面，遮罩模糊背景，阅读专用宽度由调用方组合。基础组件不持有工作台业务数据。

主应用通过包入口消费按钮、图标按钮、标签和空态；示例不属于公共入口。包导出 TypeScript 源码，由消费方编译，React 使用 peer dependency。

公共样式通过 `@open-folio/ui/styles.css` 在消费方入口导入一次，使用 `of-ui-` 类名前缀与 `--of-*` CSS 变量维护共享颜色、间距、圆角、字体与玻璃材质。提供浅色和深色主题 token，以中性色为基础、陶土为强调色；标志是随主题反白的墨色平面矢量，浏览器与应用图标使用同一形状。调用方通过主题属性选择样式；主应用在首帧前确定系统或已保存主题，未手动选择时跟随系统，账号菜单提供浅色和深色选择并保存在本机。

基础组件和公共主题放在此包；阅读布局、导航胶囊、Change 行与业务状态等组合放在主应用组件中，以局部 CSS Modules 表达业务样式，通过包入口复用基础组件。

## 独立预览

维护者可通过 `npm run ui:dev` 单独启动组件预览，以名称搜索、分类导航和预览/代码选项卡查看用法、状态及交互。示例从公共入口导入组件，只提供局部状态、参数与 mock，不依赖工作台配置、真实业务服务或个人素材凭据。

`npm run ui:build` 生成包内普通 Vite dist，`npm run ui:preview` 查看构建结果，`npm run ui:test` 验证生产预览交互与窄屏布局。dist 不入 Git。组件库预览不自动登记到原型清单或 Change previews，查看组件无需启动 OpenFolio 原型模块。

开发或修改 UI 包前阅读包内 README；共享实现与相应示例一起维护，并按其中约定核对主应用消费与独立预览。
