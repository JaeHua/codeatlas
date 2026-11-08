# 项目级全局 AI 浮动抽屉 — 设计文档

日期：2026-11-08
状态：已确认，待实现

## 背景

当前项目中的 AI 能力全部是**单文件/单函数**维度：`AIPanel` 基于 `selectedEntity.path` 展示某个文件的摘要、代码解释、调用流，`ai-explain` / `ai-chat` 也只针对单个文件。用户希望新增一个**面向整个项目**的 AI 能力，可以像"针对 Linux 内核提问题"那样，就项目整体提问，AI 结合项目内容回答，并支持渲染流程图、可点击的文件引用。

## 目标

- 提供项目级问答：用户就整个项目提任意问题。
- 回答基于项目真实内容（检索相关文件源码 + 项目结构信息）。
- 支持流式输出。
- 回答中可渲染 Mermaid 图表，以及可点击的 `文件:行号` 引用。
- 以右下角浮动抽屉形式呈现，仅在项目详情页可用。

## 非目标（Non-goals）

- 不做对话历史持久化（关闭/刷新即清空）。
- 不做向量嵌入 / RAG 向量库（本期用关键词检索）。
- 不改变现有单文件 AI 面板的行为。
- 不做全站（非项目页）可用。

## 关键决策

| 决策点 | 结论 |
| --- | --- |
| 核心能力 | 项目问答聊天（不是单纯的项目概览） |
| 上下文策略 | 检索相关文件（关键词命中），而非全量源码或仅结构元数据 |
| UI 形态 | 右下角浮动抽屉（FAB 展开） |
| 可用范围 | 仅项目详情页 `/project/[id]` |
| 渲染 | Mermaid 流程图/时序图 + 可点击的 `文件:行号` 引用 |
| 输出方式 | 流式输出 |
| 历史 | 不持久化，内存态 |
| 技术方案 | 方案 A：服务端检索 + 服务端流式路由 |

## 架构与数据流

```
[ProjectAIDrawer]
  用户输入问题
        │
        ▼
  messages (内存, 不含 system)
        │  POST /api/projects/[id]/ai-project
        ▼
[Route: ai-project]
  1. 取最后一条用户消息作为 query
  2. retrieveProjectContext(projectId, query)
       - 关键词提取
       - DB(files/symbols/calls) 打分选 top-N 文件
       - 生成结构摘要 + 相关源码
  3. 组装 system prompt + 传入 messages
  4. 调 DeepSeek /v1/chat/completions (stream: true)
  5. 将上游 SSE body 直接 pipe 回客户端
        │  text/event-stream
        ▼
[ProjectAIDrawer] 逐块追加到助手消息
        │
        ▼
[ProjectAIMarkdown] 渲染 Markdown / Mermaid / 可点击引用
        │  点击 codeatlas://file 链接
        ▼
  useAppStore.selectFileWithLine(path, line)  跳转到对应文件/行（抽屉保持打开）
```

## 组件设计

### 新增文件

- `app/components/ai-project/ProjectAIDrawer.tsx`
  - 右下角 FAB + 可展开面板。挂载于 `AppShell`（仅项目页渲染），接收 `projectId` prop。
  - 内部状态：`messages`、`input`、`streaming`、`abortRef`、`scrollRef`。
  - 空状态展示 3 个示例问题；发送/停止按钮；自动滚动；`Esc` 关闭；`Cmd/Ctrl+Shift+A` 开关。
  - 未配置 API Key 时展示提示 + "前往设置"，触发 `codeatlas:open-settings`。

- `app/components/ai-project/ProjectAIView.tsx`（从 Drawer 拆出的消息区 + 输入区）
  - 渲染消息列表、流式光标、输入框、发送/停止。

- `app/components/ai-project/ProjectAIMarkdown.tsx`
  - 基于 `react-markdown` + `remark-gfm`（与 `MarkdownRenderer` 一致）。
  - `code` 渲染：`language-mermaid` 代码块 → `<MermaidDiagram chart={...} />`；其余默认。
  - `a` 渲染：`href` 以 `codeatlas://file` 开头 → 解析 `path`、`line`，渲染为可点击，点击调用 `useAppStore.getState().selectFileWithLine(path, line)`；其他链接正常。

- `app/lib/project-retrieval.ts`
  - `retrieveProjectContext(projectId, query) => { files, structureSummary }`。
  - 关键词抽取：拉丁标识符（`[A-Za-z_][A-Za-z0-9_]*`，长度 ≥ 2），过滤停用词。
  - 打分：文件名命中 +5；符号名命中 +4（关联到符号所在文件再 +2）；源码内容命中 +1。同一关键词对同一文件只计一次。
  - 选 top-N（默认 6）文件；每个源码截断 4000 字符，总量上限约 24000 字符。
  - 无任何命中时回退：项目结构摘要 + 入口类文件（如 `main.c` 或符号数最多的文件）。
  - 结构摘要包含：文件树（路径，必要时裁剪）、函数/结构体符号列表、调用关系统计。
  - 数据来源：`getFileTree`（含 content）、`getSymbols`、`getCalls`；内存打分，不新增表。

- `app/api/projects/[id]/ai-project/route.ts`
  - `POST`，请求体 `{ messages: {role,content}[], apiKey, baseUrl, model }`。
  - 校验 `apiKey`；`baseUrl` 默认 `https://api.deepseek.com`，`model` 默认 `deepseek-chat`（沿用现有约定）。
  - 检索 → 组装 system prompt → 调 DeepSeek `stream: true`。
  - 上游 2xx：直接返回 `new Response(upstream.body, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } })`。
  - 上游非 2xx：返回 JSON `{ error }`（对应状态码），由前端展示。

### 改动文件

- `app/components/layout/AppShell.tsx`：在项目页布局中挂载 `<ProjectAIDrawer projectId={projectId} />`。
- `ProjectAIDrawer.tsx` 自身监听 `Cmd/Ctrl+Shift+A` 切换（封装在抽屉内，不修改 `KeyboardShortcuts.tsx`）。
- `app/components/layout/SettingsDialog.tsx`：新增监听 `codeatlas:open-settings` 事件以打开设置弹窗（修复现有 AIPanel 空响应问题，供抽屉复用）。
- `app/lib/ai-api.ts`：新增 `streamProjectAI(projectId, messages, onChunk, signal)`，POST 到 `ai-project` 路由并解析 SSE 增量。

## System Prompt 要点

- 角色：资深工程师，帮助理解当前项目（可类比解释 Linux 内核那样的 C 项目）。
- 输入：项目名、结构摘要、检索到的若干文件源码（带路径）。
- 要求：
  - 用中文、技术性、简洁地回答。
  - 优先基于提供的项目上下文；信息不足时明确说明，并建议查看哪些文件。
  - 引用文件时使用格式 `[path:line](codeatlas://file?path=<urlencoded>&line=<n>)`，便于前端渲染为可点击。
  - 适合时输出 ```mermaid 代码块画流程图/时序图。
- 模型参数：`temperature: 0.3`，`max_tokens` 取较大值（如 4096），`stream: true`。

## 错误处理

- 未配置 API Key：抽屉内提示，附"前往设置"入口（触发 `codeatlas:open-settings`）。
- 上游返回非 2xx：展示错误信息与"重试"。
- 流式中断/用户点停止：保留已生成的部分内容，停止符恢复为发送。
- 检索为空：仍基于结构摘要作答，并在提示中说明上下文有限。
- 请求/网络异常：展示可读错误，可重试。

## 验证方式

项目未配置测试框架。完成标准：

- `npm run lint` 通过。
- `npm run build` 通过（含类型检查）。
- 手动验证：在项目页打开抽屉 → 提问 → 观察流式输出 → Mermaid 正常渲染 → 点击 `文件:行号` 跳转正确；未配置 Key 时提示可用。

## 未来可扩展（本期不做）

- 项目级结果缓存（server 端按 query 缓存）。
- 向量检索 / RAG。
- 对话历史持久化（localStorage 或 DB）。
- 引用点击高亮命令、复制回答等增强。
