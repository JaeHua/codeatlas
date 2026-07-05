# CodeAtlas macOS 原生版 — Swift 构建提示词

## 项目概述

构建一个名为 **CodeAtlas** 的 macOS 原生桌面应用。目标用户是学习 开源项目的开发者。核心理念："像浏览 Google Maps 一样探索源代码"。

### 最终交付物
- macOS `.dmg` 或 `.app` 安装包
- 使用 Xcode + SwiftUI 构建，纯原生，无 WebView / Electron
- 目标系统：macOS 14 Sonoma+

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 平台 | macOS 14+ |
| IDE | Xcode 16+ |
| 语言 | Swift 6 |
| UI 框架 | SwiftUI |
| 数据持久化 | SQLite（GRDB.swift 或 SQLite.swift） |
| 文件系统 | Foundation FileManager |
| 代码解析 | tree-sitter（Swift Package Manager 引入）或正则引擎 |
| 代码高亮 | SwiftUI 自定义 Text 或 SourceEditor (GitHub: chimehq) |
| AI 集成 | URLSession + DeepSeek API |
| 图表/图谱 | Swift Charts / Canvas / SpriteKit |
| Markdown | AttributedString + Markdown 渲染（SwiftUI 原生支持） |
| 图标 | SF Symbols + 自定义 SVG → PDF 矢量图标 |
| 持久化 | UserDefaults / SQLite |
| 打包 | Xcode Archive → Organizer → .dmg |

---

## 项目结构

```
CodeAtlas/
├── CodeAtlas.xcodeproj
├── CodeAtlas/
│   ├── App/
│   │   ├── CodeAtlasApp.swift              # @main 入口
│   │   └── AppDelegate.swift               # 生命周期管理
│   ├── Models/
│   │   ├── Project.swift                    # 项目模型（Codable, Identifiable）
│   │   ├── FileNode.swift                   # 文件树节点
│   │   ├── Symbol.swift                     # 符号（函数/结构体/宏）
│   │   ├── IncludeEdge.swift                # Include 关系
│   │   ├── CallEdge.swift                   # 调用关系
│   │   ├── StructEdge.swift                 # 结构体依赖
│   │   ├── AICache.swift                    # AI 缓存
│   │   └── Theme.swift                      # 主题模型
│   ├── Database/
│   │   ├── DatabaseManager.swift            # SQLite 连接管理（GRDB 迁移）
│   │   ├── ProjectRepository.swift          # 项目 CRUD
│   │   └── SchemaMigration.swift            # 自动迁移
│   ├── Parser/
│   │   ├── ParserEngine.swift               # 解析引擎入口
│   │   ├── CRegexParser.swift               # 正则 C 解析器
│   │   └── TreeSitterParser.swift           # tree-sitter 解析器（可选）
│   ├── API/
│   │   ├── AIService.swift                  # DeepSeek API 封装
│   │   └── FileImportService.swift          # 文件导入服务
│   ├── Views/
│   │   ├── ContentView.swift                # 根视图（项目列表/详情路由）
│   │   ├── ProjectList/
│   │   │   ├── ProjectListView.swift        # 项目卡片网格
│   │   │   ├── ProjectCardView.swift        # 单个项目卡片
│   │   │   ├── CreateProjectSheet.swift     # 导入弹窗（Sheet）
│   │   │   └── ImportMethodPicker.swift     # 导入方式选择
│   │   ├── Workspace/
│   │   │   ├── WorkspaceView.swift          # 三栏主布局（NavigationSplitView）
│   │   │   ├── ToolbarView.swift            # 顶部工具栏
│   │   │   ├── StatusBarView.swift          # 底部状态栏
│   │   │   └── KeyboardShortcutOverlay.swift # 快捷键帮助覆盖层
│   │   ├── FileTree/
│   │   │   ├── FileTreeView.swift           # 文件树（OutlineGroup）
│   │   │   └── FileTreeRow.swift            # 递归树行
│   │   ├── CodeViewer/
│   │   │   ├── CodeViewerView.swift         # 代码查看器
│   │   │   └── SyntaxHighlighter.swift      #  语法高亮
│   │   ├── Graphs/
│   │   │   ├── MicroGraphView.swift         # 微观图谱（核心）
│   │   │   ├── ArchitectureTreeView.swift   # 架构脑图树
│   │   │   └── CallChainView.swift          # 调用链
│   │   ├── AIPanel/
│   │   │   ├── AIPanelView.swift            # AI 知识面板
│   │   │   ├── MarkdownView.swift           # Markdown 渲染
│   │   │   └── MermaidView.swift            # Mermaid 渲染（WebView 桥接或本地）
│   │   ├── Search/
│   │   │   └── CommandPaletteView.swift     # 命令面板搜索
│   │   ├── Trace/
│   │   │   └── TracePanelView.swift         # 执行流追踪
│   │   └── Settings/
│   │       ├── SettingsView.swift           # 设置窗口
│   │       └── ThemePickerView.swift        # 主题选择器
│   ├── ViewModels/
│   │   ├── ProjectListViewModel.swift
│   │   ├── WorkspaceViewModel.swift         # 三栏布局状态
│   │   ├── FileTreeViewModel.swift
│   │   ├── CodeViewerViewModel.swift
│   │   ├── GraphViewModel.swift
│   │   └── AIPanelViewModel.swift
│   └── Resources/
│       ├── Assets.xcassets                  # 图标/图片资源
│       ├── Themes/
│       │   └── ThemePresets.swift           # 5 套预设主题
│       └── Info.plist
└── CodeAtlasTests/
    └── ...                                  # 单元测试
```

---

## 功能清单

### 1. 项目管理

| 功能 | SwiftUI 实现 |
|------|-------------|
| 项目列表首页 | `NavigationSplitView` + `LazyVGrid` 卡片网格 |
| 新建项目 | `Sheet` 弹出，三种导入方式 Tab 切换 |
| 打开本地文件夹 | `NSOpenPanel` 选择目录 → 递归读取文件 |
| Git Clone | `Process` 调用系统 `git clone` |
| 上传 ZIP | `NSOpenPanel` 选择 `.zip` → 系统 API 解压 |
| 删除项目 | `.alert()` 二次确认 → 删除 DB 记录 + 源文件目录 |
| 解析进度 | `ProgressView` 进度条 + 状态文字 |
| 解析状态 | 待解析/解析中/已解析/失败（显示错误 + 重试按钮） |

### 2. 三栏工作区 (NavigationSplitView)

```swift
NavigationSplitView {
    FileTreeView()      // 侧栏：文件树
} content: {
    TabView {           // 中间：代码/图谱/架构
        CodeViewerView()
        MicroGraphView()
        ArchitectureTreeView()
    }
} detail: {
    AIPanelView()       // 详情：AI Insights
}
```

- 分隔线可拖拽（`NavigationSplitView` 原生支持）
- 侧栏/详情栏可折叠（`.navigationSplitViewColumnWidth()`）
- 所有面板状态持久化到 `UserDefaults`

### 3. 文件树

- `OutlineGroup` / `List` + `DisclosureGroup` 递归展开/折叠
- 内联 `SearchField` 过滤
- 文件类型图标：使用 SF Symbols（`doc.text`、`doc.plaintext`、`gearshape`）
- 收藏夹分组（⭐ 标记，`contextMenu` 操作）
- 目录节点显示子文件函数总数 badge

### 4. 代码查看器 (CodeViewer)

- C 语法高亮：使用 `SourceEditor` 或自定义 `AttributedString` 高亮器
- 函数悬浮提示：`onHover` 弹出 `popover` 显示签名 + 描述
- 选中代码 `Cmd+E` → AI 解释（右侧详情栏切换为解释视图，`Text` 流式显示）
- 右键菜单：`.contextMenu { ... }`
- 行号显示、当前行高亮
- 主题跟随全局 `@AppStorage` 主题变量

### 5. 微观图谱 (MicroGraphView) — 核心功能

以当前文件为中心的三列分栏图：

| 区域 | 内容 |
|------|------|
| 中心列 | 文件内函数（按调用深度排序，被外部调用的标 ▲ export） |
| 左翼 | 外部调用者（紫色虚线框，谁调用了本文件的函数） |
| 右翼 | 外部依赖（琥珀色矩形，include 的文件 + 调用的外部函数） |

**实现方案：**
- **方案 A**：`Canvas` + `TimelineView` 自定义绘制（推荐）
  - 节点用 `Path` 绘制圆形/矩形/六边形
  - 连线用 `Path` + `strokeBorder`
  - `DragGesture` 拖拽，`MagnificationGesture` 缩放
- **方案 B**：`SpriteKit` 力导向布局
- **方案 C**：`SceneKit` 3D 力导向图

| 节点类型 | 视觉 | SwiftUI 实现 |
|----------|------|-------------|
| 入口 API 函数 | 蓝色双层同心圆 | `Circle().strokeBorder().overlay(Circle())` |
| 内部辅助函数 | 圆角矩形，热力图着色 | `RoundedRectangle().fill()` |
| 数据结构 | 橙色六边形 | `Path` 六边形 |
| 外部调用者 | 紫色虚线框 | `RoundedRectangle().stroke(style: StrokeStyle(dash: [4]))` |
| 外部依赖 | 琥珀色矩形 | `RoundedRectangle().fill()` |

**交互：**
- `onTapGesture` 聚焦节点
- 双击跳转源码
- `MagnificationGesture` 缩放
- `DragGesture` 平移
- 右上角「外部联网」Toggle 开关

### 6. 架构脑图树

- `ScrollView` + 递归 `DisclosureGroup` + 连接线
- 顶级目录节点标注功能说明
- 默认折叠，点击展开
- 连接线用 `Path` 绘制竖线和横线

### 7. AI 知识面板

- 选中文件后调 DeepSeek API → `ObservableObject` 更新
- 卡片式布局：概要 → 通俗解释 → 核心函数 → 前置知识 → 流程图 → 相关文件 → FAQ
- 结果缓存到 SQLite，`FileManager` 检查缓存时间
- 底部 `TextField` + Send `Button` 支持 AI 问答
- 选中代码解释模式：显示代码片段 + 流式渲染 AI 解释
- Markdown 渲染：`Text(.init(markdownString))` 原生支持

### 8. 全局搜索 (Cmd+K)

- 命令面板 `Overlay` + `SearchField`
- 模糊匹配文件名 + 函数名 + 结构体
- 结果分组：Files / Functions / Structs
- 选中 → `NavigationPath` 定位并跳转

### 9. 执行流追踪

- 底部 `HStack` + `ScrollView` 面板
- 面包屑 `ScrollView(.horizontal)` + `Button` 跳转
- 伪代码 `Text` + 源码片段
- 上一步/下一步 `Button` + 自动跟随 `Toggle`

### 10. 主题系统

- 5 套预设：织物/暗色/亮色/森林/海洋
- 自定义颜色：6 个可调项，`ColorPicker` + `TextField`
- 持久化到 `@AppStorage`
- 全局 `@Environment(\.colorScheme)` + 自定义 `Color` 扩展
- SwiftUI 自动响应主题变化（无需手动刷新）

### 11. 快捷键

| 快捷键 | 功能 |
|--------|------|
| `⌘K` | 全局搜索 |
| `⌘1/2/3` | 切换代码/图谱/架构视图 |
| `⌘B` | 折叠侧栏 |
| `⌘J` | 折叠详情栏 |
| `⌘E` | AI 解释选中代码 |
| `⌘G` | 跳转到行 |
| `⌘⇧F` | 文件内搜索 |
| `?` | 快捷键帮助覆盖层 |

---

## 数据架构

### 数据库 (GRDB.swift / SQLite.swift)

**推荐使用 GRDB.swift：**

```swift
import GRDB

// 连接
let dbQueue = try DatabaseQueue(path: dbPath)

// 迁移
var migrator = DatabaseMigrator()
migrator.registerMigration("v1") { db in
    try db.create(table: "projects") { t in
        t.autoIncrementedPrimaryKey("id")
        t.column("name", .text).notNull()
        t.column("source_path", .text).notNull()
        t.column("source_type", .text).notNull().defaults(to: "local")
        t.column("parse_status", .text).defaults(to: "pending")
        t.column("parse_progress", .integer).defaults(to: 0)
        t.column("parse_error", .text)
    }
    // ... 其余表
}
try migrator.migrate(dbQueue)
```

**6 张表**：`projects`、`files`（`UNIQUE(project_id, path)`）、`symbols`、`includes`、`calls`、`struct_deps`、`ai_cache`

**数据层用 `async/await`：**
```swift
func listProjects() async throws -> [Project] {
    try await dbQueue.read { db in
        try Project.fetchAll(db)
    }
}
```

### 解析引擎 (ParserEngine)

- **Swift 原生正则引擎**（`Regex` / `NSRegularExpression`）
- 提取 `#include`、函数定义（ANSI C + K&R C）、结构体、宏、typedef
- 提取函数体内调用关系
- **可选**：集成 tree-sitter 作为 Swift Package

### 文件导入

```swift
let panel = NSOpenPanel()
panel.canChooseDirectories = true
panel.canChooseFiles = false
if panel.runModal() == .OK {
    let url = panel.url!
    let files = FileManager.default
        .enumerator(at: url, includingPropertiesForKeys: nil)?
        .compactMap { $0 as? URL }
        .filter { $0.pathExtension == "c" || $0.pathExtension == "h" }
    // 读取内容 → 写入 DB
}
```

---

## 数据流

```
NSOpenPanel 选择文件夹
  → FileManager 递归读取文件
  → ParserEngine 正则解析
  → GRDB 写入 SQLite
  → @Observable ViewModel 响应式更新
  → SwiftUI 自动重绘 UI
```

---

## 视图路由

```swift
struct ContentView: View {
    @State private var selectedProject: Project?
    
    var body: some View {
        if let project = selectedProject {
            WorkspaceView(project: project)
                .toolbar {
                    ToolbarItem(placement: .navigation) {
                        Button { selectedProject = nil } label: {
                            Label("返回", systemImage: "chevron.left")
                        }
                    }
                }
        } else {
            ProjectListView(selectedProject: $selectedProject)
        }
    }
}
```

---

## AI 服务封装

```swift
struct AIService {
    let apiKey: String
    let baseURL: String
    let model: String
    
    func chat(messages: [ChatMessage]) async throws -> String {
        var request = URLRequest(url: URL(string: "\(baseURL)/v1/chat/completions")!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(RequestBody(
            model: model,
            messages: messages,
            temperature: 0.3
        ))
        let (data, _) = try await URLSession.shared.data(for: request)
        let response = try JSONDecoder().decode(ChatResponse.self, from: data)
        return response.choices.first?.message.content ?? ""
    }
    
    func streamChat(...) -> AsyncThrowingStream<String, Error> {
        // 使用 URLSession.bytes 实现流式响应
    }
}
```

---

## 打包发布

### 构建流程

1. Xcode → Product → Archive（选择 `My Mac` 目标）
2. Organizer → Distribute App → Copy App
3. 手动创建 DMG：`hdiutil create -srcfolder CodeAtlas.app CodeAtlas.dmg`

### 或使用自动化脚本

```bash
xcodebuild -project CodeAtlas.xcodeproj -scheme CodeAtlas archive \
  -archivePath ./build/CodeAtlas.xcarchive
# 导出 .app
# 创建 .dmg
```

### 签名与公证（发布用）

```bash
codesign --deep --force --verify --verbose \
  --sign "Developer ID Application: Your Name" \
  CodeAtlas.app
xcrun notarytool submit CodeAtlas.dmg \
  --apple-id your@email.com --team-id XXXXXX --wait
xcrun stapler staple CodeAtlas.dmg
```

---

## 关键技术决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 数据库 | GRDB.swift | Swift 原生、类型安全、异步支持、自动迁移 |
| 图谱 | Canvas + 自定义绘制 | 纯 SwiftUI，无需 WebView/JS 桥接 |
| 代码高亮 | SourceEditor 或 AttributedString | 原生方案，无 WebView |
| Mermaid | WebView(WKWebView) 桥接或本地 JSContext | Mermaid 无纯 Swift 实现 |
| 文件夹选择 | NSOpenPanel | macOS 原生 API |
| 持久化 | UserDefaults + GRDB | 小配置用 UserDefaults，大数据用 GRDB |
