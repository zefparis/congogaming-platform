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
  // High-resolution start timestamp (performance.now / RAF time) used ONLY
  // by the okapi sprite for analytic, jitter-free motion. Independent from
  // `startRef` (Date.now epoch) which still drives the curve sampling.
  const spriteStartRef = useRef<number | null>(null)
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
      spriteStartRef.current = null
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
      // Reset sprite high-res anchor: it will be captured on the first RAF
      // tick below so the sprite's elapsed time uses the real frame clock.
      spriteStartRef.current = null
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

    const draw = (now: number) => {
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

          if (state === 'playing' || state === 'cashedout') {
            // ANALYTIC position + rotation — fully decoupled from the per-RAF
            // sampled `pointsRef` so the sprite no longer micro-stutters when
            // the frame cadence is irregular.
            //
            // Same formula as the curve generator (see playing branch above):
            //   x  = X_PAD + min(w - 2*X_PAD, (t / SWEEP_SEC) * (w - 2*X_PAD))
            //   y  = h - Y_PAD - yNorm * (h - 2*Y_PAD)
            //   m  = 1 + 0.06 t + (0.06 t)^2
            //   yNorm = clamp01(log10(m) / log10(20))
            //
            // The high-res sprite clock is anchored on the FIRST RAF tick of
            // the playing/cashedout phase, then each subsequent frame uses the
            // RAF `now` argument — no Date.now() resolution loss.
            if (spriteStartRef.current == null) spriteStartRef.current = now
            const tSprite = Math.max(0, (now - spriteStartRef.current) / 1000)

            const SWEEP_SEC = 20
            const X_PAD = 20
            const Y_PAD = 20
            const sweepRange = w - X_PAD * 2
            const heightRange = h - Y_PAD * 2

            const xUncapped = (tSprite / SWEEP_SEC) * sweepRange
            const xCapped = Math.min(sweepRange, xUncapped)
            const xS = X_PAD + xCapped

            const a = 0.06
            const m = 1 + a * tSprite + (a * tSprite) * (a * tSprite)
            const log20 = Math.log(20)
            const yNormRaw = Math.log(m) / log20
            const yNorm = Math.min(1, yNormRaw)
            const yS = h - Y_PAD - yNorm * heightRange

            // Analytic derivatives → smooth rotation (no atan2 noise).
            //   dx/dt = sweepRange / SWEEP_SEC          (0 once x is capped)
            //   dm/dt = a + 2 a^2 t
            //   dyNorm/dt = (dm/dt) / (m * ln(20))      (0 once yNorm is capped)
            //   dy/dt = -heightRange * dyNorm/dt        (canvas y grows downward)
            const dxdt = xUncapped >= sweepRange ? 0 : sweepRange / SWEEP_SEC
            const dmdt = a + 2 * a * a * tSprite
            const dyNormDt = yNormRaw >= 1 ? 0 : dmdt / (m * log20)
            const dydt = -heightRange * dyNormDt

            // Fallback for the rare initial frame where both derivatives are
            // ~0 (e.g. axes both capped); keep angle horizontal.
            const angle = dxdt === 0 && dydt === 0 ? 0 : Math.atan2(dydt, dxdt)

            ctx.save()
            ctx.translate(xS + dx, yS + dy)
            ctx.rotate(angle)
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
