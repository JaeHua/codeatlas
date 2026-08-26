# motion-eyes — 企鹅 360° 视线跟随

首屏动画：把用户生成的《首屏动画.mp4》抠出绿幕背景、切帧、与鼠标移动绑定。

## Motion Brief

- **subject**: 企鹅吉祥物（黑头、白眼、白肚、黑翅）
- **driver**: pointer（鼠标相对企鹅中心的方向）
- **parameter_space**: circular（360° 环形角度 → 帧索引）
- **motion**: 鼠标方向决定企鹅视线方向，smoothDamp 平滑追踪，环形最短路径不反向绕圈
- **rest_state**: frame 0（静止帧），reduced-motion 下保持静态
- **loop**: closed
- **background**: chroma，采样色键 `#6E7F66`，页面背景独立（`body::before` 图纸网格）

## 自动选择

- 结果：**alpha-atlas**（css-alpha-atlas）
- 依据：`random-access-fits-atlas-budget`（单张 4096 纹理、解码内存 56.9 MiB）
- 命令与报告：`motion-eyes/final/motion-budget.json`

## 源视频探测

- HEVC 1164x1080，yuv420p，30fps，304 帧，10.134s，含音轨（已 `-an` 丢弃）
- 绿幕背景均匀（stdev ~2.5），主体区域 708x756

## 处理命令

1. 提取 + 抠色（阈值已调：默认 12/220 会让暗色主体半透明，实测改为 15/90）：

   ```bash
   python3 motion_pipeline.py extract source/首屏动画.mp4 frames/raw \
     --key auto --fps 10 --transparent-threshold 15 --opaque-threshold 90
   ```

2. 裁剪固定并集框 (180,130)-(1032,1008)，90 帧均匀降采样（`round(i*100/89)`），缩放至 400x414 cell → `frames/final`
3. QA：

   ```bash
   python3 motion_pipeline.py analyze frames/final --output qa/final-analysis.json
   python3 motion_pipeline.py contact frames/final --output qa/final-contact.jpg --columns 10
   ```

   - 无 blank/scale/center/brightness 异常；86 条 near-duplicate 警告为平滑视线动画相邻帧差异小所致（非停滞）
4. 图集：

   ```bash
   python3 motion_pipeline.py atlas frames/final --output final/motion.webp \
     --manifest final/motion.json --cell-width 400 --cell-height 414 --quality 88
   ```

## 最终资产

- `final/motion.webp`：4000x3726 RGBA，90 帧（10 列 × 9 行），1.9 MB
- `final/motion.json`：frameCount 90、cell 400x414
- 已复制至 `public/hero-penguin.webp` / `public/hero-penguin.json`

## 运行时实现

- `app/components/hero/HeroPenguin.tsx`：fetch manifest → 解码 webp → 显示 frame 0
  - 指针角度 `atan2(dy,dx)` → 经 `GAZE_ANCHORS` 锚点分段线性插值 → 目标帧
  - `smoothDamp`（smoothTime 0.35, maxSpeed 45）：半圈约 1.6s，从容不"乱转"
  - `shortestCircularDelta` 处理 0°/360° 边界不反向
  - 每 `requestAnimationFrame` 仅整数帧变化时写一次 `background-position`
  - `getBoundingClientRect` 每次移动重算相对位置；`prefers-reduced-motion` 静态帧；资源失败 → 不渲染
- 集成：`app/page.tsx` hero，标题右侧（`w-32 sm:w-40 lg:w-48`），替换原放大镜装饰

## 视线校准（v4 最终）

交互语义：**企鹅眼睛看向鼠标相对企鹅中心的位置**（鼠标在左下 → 看左下），
非"鼠标往右动、眼睛往右转"的方向旋转。

方向判定以白色巩膜朝向为准（白左=看左、白底=看下、白顶=看上、白满=看正），
锚点帧由 white-distribution 数据选取最强帧：

- 右(0°) → 帧 0（正中，视频无"看右"姿态）
- 下(90°) → 帧 11（白在底，看下）
- 左(180°) → 帧 33（白在左，看左）
- 上(270°) → 帧 56（白在顶，看上）
- 相邻锚点线性插值，保证眼睛在姿态序列中连续扫过

近中心处理：鼠标距中心 < 36px 时视线缓缓回正（hover 在企鹅身上 → 自然看镜头），
离开即恢复追踪，避免 `atan2` 近中心角度剧变造成的乱颤。

## 降级方案

- 资源未解码完成：显示静态 frame 0
- fetch/decode 失败：组件返回 null（不阻塞页面）
- reduced-motion：静态 frame 0
