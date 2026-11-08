# 流程向导学习卡 — 设计文档

日期：2026-11-08
状态：已确认，待实现

## 背景

面向 Linux 内核初学者：难点不是看代码，而是建立"前因 → 调用流转 → 数据流 → 后果"的完整心智模型。以"路由查找"为例，新手不清楚 `ip_route_output_key → fib_lookup → fib_table_lookup` 这条主线，以及 `fib_result`/`rtable`/`dst_entry` 等数据结构如何被创建、填充和消费。

本功能提供一个"流程向导"：从任意选中函数出发，结合静态调用图与 AI，生成一张分步学习卡。

## 目标

- 从当前选中的函数一键生成"精选主路径"的端到端流程学习卡。
- 学习卡包含：触发条件与前因、分步主线、数据结构与字段、副作用与后果、Mermaid 时序/流程图。
- 每一步可点击跳转到对应文件/行。
- 结果按项目缓存；可强制重新生成。

## 非目标（Non-goals）

- 不做完整调用树可视化（只做精选主路径）。
- 不做动态/运行时跟踪（基于静态调用边 + 源码）。
- 不解析函数指针/宏展开（会标注"推断"并提示局限）。
- 不做多函数对比、学习路径课程化（后续可扩展）。

## 关键决策

| 决策点 | 结论 |
| --- | --- |
| 发起方式 | 从选中的函数一键生成 |
| 范围 | 精选主路径（5–10 步），非完整树 |
| 内容块 | 前因 / 分步 / 数据结构 / 后果 / 时序图 |
| 展示位置 | 项目 AI 抽屉内新增「流程向导」Tab |
| 生成策略 | 静态调用图 + 源码 → AI 提炼；标注 `graph`/`inferred` |
| 技术方案 | 方案 A：独立路由 + 结构化 JSON + `flow_cache` 缓存 |

## 架构与数据流

```
选中函数 (selectedEntity.type === 'function')
        │ 点击「生成流程向导」
        ▼
ProjectAIFlowView → generateFlowWalkthrough(projectId, entry, force)
        │ POST /api/projects/[id]/ai-flow { entry, apiKey, baseUrl, model, force }
        ▼
[route]
  1. 校验 entry.name，检查 flow_cache（force 可绕过）
  2. buildFlowContext(projectId, entry)
       - getFileTree / getSymbols / getCalls
       - 下游 BFS(深度≤3, 节点≤40) + 上游 1 层调用者
       - 解析函数定义 file:line + 相关文件源码（截断）
  3. buildFlowPrompt(项目名, ctx)
  4. 调 DeepSeek（temperature 0.2, max_tokens 3000, 非流式）
  5. parseFlowCard(raw) 校验/规范化
  6. setFlowCache 后返回 { entry, card, cached }
        ▼
ProjectAIFlowView 渲染卡片；点击步骤 → selectFileWithLine
```

## 数据结构

`app/lib/types.ts` 新增：

```ts
export interface FlowEntry { name: string; file: string; line?: number }
export interface FlowStep {
  name: string; file: string; line?: number; role: string
  confidence: 'graph' | 'inferred'
}
export interface FlowDataStruct {
  struct: string; role: string; fields: string[]; lifecycle: string
}
export interface FlowCard {
  trigger: string; steps: FlowStep[]; dataFlow: FlowDataStruct[]
  effects: string[]; mermaid?: string
}
```

## 服务端模块

- `app/lib/flow-context.ts`
  - `buildFlowContext(projectId, entry): Promise<FlowContext>`：
    - 邻接表按函数名；下游 BFS 深度 ≤3、节点 ≤40；上游 1 层。
    - 用 `symbols` 解析每个函数定义位置。
    - 采集主路径相关文件源码（每文件 ≤3000 字符、总量 ≤18000、≤8 个文件）。
    - `degraded = 静态边为 0`。
  - `buildFlowPrompt(projectName, ctx): string`：要求输出固定 JSON schema；主线 5–10 步；只允许把上下文真实调用标 `graph`，其余 `inferred`；中文；Mermaid 用 sequenceDiagram/flowchart。

- `app/lib/flow-card.ts`
  - `parseFlowCard(raw): FlowCard`：去除 ```json 围栏、提取首个 `{...}`、逐字段类型校验与默认值、过滤空步骤/结构体、`confidence` 仅接受 `inferred`，否则 `graph`。解析失败抛出可读错误。

- `app/api/projects/[id]/ai-flow/route.ts`
  - `POST`，body `{ entry, apiKey, baseUrl, model, force? }`。
  - 缓存键 `entry_key = "<file>::<name>"`。
  - 命中缓存返回 `{ entry, card, cached: true }`；`force` 跳过。
  - 非 2xx/解析失败返回 `{ error }`。

- `app/lib/db.ts`
  - 新表：`flow_cache(id, project_id, entry_key, data, generated_at, UNIQUE(project_id, entry_key))`。
  - `getFlowCache(projectId, entryKey)`、`setFlowCache(projectId, entryKey, data)`（`INSERT OR REPLACE`）。
  - `deleteProject` 增加清理 `flow_cache`。

## 前端模块

- `app/lib/ai-api.ts`
  - `generateFlowWalkthrough(projectId, entry, force = false)`：读取 `useSettings`，POST `ai-flow`，返回 `{ card, cached }`。

- `app/components/ai-project/ProjectAIFlowView.tsx`
  - 从 `useStore` 读 `selectedEntity`；仅当 `type === 'function'` 视为有效入口。
  - 无入口：提示"请先在代码/符号树中选中一个函数"。
  - 生成态：loading / 错误重试 / `已缓存` 标识 / `重新生成`(force)。
  - 卡片区块：触发条件、分步主线（编号 + 函数名 + `file:line` 可点击 + `推断` 徽标）、数据结构与字段、副作用、Mermaid（复用 `MermaidDiagram`，支持点击放大）、静态分析局限声明。
  - 未配置 Key → 提示并触发 `codeatlas:open-settings`。

- `app/components/ai-project/ProjectAIDrawer.tsx`
  - 头部新增 `对话 / 流程向导` Tab。
  - 两个视图保持挂载，用 `hidden` 切换（切换不丢状态）。
  - 面板尺寸调整为 `min(94vw,480px)` × `min(80vh,700px)`。

## 错误处理

- 未选函数：空状态提示。
- 未配置 Key：提示 + 打开设置。
- 子图为空：仍允许生成，`inferred` 步骤 + 局限声明。
- AI 返回非 JSON：`parseFlowCard` 抛错，前端展示错误与重试。
- 缓存损坏：解析失败则忽略缓存并重新生成。

## 验证方式

- 纯函数 `parseFlowCard` 用 `tsx` 运行时验证（普通 JSON / 带围栏 / 夹带散文 / 缺字段 / `inferred`）。
- `npx tsc --noEmit`、`eslint`（改动文件）、`npm run build`。
- 手动：选中函数 → 生成 → 步骤点击跳转 → Mermaid 渲染/放大 → 重新生成。

## 后续可扩展（本期不做）

- 完整调用树可展开。
- 数据流字段级追踪（读/写位置）。
- 间接调用（ops 结构体）解析。
- 经典流程线路库 / 学习进度与笔记。
