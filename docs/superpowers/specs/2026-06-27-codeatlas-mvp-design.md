# CodeAtlas MVP 设计规格

## 概述

交互式源码知识地图平台 MVP，聚焦 Linux Kernel 0.21 源码。像浏览 Google Maps 一样探索源代码。

## 目标用户

学习大型开源项目的开发者，首期目标项目：Linux Kernel 0.21。

## 技术决策

| 维度 | 决策 |
|------|------|
| 框架 | Next.js 16 (App Router) + TypeScript |
| 样式 | Tailwind CSS + shadcn/ui |
| 图谱 | ReactFlow |
| 代码编辑器 | Monaco Editor (只读) |
| 状态管理 | Zustand |
| 流程图 | mermaid |
| 数据来源 | 静态预构建 JSON（tree-sitter 解析脚本生成） |
| 后端 | 无，架构预留 API 接口 |
| AI 面板 | 做，Mock 数据 |
| 项目结构 | 单一 Next.js 应用 |

## MVP 功能范围

1. 文件树 + Monaco 代码查看
2. Include 关系图（ReactFlow）
3. 基本搜索（文件 + 函数名）
4. AI 知识面板（Mock 数据）
5. 调用链视图
6. 模块地图

## 项目结构

```
codeatlas/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx          # 三栏布局容器（可拖拽调节）
│   │   │   └── SearchBar.tsx         # 顶部 Cmd+K 搜索
│   │   ├── file-tree/
│   │   │   ├── FileTree.tsx          # 左侧文件树
│   │   │   └── FileTreeNode.tsx      # 递归树节点
│   │   ├── code-viewer/
│   │   │   └── CodeViewer.tsx        # Monaco 编辑器封装
│   │   ├── graphs/
│   │   │   ├── IncludeGraph.tsx      # include 关系图（ReactFlow）
│   │   │   ├── CallChain.tsx         # 调用链视图
│   │   │   └── ArchitectureMap.tsx   # 模块地图
│   │   ├── ai-panel/
│   │   │   ├── AIPanel.tsx           # 右侧 AI 面板
│   │   │   ├── FileSummary.tsx       # 文件总结卡片
│   │   │   └── FunctionList.tsx      # 关键函数列表
│   │   ├── search/
│   │   │   └── GlobalSearch.tsx      # 全局搜索弹窗（Command Palette）
│   │   └── ui/                       # shadcn/ui 组件
│   ├── store/
│   │   └── index.ts                  # Zustand store
│   ├── lib/
│   │   ├── types.ts                  # 共享类型
│   │   ├── data-loader.ts            # 加载静态 JSON
│   │   └── graph-utils.ts            # 图谱数据转换
│   └── data/                         # 预构建静态 JSON
│       ├── files.json
│       ├── symbols.json
│       ├── includes.json
│       ├── calls.json
│       ├── architecture.json
│       └── ai-mock/                  # Mock AI 数据
├── scripts/
│   ├── download-kernel.sh            # 下载 Linux 0.21 源码
│   └── parse.ts                      # tree-sitter 解析 → 生成 JSON
├── public/
│   └── kernel-source/                # Linux 0.21 源码文件（按需服务）
└── ...
```

## 数据流

```
解析脚本 (scripts/parse.ts)
  ↓ 离线生成
app/data/*.json
  ↓ 前端动态 import (代码分割)
Zustand Store
  ↓ 订阅
React 组件
```

- 预构建 JSON 放在 `app/data/`，前端用动态 `import()` 按需加载
- 源码文件放在 `public/kernel-source/`，Monaco 通过 fetch 读取
- 架构预留 async loader 接口，后续可切换为 API 调用

## Zustand Store

```typescript
interface AppStore {
  // 文件树
  files: FileNode[]
  expandedDirs: Set<string>
  selectedFile: string | null
  toggleDir(path: string): void
  selectFile(path: string): void

  // 中间视图
  activeView: 'code' | 'graph' | 'callchain' | 'architecture'
  setActiveView(view: string): void

  // AI 面板
  selectedEntity: { type: 'file' | 'function'; path: string; name: string } | null

  // 搜索
  searchOpen: boolean
  searchQuery: string
  searchResults: SearchResult[]
  setSearchOpen(open: boolean): void
}
```

## 核心数据类型

| 类型 | 关键字段 |
|------|----------|
| `FileNode` | `name, path, type, children?, symbols?` |
| `Symbol` | `name, kind (function/struct/macro/typedef), file, line, signature?` |
| `IncludeEdge` | `from, to` |
| `CallEdge` | `caller, callee, callerFile, calleeFile` |
| `ArchNode` | `name, children?, files?, description?` |
| `MockAI` | `filePath, summary, plainExplanation, keyFunctions[], prerequisites[], relatedFiles[], mermaid?` |

## 组件规格

### 三栏布局 (AppShell)

- 左栏 280px，右栏 380px，中间自适应
- 分隔线可拖拽调节宽度
- 左右栏可折叠
- 暗色主题：`bg-neutral-950` + `border-neutral-800`

### 文件树 (FileTree)

- 递归渲染，展开/折叠
- 内联搜索过滤
- 函数数量徽章
- 当前选中文件高亮

### 代码查看器 (CodeViewer)

- Monaco Editor 只读模式，C 语法高亮
- 行号 + 可开关的 annotation
- 点击函数名定位到 AI 面板

### Include 图谱 (IncludeGraph)

- 当前文件为中心，展示 include 关系
- 点击节点展开邻居
- 右键菜单
- 缩放 + 平移

### 调用链 (CallChain)

- 树形 callers/callees
- 逐层展开
- 搜索跳转
- 紧凑/全展开模式

### 架构地图 (ArchitectureMap)

- 三层 drill-down：子系统 → 模块 → 文件
- 卡片网格 → 列表 → 代码
- 面包屑导航

### 全局搜索 (SearchBar)

- Cmd+K 弹窗
- 模糊匹配文件 + 函数
- 结果分组：Files / Functions / Structs
- 选中自动切换视图

### AI 面板 (AIPanel)

- 选中文件/函数展示
- 卡片：总结 → 小白解释 → 关键函数 → 前置知识 → Mermaid 流程图
- 底部预留 RAG 问答输入框

## 视图切换

中间区域顶部 Tab 栏：[代码] [Include图] [调用链] [架构图]

点击切换，只渲染当前激活视图，未激活时保留 DOM（保持滚动位置等）。

## 非功能要求

- 暗色主题，极简风格
- 响应式布局（桌面优先，移动端可降级）
- 键盘快捷键：Cmd+K (搜索), Cmd+B (折叠左栏), Cmd+J (折叠右栏)
- 数据按需加载，不进入首屏 bundle

## 不做的（MVP 外）

- 后端 API（FastAPI、PostgreSQL、pgvector）
- 真实 LLM 集成（仅 Mock）
- 笔记系统
- 学习模式、打卡、收藏
- 多项目支持（只做 Linux 0.21）
- 插件系统
