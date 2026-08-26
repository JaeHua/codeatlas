'use client'

import { useEffect, useRef, useState } from 'react'

interface AtlasManifest {
  frameCount: number
  columns: number
  rows: number
  cellWidth: number
  cellHeight: number
}

/**
 * 视线锚点：鼠标相对企鹅中心的方向角（0=右、90=下、180=左、270=上）→ 视线朝向最近的姿态帧。
 * 方向按白色巩膜朝向判定（白在左=看左、白在底=看下、白在顶=看上、白满=看正），
 * 由 white-distribution 数据挑选最强帧：下=11、左=33、上=56。
 * 视频没有"看右"姿态，右向归到正中。相邻锚点线性插值，保证眼睛在姿态序列里连续扫过。
 */
const GAZE_ANCHORS: { angle: number; frame: number }[] = [
  { angle: 0, frame: 0 },
  { angle: 90, frame: 11 },
  { angle: 180, frame: 33 },
  { angle: 270, frame: 56 },
  { angle: 360, frame: 0 },
]

/** 鼠标距企鹅中心小于该半径时，视线缓缓回正（atan2 在近中心处角度剧变，会导致乱颤） */
const NEAR_CENTER_RADIUS = 36

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const wrap = (value: number, length: number) =>
  ((value % length) + length) % length

const shortestCircularDelta = (from: number, to: number, frameCount: number) => {
  let delta = wrap(to, frameCount) - wrap(from, frameCount)
  if (delta > frameCount / 2) delta -= frameCount
  if (delta < -frameCount / 2) delta += frameCount
  return delta
}

const smoothDamp = (
  current: number,
  target: number,
  velocity: number,
  smoothTime: number,
  maxSpeed: number,
  deltaTime: number,
): [number, number] => {
  const safeTime = Math.max(0.0001, smoothTime)
  const omega = 2 / safeTime
  const x = omega * deltaTime
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const originalTarget = target
  const maxChange = maxSpeed * safeTime
  const change = clamp(current - target, -maxChange, maxChange)
  const limitedTarget = current - change
  const temp = (velocity + omega * change) * deltaTime
  const nextVelocity = (velocity - omega * temp) * decay
  let nextPosition = limitedTarget + (change + temp) * decay

  if ((originalTarget - current > 0) === (nextPosition > originalTarget)) {
    nextPosition = originalTarget
  }
  return [nextPosition, nextVelocity]
}

/** 鼠标方向角(度) → 目标帧（锚点分段线性插值） */
const mapAngleToFrame = (angleDeg: number) => {
  const a = ((angleDeg % 360) + 360) % 360
  for (let i = 0; i < GAZE_ANCHORS.length - 1; i++) {
    const lo = GAZE_ANCHORS[i]
    const hi = GAZE_ANCHORS[i + 1]
    if (a >= lo.angle && a <= hi.angle) {
      const t = (a - lo.angle) / (hi.angle - lo.angle)
      return lo.frame + t * (hi.frame - lo.frame)
    }
  }
  return 0
}

/**
 * 企鹅视线跟随 — 图集由 motion-eyes 流水线产出（alpha-atlas, 90 帧）。
 * 鼠标方向经锚点校准映射到姿态帧，smoothDamp 慢速平滑追踪，静止时保持视线。
 */
export function HeroPenguin({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let cancelled = false
    let image: HTMLImageElement | null = null
    let raf = 0
    let position = 0
    let target = 0
    let velocity = 0
    let lastFrame = -1
    let lastTime = 0
    let reducedMotion = false

    const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion = reducedQuery.matches

    const renderFrame = (frame: number, data: AtlasManifest) => {
      const column = frame % data.columns
      const row = Math.floor(frame / data.columns)
      const x = data.columns === 1 ? 0 : (column / (data.columns - 1)) * 100
      const y = data.rows === 1 ? 0 : (row / (data.rows - 1)) * 100
      el.style.backgroundPosition = `${x}% ${y}%`
    }

    const loop = (now: number, data: AtlasManifest) => {
      raf = 0
      const deltaTime = lastTime ? Math.min((now - lastTime) / 1000, 1 / 30) : 1 / 60
      lastTime = now

      if (reducedMotion) {
        position = target
        velocity = 0
      } else {
        ;[position, velocity] = smoothDamp(position, target, velocity, 0.35, 45, deltaTime)
      }
      const frame = Math.round(wrap(position, data.frameCount))
      if (frame !== lastFrame) {
        renderFrame(frame, data)
        lastFrame = frame
      }
      if (Math.abs(target - position) > 0.002 || Math.abs(velocity) > 0.002) {
        raf = requestAnimationFrame((n) => loop(n, data))
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      const data = manifestRef
      if (!data) return
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = e.clientX - cx
      const dy = e.clientY - cy
      const dist = Math.hypot(dx, dy)
      const desired =
        dist < NEAR_CENTER_RADIUS
          ? 0
          : mapAngleToFrame((Math.atan2(dy, dx) * 180) / Math.PI)
      target = position + shortestCircularDelta(position, desired, data.frameCount)
      if (!raf) raf = requestAnimationFrame((n) => loop(n, data))
    }

    let manifestRef: AtlasManifest | null = null
    const scheduleStatic = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      if (manifestRef) {
        position = target
        velocity = 0
        lastFrame = Math.round(wrap(target, manifestRef.frameCount))
        renderFrame(lastFrame, manifestRef)
      }
    }

    fetch('/hero-penguin.json')
      .then((res) => res.json())
      .then((data: AtlasManifest) => {
        if (cancelled) return
        image = new Image()
        image.src = '/hero-penguin.webp'
        image.decode().then(() => {
          if (cancelled) return
          manifestRef = data
          el.style.aspectRatio = `${data.cellWidth} / ${data.cellHeight}`
          el.style.backgroundImage = `url('${image!.src}')`
          el.style.backgroundSize = `${data.columns * 100}% ${data.rows * 100}%`
          renderFrame(0, data)
          lastFrame = 0
        }).catch(() => setFailed(true))
      })
      .catch(() => setFailed(true))

    const onReducedChange = () => {
      reducedMotion = reducedQuery.matches
      if (reducedMotion) scheduleStatic()
    }

    window.addEventListener('pointermove', onPointerMove)
    reducedQuery.addEventListener('change', onReducedChange)

    return () => {
      cancelled = true
      window.removeEventListener('pointermove', onPointerMove)
      reducedQuery.removeEventListener('change', onReducedChange)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  if (failed) return null

  return (
    <div
      ref={ref}
      className={`aspect-[400/414] ${className}`}
      style={{
        backgroundRepeat: 'no-repeat',
        backgroundColor: 'transparent',
      }}
      aria-label="企鹅吉祥物，视线跟随鼠标方向"
      role="img"
    />
  )
}
