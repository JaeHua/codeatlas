# CodeAtlas 项目构建提示词

## 项目概述

构建一个名为 **CodeAtlas** 的交互式源码知识地图桌面应用。目标用户是学习大型 C/C++ 开源项目的开发者。核心理念："像浏览 Google Maps 一样探索源代码"。

### 最终交付物
- macOS `.dmg` 安装包（18MB）
- 使用 Tauri v2 + Next.js 16 构建
- 系统需安装 Node.js（运行时通过 login shell 自动检测 nvm/fnm/homebrew 路径）

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Tauri v2 (Rust)，系统 WKWebView |
| 前端 | Next.js 16 (App Router)，React 19，TypeScript |
| 样式 | Tailwind CSS v4，shadcn/ui |
| 状态管理 | Zustand（persist 中间件） |
| 图可视化 | ReactFlow (@xyflow/react) |
| 代码编辑器 | Monaco Editor (@monaco-editor/react) |
| 流程图 | Mermaid |
| Markdown 渲染 | react-markdown + remark-gfm |
| 数据库 | sql.js（纯 JS/WASM SQLite，零原生依赖） |
| 解析引擎 | 正则表达式 C 语言解析器 |
| AI 集成 | DeepSeek API（OpenAI 兼容） |
| 图标 | Lucide React |
| 持久化 | Zustand persist → localStorage |

---

## 项目结构

```
codeatlas/
├── app/
│   ├── api/projects/                    # REST API Routes
│   │   ├── route.ts                      # GET 列表 / POST 创建
│   │   └── [id]/
│   │       ├── route.ts                  # GET 详情 / DELETE 删除
│   │       ├── files/route.ts            # GET 文件树
│   │       ├── symbols/route.ts          # GET 符号表
│   │       ├── source/route.ts           # GET 源码内容
│   │       ├── graph/route.ts            # GET 图谱数据
│   │       ├── parse/route.ts            # POST 触发解析
│   │       ├── import-local/route.ts     # POST 本地文件导入
│   │       ├── import-zip/route.ts       # POST ZIP 导入
│   │       ├── ai-explain/route.ts       # POST AI 生成文件解释
│   │       ├── ai-chat/route.ts          # POST AI 问答
│   │       └── ai-describe/route.ts      # POST AI 图谱描述
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx              # 三栏主布局
│   │   │   ├── SearchBar.tsx             # 顶部搜索栏 (Cmd+K)
│   │   │   ├── SettingsDialog.tsx        # API 配置 + 主题设置
│   │   │   ├── KeyboardShortcuts.tsx     # 快捷键帮助面板 (?)
│   │   │   ├── Logo.tsx                  # SVG Logo
│   │   │   └── ClientLayout.tsx          # 客户端布局包裹
│   │   ├── file-tree/
│   │   │   ├── FileTree.tsx              # 文件树（收藏 + 过滤）
│   │   │   └── FileTreeNode.tsx          # 递归树节点
│   │   ├── code-viewer/
│   │   │   └── CodeViewer.tsx            # Monaco 编辑器
│   │   ├── graphs/
│   │   │   ├── FileGraph.tsx             # 微观图谱（核心）
│   │   │   ├── ArchitectureMap.tsx       # 架构脑图树
│   │   │   └── CallChain.tsx             # 调用链视图
│   │   ├── ai-panel/
│   │   │   ├── AIPanel.tsx               # AI 知识面板
│   │   │   ├── MermaidDiagram.tsx        # Mermaid 渲染
│   │   │   └── MarkdownRenderer.tsx      # Markdown 渲染
│   │   ├── trace/
│   │   │   └── TracePanel.tsx            # 执行流追踪面板
│   │   └── theme/
│   │       ├── ThemeProvider.tsx         # 主题 CSS 变量注入
│   │       └── ThemePicker.tsx           # 主题选择器
│   ├── store/
│   │   ├── index.ts                      # 主 Zustand Store
│   │   ├── settings.ts                   # API 设置 Store
│   │   └── theme.ts                      # 主题 Store
│   ├── lib/
│   │   ├── db.ts                         # SQLite 封装层（sql.js）
│   │   ├── types.ts                      # TypeScript 类型
│   │   ├── data-api.ts                   # 前端 API 调用层
│   │   ├── ai-api.ts                     # DeepSeek API 封装
│   │   └── themes.ts                     # 主题预设定义
│   ├── page.tsx                          # 项目列表首页
│   └── project/[id]/page.tsx             # 项目详情页
├── scripts/
│   └── parse-project.ts                  # 独立解析脚本（正则 C 解析器）
├── src-tauri/                            # Tauri Rust 代码
│   ├── src/lib.rs                        # 服务启动 + 窗口创建
│   ├── src/main.rs                       # 入口
│   ├── tauri.conf.json                   # Tauri 配置
│   └── icons/                            # 应用图标
├── public/
│   └── favicon.svg                       # 浏览器图标
├── dist/                                 # Tauri frontendDist 占位
├── server-dist/                          # Next.js standalone 输出（gitignore）
└── package.json
```

---

## 功能清单

### 1. 项目管理

| 功能 | 实现 |
|------|------|
| 项目列表首页 | `app/page.tsx` — 卡片网格，显示名称/路径/解析状态/来源类型 |
| 新建项目 | 三种导入方式：打开本地文件夹（webkitdirectory）、Git Clone（execSync git clone）、上传 ZIP（后端解压） |
| 删除项目 | 二次确认弹窗，删除 DB 记录 + 清理源文件目录 |
| 解析状态 | 待解析/解析中（进度条）/已解析/失败（显示错误 + 重试按钮） |

### 2. 三栏工作区 (AppShell)

```
┌──────────┬────────────────────┬──────────────┐
│ 文件树    │ 代码/图谱/架构      │ AI Insights  │
│ (可拖拽)  │ (Tab 切换)         │ (可折叠)     │
├──────────┴────────────────────┴──────────────┤
│ 顶部: 搜索栏 (Cmd+K) + 返回按钮 + 设置齿轮   │
├──────────────────────────────────────────────┤
│ 底部: TracePanel (执行流追踪) + 状态栏        │
└──────────────────────────────────────────────┘
```

- 左右面板可拖拽调节宽度，显示 px 数值
- 左右面板可折叠
- 所有面板状态持久化到 localStorage

### 3. 文件树

- 递归展开/折叠，支持内联搜索过滤
- 文件类型图标：`.c`/`.h`/`.S` 使用不同图标
- 收藏夹分组（⭐ 标记，hover 显示操作按钮）
- 目录节点显示子文件函数总数 badge

### 4. 代码编辑器 (Monaco)

- C 语法高亮，只读模式
- 函数悬浮提示（HoverProvider，从 symbols 表读取描述）
- 选中代码 `Cmd+E` → AI 解释（右侧面板切换为解释视图，流式渲染）
- 右键菜单：追踪执行流、AI 解释
- 缩进引导线、括号匹配、行号跳转
- 主题动态跟随全局主题变化

### 5. 微观图谱 (FileGraph) — 核心功能

以当前文件为中心的三列分栏图：

| 区域 | 内容 |
|------|------|
| 中心列 | 文件内函数（按调用深度排序，被外部调用的标 ▲ export） |
| 左翼 | 外部调用者（紫色虚线框，谁调用了本文件的函数） |
| 右翼 | 外部依赖（琥珀色矩形，include 的文件 + 调用的外部函数） |

- **节点类型**：入口 API 函数（蓝色双层同心圆）、内部函数（圆角矩形，热力图着色）、结构体（橙色六边形）、外部调用者（紫色虚线）、外部依赖（琥珀色）
- **连线类型**：内部调用（蓝色实线箭头）、外部入向（紫色发光）、外部出向（绿色虚线）、数据流（橙色虚线）
- **热力图**：函数节点颜色随被调用频次变化
- **外部联网开关**：关闭后隐藏外部节点，只展示文件内部结构
- **聚焦模式**：点击节点高亮关联邻居
- 点击函数名 → 跳转 Monaco 源码对应行

### 6. 架构脑图树 (ArchitectureMap)

- ReactFlow 树形脑图，根节点 = 项目名
- 一级目录节点标注功能说明（如 `kernel — 进程调度、系统调用`）
- 默认折叠，点击展开子节点
- 平滑连接线（smoothstep）
- 点击文件节点打开源码

### 7. AI 知识面板 (AIPanel)

- 选中文件后自动调 DeepSeek API 生成：概要、通俗解释、核心函数列表、前置知识、Mermaid 流程图、相关文件、常见问题 FAQ
- 结果缓存到 SQLite，避免重复请求
- 底部输入框支持 AI 问答（上下文自动包含文件源码）
- 选中代码解释模式：右侧切换为代码片段 + AI 流式解释
- Markdown 渲染所有 AI 输出

### 8. 全局搜索 (Cmd+K)

- 命令面板风格弹窗
- 模糊匹配文件名 + 函数名 + 结构体
- 结果分组：Files / Functions / Structs / Macros
- 选中 → 定位文件并跳转源码

### 9. 执行流追踪 (TracePanel)

- 右键函数 →「追踪执行流」
- 底部面板展开：面包屑路径 + 伪代码 + 源码片段 + 上/下一步导航
- 自动跟随模式：点击调用自动推进
- 面包屑支持快速跳回任意步骤

### 10. 主题系统

- 5 套预设主题：织物/暗色/亮色/森林/海洋
- 自定义颜色：背景色、前景色、强调色、辅助文字、边框色、面板色
- 取色器 + 手动输入 HEX
- 持久化到 localStorage
- Monaco 编辑器实时跟随主题变化
- 首屏内联 `<script>` 零闪烁

### 11. 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Cmd+K` | 全局搜索 |
| `Cmd+1/2/3` | 切换代码/图谱/架构视图 |
| `Cmd+B` | 折叠左面板 |
| `Cmd+J` | 折叠右面板 |
| `Cmd+E` | AI 解释选中代码 |
| `Cmd+G` | 跳转到行 |
| `Cmd+Shift+F` | 文件内搜索 |
| `Cmd+Shift+T` | 快速追踪光标下函数 |
| `?` | 快捷键帮助面板 |

---

## 后端架构

### 数据库 (sql.js)

6 张表：`projects`、`files`（含 `UNIQUE(project_id, path)`）、`symbols`、`includes`、`calls`、`struct_deps`、`ai_cache`、`schema_version`

- 所有操作异步，使用 `prepare().bind().step().getAsObject()` 模式
- `INSERT/UPDATE/DELETE` 后自动 `saveDb()` 持久化到磁盘
- 自动 schema 迁移（`schema_version` 表检测）

### 解析引擎 (scripts/parse-project.ts)

- 独立 Node.js 脚本，API Route 通过 `execSync` 同步调用
- 正则表达式提取：
  - `#include <...>` / `#include "..."`
  - ANSI C 和 K&R 风格函数定义
  - 结构体定义 + 字段依赖
  - 宏定义 / typedef
  - 函数体内调用关系（词法分析级别的简单括号匹配）

### API 路由

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/projects` | 项目列表 |
| POST | `/api/projects` | 创建项目 |
| DELETE | `/api/projects/:id` | 删除项目（清理源文件） |
| GET | `/api/projects/:id/files` | 文件树 |
| GET | `/api/projects/:id/symbols` | 符号列表 |
| GET | `/api/projects/:id/source?file=path` | 源码内容 |
| GET | `/api/projects/:id/graph` | 图谱数据 |
| POST | `/api/projects/:id/parse` | 触发解析（同步返回结果） |
| POST | `/api/projects/:id/import-local` | JSON 格式导入文件 |
| POST | `/api/projects/:id/import-zip` | ZIP 上传解压 |
| POST | `/api/projects/:id/ai-explain` | AI 生成文件解释（带缓存） |
| POST | `/api/projects/:id/ai-chat` | AI 问答 |
| POST | `/api/projects/:id/ai-describe` | AI 图谱节点描述 |

---

## 桌面打包 (Tauri)

### 架构
```
Tauri (Rust) → 启动 Node.js 子进程 → 运行 Next.js 服务端 → WKWebView 加载 localhost:3456
```

### 关键配置

**src-tauri/tauri.conf.json:**
```json
{
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:3456"
  },
  "app": {
    "windows": []  // 程序化创建窗口
  },
  "bundle": {
    "resources": {
      "../server-dist": "server"  // 打包 Next.js standalone
    }
  }
}
```

**src-tauri/Cargo.toml:**
```toml
tauri = { version = "2.11.3", features = ["devtools"] }
reqwest = { version = "0.12", features = ["blocking"] }
```

### Rust 启动流程 (lib.rs)
1. `find_node()` — 依次尝试 `/opt/homebrew/bin/node`、`/usr/local/bin/node`、login shell `which node`、nvm 路径
2. `kill_existing_server()` — 杀掉占用 3456 端口的旧进程
3. `spawn_server()` — 启动 `node server.js`，设置 `APP_DATA_PATH` 环境变量
4. `wait_for_server()` — 轮询 `http://localhost:3456` 最多 30 秒
5. 创建 `WebviewWindow` 指向服务器 URL
6. 窗口关闭时 kill 子进程

### 构建命令

```bash
npm run build          # Next.js standalone + 复制静态资源
cargo tauri build --target aarch64-apple-darwin
```

**npm run build 流程：**
1. `rm -rf server-dist`
2. `next build`（output: standalone）
3. `cp -R .next/standalone/. server-dist/`（含隐藏文件 .next）
4. `cp -R .next/static server-dist/.next/static`（JS/CSS/字体）
5. `cp sql-wasm.wasm` 到正确路径
6. 生成 `dist/index.html` 占位

---

## 数据流

```
用户选择文件夹 → webkitdirectory 读取文件
  → 前端 JSON 序列化 → POST /api/projects（创建）
  → POST /api/projects/:id/import-local（上传文件内容 + 目录结构）
  → POST /api/projects/:id/parse（execSync 调解析脚本）
  → 正则提取 → 写入 sql.js DB
  → 前端跳转 /project/:id
  → API 拉取文件树/符号/图谱 → Zustand Store → 渲染 UI
```

---

## 关键注意事项

1. **sql.js 限制**：不支持 `DEFAULT (datetime('now'))` 等非常量默认值；需要用 `prepare().bind().step()` 而非 `run(params)`；`last_insert_rowid()` 可能返回 0，改用 `SELECT MAX(id)`
2. **Tauri 打包**：`.next/` 开头的隐藏目录需用 `cp -R dir/.` 方式复制；WKWebView 的 `FormData` + `Blob` 兼容性差，改用 JSON 传输
3. **WKWebView 兼容**：`new File()` 可能抛 SyntaxError，用 `new Blob()` 替代；CSP 需完全开放
4. **Node.js 检测**：macOS .app 的 PATH 不含 Homebrew/nvm 路径，需通过 login shell 探测
5. **Monaco 主题**：通过 `buildMonacoTheme()` 从 Zustand 主题变量动态生成，`useLayoutEffect` 同步应用
6. **端口冲突**：每次启动前 `lsof -ti:3456 | xargs kill -9`
