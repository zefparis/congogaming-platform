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

        // Aviator-style filled area under the curve: stronger gradient with
        // a mid-stop for a richer glow that still keeps the okapi readable.
        const grad = ctx.createLinearGradient(0, 0, 0, h)
        grad.addColorStop(0, isCrashed ? 'rgba(239,68,68,0.55)' : 'rgba(255,215,0,0.55)')
        grad.addColorStop(0.55, isCrashed ? 'rgba(239,68,68,0.22)' : 'rgba(255,215,0,0.22)')
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.beginPath()
        ctx.moveTo(pts[0].x, h)
        for (const p of pts) ctx.lineTo(p.x, p.y)
        ctx.lineTo(pts[pts.length - 1].x, h)
        ctx.closePath()
        ctx.fillStyle = grad
        // Subtle additive blend so the fill glows against the dark bg
        // without washing out the okapi sprite.
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        ctx.fill()
        ctx.restore()

        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
        ctx.lineWidth = 4
        ctx.strokeStyle = stroke
        ctx.shadowBlur = 25
        ctx.shadowColor = isCrashed ? '#ef4444' : '#FFD700'
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        ctx.stroke()

        if (state === 'playing') {
          const tip = pts[pts.length - 1]
          const pulse = 4 + Math.sin(performance.now() / 120) * 2
          ctx.beginPath()
          ctx.arc(tip.x, tip.y, pulse, 0, Math.PI * 2)
          ctx.fillStyle = '#FFD700'
          ctx.shadowBlur = 25
          ctx.shadowColor = 'rgba(255,215,0,1)'
          ctx.fill()
        }

        ctx.restore()

        // --- Okapi sprite at the tip of the curve ---
        if (okapiImg.complete && okapiImg.naturalWidth > 0) {
          const SIZE = 80
          const tip = pts[pts.length - 1]
          const prev = pts[Math.max(0, pts.length - 6)]

          if (state === 'playing' || state === 'cashedout') {
            // okapi-tip.png already faces right, matching the left-to-right
            // climb direction. No extra +π rotation is needed (which was
            // there to compensate the previous left-facing sprite).
            const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x)
            ctx.save()
            ctx.translate(tip.x + dx, tip.y + dy)
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
