# CodeAtlas v2 设计规格 — 项目管理式智能源码阅读器

## 概述

从静态 Demo 重构为项目驱动的通用源码阅读工具。支持导入任意 C/C++ 项目，自动解析生成知识图谱，AI 按需生成分析。

## 架构

```
┌─────────────────────────────────────────┐
│               Next.js App               │
│  ┌──────────────┐  ┌──────────────────┐ │
│  │  前端页面     │  │  API Routes      │ │
│  │  /            │──│  /api/projects   │ │
│  │  /project/[id]│  │  /api/parse      │ │
│  │               │  │  /api/ai         │ │
│  └──────────────┘  └────────┬─────────┘ │
│                              │           │
│                     ┌────────▼─────────┐ │
│                     │  SQLite          │ │
│                     │  (better-sqlite3) │ │
│                     └──────────────────┘ │
└─────────────────────────────────────────┘
```

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Next.js App Router, React, Tailwind, shadcn/ui, ReactFlow, Monaco Editor |
| 后端 | Next.js API Routes |
| 数据库 | SQLite (better-sqlite3) |
| 解析 | tree-sitter, tree-sitter-c |
| AI | DeepSeek API (OpenAI 兼容) |

## 功能设计

### 1. 项目导入（三种方式）

| 方式 | 实现 |
|------|------|
| 打开本地文件夹 | `<input type="file" webkitdirectory>` 读取文件列表，通过 FormData 上传到 `/api/projects/import-local` |
| Git Clone | POST `/api/projects` 传入 `gitUrl`，后端 `exec('git clone')` 拉取 |
| 上传 ZIP | POST `/api/projects/import-zip`，FormData 携带 ZIP 文件，后端解压 |

导入后自动触发解析。

### 2. 解析引擎

`/api/projects/:id/parse` 触发，执行：

```
1. 扫描所有 .c/.h 文件
2. tree-sitter 逐文件解析
3. 提取：函数定义/结构体/宏/include/函数调用
4. 写入 SQLite（files, symbols, includes, calls 表）
5. 返回解析进度
```

### 3. 数据库 Schema

```sql
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT,
  last_opened TEXT
);

CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  path TEXT,
  name TEXT,
  type TEXT,  -- 'file' or 'directory'
  parent_path TEXT,
  source_content TEXT
);

CREATE TABLE symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  name TEXT,
  kind TEXT,  -- function/struct/macro/typedef
  file TEXT,
  line INTEGER,
  signature TEXT
);

CREATE TABLE includes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  from_file TEXT,
  to_file TEXT
);

CREATE TABLE calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  caller TEXT,
  callee TEXT,
  caller_file TEXT,
  callee_file TEXT
);

CREATE TABLE ai_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  file_path TEXT,
  summary TEXT,
  explanation TEXT,
  generated_at TEXT
);
```

### 4. REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/projects` | 项目列表 |
| POST | `/api/projects` | 创建项目（本地路径/Git URL） |
| DELETE | `/api/projects/:id` | 删除项目 |
| POST | `/api/projects/:id/import-local` | 上传文件夹文件 |
| POST | `/api/projects/:id/import-zip` | 上传 ZIP 文件 |
| POST | `/api/projects/:id/parse` | 触发解析 |
| GET | `/api/projects/:id/files` | 文件树 |
| GET | `/api/projects/:id/symbols` | 符号列表 |
| GET | `/api/projects/:id/graph` | 图谱数据 |
| GET | `/api/projects/:id/source?file=path` | 源码内容 |
| POST | `/api/projects/:id/ai-explain` | AI 解释（选中代码/文件） |
| POST | `/api/projects/:id/ai-chat` | AI 对话 |

### 5. 前端页面

| 路由 | 组件 | 说明 |
|------|------|------|
| `/` | `ProjectList` | 项目卡片列表 + 新建/导入按钮 |
| `/project/[id]` | `AppShell` | 现有的三栏布局，数据源切为 API |

### 6. 前端数据层变更

| 之前 | 之后 |
|------|------|
| `import filesData from '@/app/data/files.json'` | `fetch(\`/api/projects/${id}/files\`)` |
| 静态 JSON import | API 请求 + 响应缓存 |
| 22 个 AI Mock 文件 | DeepSeek API 流式生成 + SQLite 缓存 |

### 7. 文件结构

```
codeatlas/
├── app/
│   ├── api/
│   │   └── projects/
│   │       ├── route.ts           # GET 列表, POST 创建
│   │       └── [id]/
│   │           ├── route.ts       # DELETE
│   │           ├── parse/route.ts
│   │           ├── files/route.ts
│   │           ├── symbols/route.ts
│   │           ├── graph/route.ts
│   │           ├── source/route.ts
│   │           ├── ai-explain/route.ts
│   │           ├── ai-chat/route.ts
│   │           ├── import-local/route.ts
│   │           └── import-zip/route.ts
│   ├── page.tsx                   # 项目列表首页
│   ├── project/[id]/page.tsx      # 项目内页
│   ├── lib/
│   │   ├── db.ts                  # SQLite 连接 & 查询
│   │   ├── parser.ts              # tree-sitter 解析
│   │   └── ...
│   └── data/                      # 可删除
├── projects/                      # gitignore，存导入的项目源码
└── ...
```

## 不做的

- 移动端适配
- 桌面打包（预留接口，后续做）
- 多语言项目支持（首期只做 C/C++）
- 用户账户/多租户
