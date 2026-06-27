
# CodeAtlas — 交互式源码知识地图平台

## 一句话

像浏览 Google Maps 一样探索源代码 —— VSCode + Obsidian + Sourcegraph + DeepWiki 的结合体。

## 目标用户

学习大型开源项目（Linux Kernel、Redis、MySQL、PostgreSQL、Nginx、LLVM 等）的开发者。

## 核心理念

> 不是单纯展示文件树，而是构建「源码地图」，让用户以可视化方式理解复杂代码仓库。

---

## 功能全景

### 1. 文件树视图（Explorer）

左侧展示完整目录结构。

- 展开/折叠目录
- 搜索文件
- 收藏节点（Pin）
- 最近浏览记录

点击文件后，右侧展示文件画像：

| 维度    | 示例（mm/page_alloc.c）                              |
| ----- | ------------------------------------------------ |
| 文件作用  | Linux 伙伴系统（Buddy System）实现                       |
| 核心结构体 | `struct page`, `struct zone`, `struct free_area` |
| 核心函数  | `alloc_pages()`, `__free_pages()`, `rmqueue()`   |
| 依赖关系  | include 图、调用图                                    |
| 相关文件  | `slab.c`, `mmap.c`, `memblock.c`                 |
| 前置知识  | Page, Zone, Buddy System, NUMA                   |
| 推荐下一步 | `slab.c` → 了解 slab 分配器如何建立在 buddy 之上             |

### 2. 知识图谱视图（Knowledge Graph）

节点 = 文件/函数/结构体/概念。边 = 关系。

支持的边类型：
- `#include` 关系
- 函数调用关系
- `struct` 依赖（嵌套、指针引用）
- 概念关联（手动/LLM 标注）

交互：
- 点击节点 → 高亮邻居
- 展开一层 / 展开三层（类似 Obsidian 局部图谱）
- 隐藏节点 / 过滤边类型
- 缩放 + 平移（force-graph 布局）

### 3. 调用链视图（Call Graph）

以函数为中心展示调用关系：

```
sys_read()
  └─→ ksys_read()
        └─→ vfs_read()
              └─→ new_sync_read()
                    └─→ ext4_file_read_iter()
```

支持：
- 查看调用者（callers）和被调用者（callees）
- 深度展开（逐层、全展开）
- 搜索函数跳转
- 点击跳转源码（Monaco Editor）

### 4. 模块地图（Architecture Map）

将项目抽象为多层级地图，类似 Google Maps 缩放体验：

```
Linux Kernel
├── Process Management
│   ├── Scheduler
│   │   └── sched/core.c → __schedule()
│   ├── fork
│   └── Signals
├── Memory Management
│   ├── Page Allocator → mm/page_alloc.c → alloc_pages()
│   ├── Slab Allocator
│   ├── Page Cache
│   └── Swap
├── Filesystem
│   ├── VFS
│   ├── ext4
│   └── btrfs
├── Network Stack
└── Device Drivers
```

每一步都是 drill-down：**子系统 → 模块 → 文件 → 函数**。

### 5. AI 知识面板

点击任一文件/函数时自动生成：

- **一句话总结** — 这是干什么的
- **小白解释** — LLM 用通俗语言解释
- **核心逻辑** — 关键流程（含 Mermaid 流程图）
- **重点函数** — 优先级排序
- **前置知识** — 阅读前需要知道的
- **推荐下一站** — 学完这个看什么
- **常见问题** — LLM 预设 Q&A
- **调用流程图** — Mermaid 自动生成

问答能力（基于 RAG）：
- "为什么 alloc_pages 会调用 rmqueue？"
- "page cache 和 buddy system 的关系是什么？"
- "fork 为什么需要 mm？"
- "这个函数的锁竞争热点在哪？"

### 6. 学习模式

- **学习路线** — 预设/自定义路径（如 "跟着 Linus 的提交顺序读内核"）
- **阅读进度** — 文件/函数级别完成度
- **知识点打卡** — 读完一个模块打卡
- **笔记系统** — 每文件/函数对应一篇笔记
- **收藏 & 标签** — 自由组织知识
- **依赖关系学习图** — 必须先学 A 才能学 B

### 7. 搜索系统

- 文件搜索（模糊匹配）
- 函数搜索（精确 + 模糊）
- 结构体/宏搜索
- 全文搜索（ripgrep 后端）
- 语义搜索（embedding 向量检索）
- 跳转定义（ctags/clangd）

搜索框类似 Sourcegraph/VSCode Command Palette。

### 8. Markdown 笔记系统

每个文件/函数自动关联一篇笔记，类似 Obsidian：

- 完整 Markdown 支持（含 Mermaid）
- **双向链接** `[[mm/slab.c]]` — 文件间互链
- 标签系统
- **反向引用** — 谁链向了我
- 笔记与源码并排显示

### 9. 多项目支持

预设知识图谱（开箱即用）：,mvp只做Linux 内核代码，版本0.21

- Linux Kernel
- Redis
- Nginx
- MySQL / PostgreSQL
- LLVM / Clang
- Git

支持手动导入任意 C/C++/Rust 项目，自动运行 tree-sitter + ctags 构建图谱。

---

## UI 风格

极简、现代、暗色主题。

参考产品气质：
- VSCode — 编辑器和面板布局
- Linear — 干净的间距和动效
- Cursor — AI 面板集成方式
- Sourcegraph — 搜索 UX
- Obsidian — 图谱和双向链接
- DeepWiki — AI 知识面板的排版

### 布局

```
┌──────────┬────────────────────┬──────────────┐
│          │                    │              │
│  左侧    │     中间区域        │   右侧       │
│  文件树  │   代码/图谱/Mermaid │  AI知识面板   │
│          │                    │              │
│          │                    │              │
├──────────┴────────────────────┴──────────────┤
│              顶部：搜索栏 (Cmd+K)             │
├──────────────────────────────────────────────┤
│              底部：状态栏                      │
└──────────────────────────────────────────────┘
```

---

## 技术栈（推荐）

| 层 | 技术 |
|----|------|
| 前端框架 | Next.js (App Router) |
| 语言 | TypeScript |
| 样式 | Tailwind CSS |
| 组件库 | shadcn/ui |
| 图谱可视化 | ReactFlow / D3-force |
| 代码编辑器 | Monaco Editor |
| 后端 | Python FastAPI |
| 数据库 | PostgreSQL + pgvector（语义搜索） |
| 解析器 | tree-sitter, ctags, clangd |
| AI | OpenAI Compatible API（任意 LLM） |
| 全文搜索 | Elasticsearch / Meilisearch / ripgrep |

---

## 架构设计

### 模块化单体（Modular Monolith）

```
codeatlas/
├── apps/
│   └── web/               # Next.js 前端
├── packages/
│   ├── parser/            # tree-sitter / ctags 解析器
│   ├── graph/             # 知识图谱构建引擎
│   ├── search/            # 搜索服务
│   ├── ai/                # AI 面板 & RAG 服务
│   ├── notes/             # Markdown 笔记引擎
│   └── shared/            # 共享类型 & 工具
├── backend/               # FastAPI 单体后端
│   ├── api/               # REST / WebSocket endpoints
│   ├── core/              # 核心业务逻辑
│   ├── db/                # 数据库模型 & 迁移
│   └── plugins/           # 插件接口（预留）
└── docs/                  # 文档
```

### 插件系统（后期）

预留扩展点：
- 解析器插件（新语言支持）
- 可视化插件（新图谱布局）
- AI 面板插件（自定义 Prompt）
- 学习路线插件

---

## MVP 路线图

### Phase 1 — 核心看板（2-3 周）

- [ ] 文件树 + Monaco 代码查看
- [ ] tree-sitter 解析 C 项目
- [ ] 文件之间 include 关系图（ReactFlow）
- [ ] 基本搜索（文件 + 函数名）

### Phase 2 — 图谱引擎（2-3 周）

- [ ] 函数调用链图谱
- [ ] 知识图谱（节点 + 边）
- [ ] 缩放 / 平移 / 展开 / 隐藏
- [ ] Linux Kernel 知识图谱预构建

### Phase 3 — AI 面板（2 周）

- [ ] 点击文件/函数自动生成总结
- [ ] RAG 问答（pgvector）
- [ ] 调用链 Mermaid 自动生成



### Phase 4 — 多项目 & 打磨（2 周）

- [ ] 预设项目支持（Redis, Nginx, PostgreSQL）
- [ ] 性能优化
- [ ] UI 打磨

### Phase 5 — 插件系统（持续）

- [ ] 插件 SDK
- [ ] 官方插件市场
- [ ] 社区贡献

---

## 相关笔记

- [[Linux内核与操作系统学习路线]] — CodeAtlas 可以成为这条学习路线的载体
- 后续可创建：CodeAtlas 技术选型、CodeAtlas API 设计 等子笔记

## 竞品参考

| 产品 | 借鉴点 | 差异 |
|------|--------|------|
| Sourcegraph | 搜索 + 跳转定义 | CodeAtlas 侧重"地图"式理解而非代码托管 |
| DeepWiki | AI 文档自动生成 | CodeAtlas 更强调图谱可视化和学习路径 |
| Obsidian | 双向链接 + 图谱 | 针对代码仓库定制，而非通用笔记 |
| Cursor | AI 辅助编码 | CodeAtlas 是"阅读"工具，非"编写"工具 |
| CodeSee | 代码可视化 | CodeAtlas 是本地优先的开源方案 |

---

> **设计原则：让开发者像探索一座新城市一样探索代码 —— 先看地图建立方向感，再深入街区了解细节。**
