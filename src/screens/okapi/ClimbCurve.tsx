import { useEffect, useRef } from 'react'

type GameState = 'waiting' | 'playing' | 'crashed' | 'cashedout'

// Load the okapi marker sprite once at module scope so it is reused across
// renders. We use `okapi-tip.png`, a cropped + horizontally-mirrored variant
// of the full Congo Gaming logo so the okapi visibly climbs in the
// right-to-left direction along the curve tip (no plinth/text artefacts).
const okapiImg = new Image()
okapiImg.src = '/images/okapi/okapi-tip.png'

interface Props {
  state: GameState
  startTime: number | null
}

interface Point {
  x: number
  y: number
}

function multiplierAt(elapsedSec: number) {
  return 1 + 0.06 * elapsedSec + Math.pow(0.06 * elapsedSec, 2)
}

export default function ClimbCurve({ state, startTime }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointsRef = useRef<Point[]>([])
  const rafRef = useRef<number>(0)
  const fadeAlphaRef = useRef<number>(1)
  const startRef = useRef<number | null>(null)
  // Smoothed sprite anchors — exponential easing toward the real tip and the
  // raw tangent angle, so the okapi stays glued to the curve tip but stops
  // micro-jittering when RAF cadence is irregular.
  const smoothTipRef = useRef<Point | null>(null)
  const smoothAngleRef = useRef<number | null>(null)
  const crashStartRef = useRef<number | null>(null)
  const crashAnchorRef = useRef<Point | null>(null)

  // Resize canvas to its container in device pixels
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const W = () => canvas.width / dpr
    const H = () => canvas.height / dpr

    // Reset on entering waiting / playing
    if (state === 'waiting') {
      pointsRef.current = []
      fadeAlphaRef.current = 1
      startRef.current = null
      smoothTipRef.current = null
      smoothAngleRef.current = null
      crashStartRef.current = null
      crashAnchorRef.current = null
      const w = W()
      const h = H()
      ctx.clearRect(0, 0, w, h)
      ctx.save()
      ctx.globalAlpha = 0.3
      ctx.strokeStyle = '#9ca3af'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.beginPath()
      const baselineY = h - 20
      ctx.moveTo(20, baselineY)
      ctx.lineTo(w - 20, baselineY)
      ctx.stroke()
      ctx.restore()
      return
    }
    if (state === 'playing') {
      pointsRef.current = []
      // startTime is Date.now() epoch ms (server PLAYING msg or local fallback).
      // We diff it against Date.now() below.
      startRef.current = startTime ?? Date.now()
      // Reset sprite smoothing anchors: the first frame after entering
      // playing will snap them to the freshly sampled tip / angle, then
      // subsequent frames will ease toward the real tip.
      smoothTipRef.current = null
      smoothAngleRef.current = null
      fadeAlphaRef.current = 1
      crashStartRef.current = null
      crashAnchorRef.current = null
    }

    let shakeT0 = state === 'crashed' ? performance.now() : 0
    if (state === 'crashed' && crashStartRef.current == null) {
      crashStartRef.current = performance.now()
      const pts = pointsRef.current
      crashAnchorRef.current = pts.length ? { ...pts[pts.length - 1] } : null
    }

    const draw = () => {
      const w = W()
      const h = H()
      ctx.clearRect(0, 0, w, h)

      if (state === 'playing' && startRef.current != null) {
        const elapsed = Math.max(0, (Date.now() - startRef.current) / 1000)
        const m = multiplierAt(elapsed)

        // Aviator-standard direction: starts at bottom-left, climbs toward
        // top-right as the multiplier grows.
        const SWEEP_SEC = 20
        const X_PAD = 20
        const x = X_PAD + Math.min(w - X_PAD * 2, (elapsed / SWEEP_SEC) * (w - X_PAD * 2))
        const Y_PAD = 20
        const yNorm = Math.min(1, Math.log10(m) / Math.log10(20))
        const y = h - Y_PAD - yNorm * (h - Y_PAD * 2)
        pointsRef.current.push({ x, y })
      }

      const pts = pointsRef.current
      if (pts.length > 1) {
        let dx = 0
        let dy = 0
        if (state === 'crashed') {
          const t = performance.now() - shakeT0
          if (t < 500) {
            const amp = 6 * (1 - t / 500)
            dx = (Math.random() - 0.5) * amp * 2
            dy = (Math.random() - 0.5) * amp * 2
          }
        }

        const isCrashed = state === 'crashed'
        const stroke = isCrashed ? '#ef4444' : '#FFD700'

        ctx.save()
        ctx.translate(dx, dy)
        ctx.globalAlpha = fadeAlphaRef.current

        // Build the area path once (reused for fill + grid clip).
        const buildAreaPath = () => {
          ctx.beginPath()
          ctx.moveTo(pts[0].x, h)
          for (const p of pts) ctx.lineTo(p.x, p.y)
          ctx.lineTo(pts[pts.length - 1].x, h)
          ctx.closePath()
        }

        // --- Strong Aviator-style filled area under the curve ---
        buildAreaPath()

        // 1) Base amber fill, dense but transparent enough to keep background visible
        const fillGrad = ctx.createLinearGradient(0, 0, 0, h)

        if (isCrashed) {
          fillGrad.addColorStop(0.0, 'rgba(255, 55, 55, 0.88)')
          fillGrad.addColorStop(0.35, 'rgba(220, 20, 35, 0.58)')
          fillGrad.addColorStop(0.72, 'rgba(140, 0, 0, 0.34)')
          fillGrad.addColorStop(1.0, 'rgba(40, 0, 0, 0.06)')
        } else {
          fillGrad.addColorStop(0.0, 'rgba(255, 235, 60, 0.92)')
          fillGrad.addColorStop(0.28, 'rgba(255, 190, 0, 0.76)')
          fillGrad.addColorStop(0.58, 'rgba(255, 132, 0, 0.46)')
          fillGrad.addColorStop(0.82, 'rgba(170, 80, 0, 0.26)')
          fillGrad.addColorStop(1.0, 'rgba(70, 25, 0, 0.08)')
        }

        ctx.fillStyle = fillGrad
        ctx.fill()

        // 2) Additive golden glow clipped under the curve
        ctx.save()
        buildAreaPath()
        ctx.clip()

        ctx.globalCompositeOperation = 'lighter'
        const tipPt = pts[pts.length - 1]
        const glow = ctx.createRadialGradient(
          tipPt.x,
          tipPt.y,
          0,
          tipPt.x,
          tipPt.y,
          Math.max(w, h) * 0.65,
        )

        if (isCrashed) {
          glow.addColorStop(0, 'rgba(255, 80, 80, 0.42)')
          glow.addColorStop(0.45, 'rgba(220, 0, 0, 0.20)')
          glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
        } else {
          glow.addColorStop(0, 'rgba(255, 230, 40, 0.55)')
          glow.addColorStop(0.35, 'rgba(255, 165, 0, 0.28)')
          glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
        }

        ctx.fillStyle = glow
        ctx.fillRect(0, 0, w, h)
        ctx.globalCompositeOperation = 'source-over'

        ctx.restore()

        // --- Bright Aviator line stroke ---
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
        ctx.lineWidth = 6
        ctx.strokeStyle = isCrashed ? '#ff2d2d' : '#ffe600'
        ctx.shadowBlur = 32
        ctx.shadowColor = isCrashed
          ? 'rgba(255, 45, 45, 1)'
          : 'rgba(255, 214, 0, 1)'
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        ctx.stroke()

        if (state === 'playing') {
          const tip = pts[pts.length - 1]
          const pulse = 4 + Math.sin(performance.now() / 120) * 2
          ctx.beginPath()
          ctx.arc(tip.x, tip.y, pulse, 0, Math.PI * 2)
          ctx.fillStyle = '#fff36a'
          ctx.shadowBlur = 36
          ctx.shadowColor = 'rgba(255, 230, 0, 1)'
          ctx.fill()
        }

        ctx.restore()

        // --- Okapi sprite at the tip of the curve ---
        if (okapiImg.complete && okapiImg.naturalWidth > 0) {
          const SIZE = 80
          const tip = pts[pts.length - 1]
          const prev = pts[Math.max(0, pts.length - 6)]

          if (state === 'playing' || state === 'cashedout') {
            // Sprite stays glued to the REAL curve tip, but its position and
            // rotation are eased through a low-pass filter so per-frame RAF
            // jitter / atan2 noise is no longer visible.
            const rawAngle = Math.atan2(tip.y - prev.y, tip.x - prev.x)

            if (smoothTipRef.current == null) {
              smoothTipRef.current = { x: tip.x, y: tip.y }
            } else {
              const s = smoothTipRef.current
              s.x += (tip.x - s.x) * 0.22
              s.y += (tip.y - s.y) * 0.22
            }

            if (smoothAngleRef.current == null) {
              smoothAngleRef.current = rawAngle
            } else {
              // Wrap diff into [-π, π] so the easing never takes the long way
              // around the circle (avoids 360° spins on sign flips).
              let diff = rawAngle - smoothAngleRef.current
              while (diff > Math.PI) diff -= Math.PI * 2
              while (diff < -Math.PI) diff += Math.PI * 2
              smoothAngleRef.current += diff * 0.22
            }

            const sTip = smoothTipRef.current
            const sAngle = smoothAngleRef.current

            ctx.save()
            ctx.translate(sTip.x + dx, sTip.y + dy)
            ctx.rotate(sAngle)
            ctx.drawImage(okapiImg, -SIZE / 2, -SIZE, SIZE, SIZE)
            ctx.restore()
          } else if (state === 'crashed') {
            const anchor = crashAnchorRef.current ?? tip
            const t0 = crashStartRef.current ?? performance.now()
            const t = Math.min(1, (performance.now() - t0) / 1000)
            const fallDist = h - anchor.y + SIZE
            const yOff = t * fallDist
            const rot = (t * Math.PI) / 2
            const alpha = 1 - t

            ctx.save()
            ctx.globalAlpha = alpha
            ctx.translate(anchor.x + dx, anchor.y + dy + yOff)
            ctx.rotate(rot)
            ctx.drawImage(okapiImg, -SIZE / 2, -SIZE, SIZE, SIZE)
            ctx.restore()
          }
        }
      }

      if (state === 'crashed' || state === 'cashedout') {
        fadeAlphaRef.current = Math.max(0, fadeAlphaRef.current - 0.005)
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [state, startTime])

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 20,
      }}
    >
      <canvas
        ref={canvasRef}
        className={state === 'playing' ? 'okapi-run' : undefined}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 20,
        }}
      />
    </div>
  )
}
