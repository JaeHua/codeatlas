# CodeAtlas 工程图纸视觉系统 — 设计文档

日期：2026-08-18

## 目标

将 CodeAtlas 从当前的"织物/多色彩"主题，重构为一套具有"工程网格纸 × 现代编辑排版 × 轻量手绘技术草图"气质的桌面端源码探索界面。视觉气质：专业、安静、聪明、有探索感和人文感。不是营销型 SaaS，不是深色 IDE，不是炫技未来科技。

## 范围

- 全局视觉体系（核心）
- 图谱可视化重构（KnowledgeGraph / ArchitectureMap / FileGraph）
- 首页大标题 + 手绘元素
- 主题系统简化（只保留一套主题）

不在本次范围：文件画像/AI 面板的版式深度改造（仅套用新色彩与细线分隔）。

## 色彩体系（单主题）

背景为暖白纸张底色，网格线带极浅的淡黄暖色。

| 变量 | 色值 | 用途 |
|------|------|------|
| `--background` | `#FBF8F0` | 暖白纸张底（非纯白） |
| `--foreground` | `#1A1A18` | 接近纯黑的主文字 |
| `--card` | `#FFFFFF` | 面板/编辑器底 |
| `--primary` | `#E0A93C` | 强调黄：选中态、当前节点、路径 |
| `--primary-foreground` | `#1A1A18` | 黄底上的黑字 |
| `--muted-foreground` | `#8A8578` | 二级中性灰 |
| `--secondary` / `--muted` / `--accent` | `#F3EFE6` | 浅灰暖底（hover、辅助区） |
| `--border` | `#E2DDD2` | 浅灰细线 |
| `--input` | `#E2DDD2` | 输入框边框 |
| `--ring` | `#E0A93C` | 焦点环（黄） |
| `--radius` | `2px` | 直角/极小圆角 |
| 网格线 1 | `rgba(224,169,60,0.06)` | 淡黄主网格 |
| 网格线 2 | `rgba(26,26,24,0.03)` | 极浅灰副网格 |

## 全局视觉规则

1. **网格背景**：`body::before` 用 `repeating-linear-gradient` 绘制贯穿全页的工程网格，低对比，仅建立空间秩序。
2. **移除**：`glass`（玻璃拟态）、`shadow-fabric*`（厚重阴影）、`glow-hover`（光晕）、`ripple`/`hover-lift`（弹簧动效）——保留极轻的 1px 边框微阴影或直接去掉。
3. **圆角**：全局 `--radius: 2px`，按钮/输入框/面板直角为主。
4. **强调方式**：黄色底线、左侧短黄线、黄色小色块、黑色描边——替换大块高饱和背景。
5. **线条**：纤细（1px border / 1–1.5px 关系线）、浅灰。
6. **字体**：无衬线紧凑字体（正文/导航）；超大粗黑标题（品牌/首页）；等宽字体（文件路径、函数签名、代码、符号）。英文辅助文字可用稍宽字距，中文保持自然。

## 首页（app/page.tsx）

- 超大号粗黑品牌标题（如 `text-6xl font-black tracking-tight`），通过换行形成大面积黑色文字块。
- 项目列表：去圆角卡片，改细线分隔列表/表格布局；选中/悬停用黄色底线或左短线。
- 空状态：手绘箭头 + 圈选 + 注释（干净 SVG 线条，低不规则度）。
- 保留现有功能逻辑（新建项目、删除、导入），仅重构视觉层。

## 图谱可视化

- **节点**：黑灰描边、白底黑字标签；圆形（函数）/方形（文件/结构体）简洁形状。当前/选中/推荐路径节点用柔和黄 `#E0A93C` 高亮（可填充或描边）。
- **连线**：黑色/深灰细线（1–1.5px），箭头清晰；可加轻微手绘虚线，方向和层级必须清晰。
- **背景**：图谱容器内铺工程网格（低对比）。
- 移除高饱和蓝/绿/紫节点与连线色。
- ArchitectureMap：卡片改直角细边框白底，标题区黑色粗体，黄色用于当前文件/路径。

## 手绘元素

- 可复用 SVG 组件：手绘箭头、圈选、下划线批注、简单人物/放大镜。
- 用于：首页品牌区、空状态、探索提示。不进入高密度表格，不影响核心操作。
- 风格：线条自然略带不规则，但整体干净（低粗糙度）。

## 主题系统简化

- `app/lib/themes.ts`：只保留一套"图纸"预设（name: `blueprint`），PRESETS 数组保留但仅一项。
- `app/store/theme.ts`：保留结构（当前主题逻辑兼容），默认 `currentTheme: 'blueprint'`。
- `app/layout.tsx` `THEME_SCRIPT`：同步为图纸主题变量。
- `app/components/theme/ThemePicker.tsx`：简化为静态展示当前主题说明（不再提供 5 套切换）。

## 关键文件

- `app/lib/themes.ts` — 主题预设
- `app/store/theme.ts` — 主题 store
- `app/layout.tsx` — 内联主题脚本
- `app/globals.css` — 网格背景、工具类、字体
- `app/page.tsx` — 首页
- `app/components/graphs/KnowledgeGraph.tsx` — 知识图谱
- `app/components/graphs/ArchitectureMap.tsx` — 架构图
- `app/components/graphs/FileGraph.tsx` — 调用流程图
- `app/components/theme/ThemePicker.tsx` — 主题选择器
- 全组件清理 glass/shadow/圆角/高饱和色

## 验证

- `npx tsc --noEmit`
- `npm run build`
- `npx eslint`
- 手动检查：首页、项目列表、代码视图、图谱、架构图、设置面板
