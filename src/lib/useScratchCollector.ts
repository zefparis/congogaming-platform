/**
 * useScratchCollector — Silent cognitive signal collector for the Scratch Card game.
 *
 * Runs entirely in refs (no React re-renders, no state updates) for zero
 * performance impact on the canvas scratch loop. All timestamps use
 * performance.now() for sub-millisecond precision.
 *
 * Design principles:
 *  - Never block the game loop (all work is synchronous, < 0.1 ms per event)
 *  - Never expose collected data to the user
 *  - Fire-and-forget POST when the session ends
 *  - Optimised for Xiaomi 4G: payload < 2 KB, no images
 */

import { useRef, useCallback, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScratchTouchPoint {
  t: number;       // performance.now() timestamp ms
  x: number;       // canvas pixel x
  y: number;       // canvas pixel y
  p: number;       // force / pressure (0–1, 0.5 default on devices without force)
  r: number;       // radiusX (contact area, px)
}

type ScratchPattern = 'circular' | 'linear' | 'random';

export interface ScratchSignals {
  widgetId: string;
  sessionId: string;
  userId?: string;
  deviceType: 'mobile' | 'desktop';
  timestamp: string;                    // ISO start-of-session

  // Pre-scratch
  timeBeforeFirstScratchMs: number;
  initialHoverDurationMs: number;       // desktop only, 0 on mobile

  // During scratch
  totalTouchEvents: number;
  totalScratchDurationMs: number;
  pressureAvg: number;
  pressureStd: number;
  pressureMin: number;
  pressureMax: number;
  touchRadiusAvg: number;
  velocityAvg: number;                  // px/ms
  velocityStd: number;
  accelerationAvg: number;              // px/ms²
  scratchPattern: ScratchPattern;
  directionChanges: number;
  coveredAreaPct: number;               // 0–100
  idlePeriods: number;                  // gaps > 500ms

  // Reveal reaction
  pauseOnReveal: boolean;
  velocityChangeOnReveal: number;       // px/ms delta around reveal moment; 0 if no reveal yet
  timeToStopAfterRevealMs: number;      // −1 if not yet stopped
  revealedSymbolCount: number;

  // Post-scratch
  completedFullScratch: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HCS_API = 'https://api.hcs-u7.org';
const HCS_WIDGET_ID = 'afd56010-48f1-48fb-8436-7f77254f11e0';
const IDLE_THRESHOLD_MS = 500;
const DIRECTION_ANGLE_THRESHOLD = Math.PI / 4; // 45° counts as a direction change

// ─── Internal state shape stored in a single ref ─────────────────────────────

interface CollectorState {
  sessionId: string;
  sessionStartTs: number;       // performance.now() when card was displayed
  firstTouchTs: number;         // performance.now() on first touchstart/mousedown
  lastTouchTs: number;
  touchPoints: ScratchTouchPoint[];
  mouseHoverStartTs: number;    // performance.now() when mouseover fired (desktop only)
  hoverDurationMs: number;
  idlePeriods: number;
  revealedAt: number;           // performance.now() when first cell revealed; -1 if not yet
  revealedSymbolCount: number;
  velocityBeforeReveal: number;
  velocityAfterReveal: number;
  stopAfterRevealTs: number;    // performance.now() when user lifted finger after reveal
  completedFullScratch: boolean;
  coveredAreaPct: number;
  submitted: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Classify scratch pattern from sequence of (x,y) points */
function classifyPattern(pts: ScratchTouchPoint[]): ScratchPattern {
  if (pts.length < 4) return 'random';

  // Compute bounding box aspect ratio — a very narrow bbox suggests linear
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const w = maxX - minX;
  const h = maxY - minY;
  const aspect = Math.max(w, h) / (Math.min(w, h) + 1);

  if (aspect > 4) return 'linear';

  // Check for circular: compute centroid distance variance
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const dists = pts.map((p) => Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2));
  const distCV = stdDev(dists) / (dists.reduce((a, b) => a + b, 0) / dists.length + 1);
  if (distCV < 0.25 && pts.length > 10) return 'circular';

  return 'random';
}

/** Count direction reversals from a sequence of points */
function countDirectionChanges(pts: ScratchTouchPoint[]): number {
  if (pts.length < 3) return 0;
  let changes = 0;
  let prevAngle: number | null = null;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    const angle = Math.atan2(dy, dx);
    if (prevAngle !== null) {
      let diff = Math.abs(angle - prevAngle);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff > DIRECTION_ANGLE_THRESHOLD) changes++;
    }
    prevAngle = angle;
  }
  return changes;
}

/** Compute per-segment velocities (px/ms) from touch point sequence */
function computeVelocities(pts: ScratchTouchPoint[]): number[] {
  const vels: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const dt = pts[i].t - pts[i - 1].t;
    if (dt <= 0) continue;
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    vels.push(Math.sqrt(dx * dx + dy * dy) / dt);
  }
  return vels;
}

/** Compute accelerations (px/ms²) from velocity sequence */
function computeAccelerations(vels: number[], pts: ScratchTouchPoint[]): number[] {
  const accels: number[] = [];
  for (let i = 1; i < vels.length; i++) {
    const dt = pts[i + 1].t - pts[i].t;
    if (dt <= 0) continue;
    accels.push(Math.abs(vels[i] - vels[i - 1]) / dt);
  }
  return accels;
}

// ─── Debug toast (remove after mobile debugging) ────────────────────────────
function showToast(msg: string) {
  const div = document.createElement('div');
  div.style.cssText = [
    'position:fixed', 'bottom:80px', 'left:50%',
    'transform:translateX(-50%)',
    'background:rgba(0,0,0,0.85)', 'color:#FFD700',
    'padding:8px 16px', 'border-radius:8px',
    'font-size:12px', 'z-index:99999',
    'max-width:90vw', 'text-align:center',
    'pointer-events:none',
  ].join(';');
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 3000);
}

function detectDeviceType(): 'mobile' | 'desktop' {
  // maxTouchPoints > 0 is the reliable signal — UA regex misses Xiaomi/Android Chrome
  const hasTouchPoints = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  const hasOntouchstart = 'ontouchstart' in window;
  return (hasTouchPoints || hasOntouchstart) ? 'mobile' : 'desktop';
}

// ─── The hook ────────────────────────────────────────────────────────────────

export function useScratchCollector(userId?: string) {
  const stateRef = useRef<CollectorState | null>(null);
  // Dedicated dedup ref — survives stateRef resets, cleared only by onCardDisplayed
  const submittedRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Internal submit (stable ref-based, safe to call from any closure) ──────
  // Declared as a useCallback so onFullScratch/onSessionEnd can capture it
  // without stale-closure issues (it only depends on stable refs).
  const submitSession = useCallback((coveredPct: number) => {
    if (submittedRef.current) {
      console.log('[HCS-SCRATCH] submit prevented - already submitted this session');
      return;
    }
    const s = stateRef.current;
    if (!s) {
      console.log('[HCS-SCRATCH] submitSession: no state, skipping');
      return;
    }
    if (s.touchPoints.length < 1) {
      console.log('[HCS-SCRATCH] submitSession: no touch points, skipping');
      return;
    }
    showToast('📤 Submitting to HCS...');
    submittedRef.current = true;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

    const pts = s.touchPoints;
    const now = performance.now();

    // Pressure stats
    const pressures = pts.map((p) => p.p);
    const pAvg = pressures.reduce((a, b) => a + b, 0) / pressures.length;
    const pStdRaw = stdDev(pressures);
    const pMin = Math.min(...pressures);
    const pMax = Math.max(...pressures);

    // Touch radius
    const radii = pts.map((p) => p.r);
    const rAvg = radii.reduce((a, b) => a + b, 0) / radii.length;
    const rStd = stdDev(radii);

    // Android normalises Touch.force to a constant 0.5, making pressureStd always 0.
    // When on mobile with flat pressure, substitute touch-radius std-dev as the
    // pressure-variance proxy — it carries a real human signal (contact area variation).
    const isMobile = detectDeviceType() === 'mobile';
    const pStd = (isMobile && pStdRaw < 0.01) ? rStd : pStdRaw;

    // Velocity / acceleration
    const vels = computeVelocities(pts);
    const vAvg = vels.length ? vels.reduce((a, b) => a + b, 0) / vels.length : 0;
    const vStd = stdDev(vels);
    const accels = computeAccelerations(vels, pts);
    const aAvg = accels.length ? accels.reduce((a, b) => a + b, 0) / accels.length : 0;

    // Pattern + direction
    const pattern = classifyPattern(pts);
    const dirChanges = countDirectionChanges(pts);

    // Timing
    const timeBeforeFirst =
      s.firstTouchTs === -1 ? 0 : Math.round(s.firstTouchTs - s.sessionStartTs);
    const totalDuration =
      s.firstTouchTs === -1 ? 0 : Math.round((s.lastTouchTs !== -1 ? s.lastTouchTs : now) - s.firstTouchTs);

    // Reveal reaction
    const velDelta =
      s.revealedAt !== -1 ? s.velocityAfterReveal - s.velocityBeforeReveal : 0;
    const pauseOnReveal =
      s.revealedAt !== -1 && s.stopAfterRevealTs !== -1
        ? s.stopAfterRevealTs - s.revealedAt < 800
        : false;
    const timeToStopAfterReveal =
      s.revealedAt !== -1 && s.stopAfterRevealTs !== -1
        ? Math.round(s.stopAfterRevealTs - s.revealedAt)
        : -1;

    const payload: ScratchSignals = {
      widgetId: HCS_WIDGET_ID,
      sessionId: s.sessionId,
      userId: userId || undefined,
      deviceType: detectDeviceType(),
      timestamp: new Date().toISOString(),

      timeBeforeFirstScratchMs: timeBeforeFirst,
      initialHoverDurationMs: Math.round(s.hoverDurationMs),

      totalTouchEvents: pts.length,
      totalScratchDurationMs: totalDuration,
      pressureAvg: Math.round(pAvg * 1000) / 1000,
      pressureStd: Math.round(pStd * 1000) / 1000,
      pressureMin: Math.round(pMin * 1000) / 1000,
      pressureMax: Math.round(pMax * 1000) / 1000,
      touchRadiusAvg: Math.round(rAvg * 10) / 10,
      velocityAvg: Math.round(vAvg * 1000) / 1000,
      velocityStd: Math.round(vStd * 1000) / 1000,
      accelerationAvg: Math.round(aAvg * 10000) / 10000,
      scratchPattern: pattern,
      directionChanges: dirChanges,
      coveredAreaPct: Math.round(coveredPct),
      idlePeriods: s.idlePeriods,

      pauseOnReveal,
      velocityChangeOnReveal: Math.round(velDelta * 1000) / 1000,
      timeToStopAfterRevealMs: timeToStopAfterReveal,
      revealedSymbolCount: s.revealedSymbolCount,

      completedFullScratch: s.completedFullScratch,
    };

    // Fire and forget — use sendBeacon when available (survives page unload)
    const body = JSON.stringify(payload);
    const url = `${HCS_API}/api/cognitive/scratch-interaction`;

    console.log('[HCS-SCRATCH] Submitting payload:', {
      sessionId: payload.sessionId.slice(0, 8) + '…',
      touchEvents: payload.totalTouchEvents,
      durationMs: payload.totalScratchDurationMs,
      pattern: payload.scratchPattern,
      coveredPct: payload.coveredAreaPct,
      pressureStd: payload.pressureStd,
      url,
    });

    // credentials: 'omit' — anonymous endpoint, no cookies needed.
    // keepalive: true    — survives page navigation / unload (like sendBeacon).
    // sendBeacon with a JSON Blob sends cookies implicitly and fails with
    // Access-Control-Allow-Origin: * (wildcard + credentials = CORS error).
    console.log('[HCS-SCRATCH] fetch (credentials:omit, keepalive:true) →', url);
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      credentials: 'omit',
      keepalive: true,
    })
      .then((r) => { console.log('[HCS-SCRATCH] fetch response status:', r.status); showToast('✅ HCS received: ' + r.status); })
      .catch((err) => { console.error('[HCS-SCRATCH] fetch error:', err); showToast('❌ Fetch error: ' + (err instanceof Error ? err.message : String(err))); });
  }, [userId]);

  /** Call when the ticket is purchased and the card is displayed */
  const onCardDisplayed = useCallback(() => {
    console.log('[HCS-SCRATCH] onCardDisplayed — new session started');
    showToast('🎯 Card displayed - session started');
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    submittedRef.current = false;
    stateRef.current = {
      sessionId: generateId(),
      sessionStartTs: performance.now(),
      firstTouchTs: -1,
      lastTouchTs: -1,
      touchPoints: [],
      mouseHoverStartTs: -1,
      hoverDurationMs: 0,
      idlePeriods: 0,
      revealedAt: -1,
      revealedSymbolCount: 0,
      velocityBeforeReveal: 0,
      velocityAfterReveal: 0,
      stopAfterRevealTs: -1,
      completedFullScratch: false,
      coveredAreaPct: 0,
      submitted: false,
    };
  }, []);

  // TRIGGER 4 — visibilitychange: fires when user switches app or locks phone
  // Most reliable mobile signal — registered once, cleaned up on unmount
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        console.log('[HCS-SCRATCH] visibilitychange: page hidden — submitting');
        showToast('👁 Visibility hidden - submitting');
        submitSession(stateRef.current?.coveredAreaPct ?? 0);
      }
    };
    window.addEventListener('visibilitychange', handleVisibilityChange);
    return () => window.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [submitSession]);

  /** Call inside mouseenter / mouseover on the canvas (desktop hover) */
  const onMouseEnter = useCallback(() => {
    const s = stateRef.current;
    if (!s || s.firstTouchTs !== -1) return; // only track pre-scratch hover
    if (s.mouseHoverStartTs === -1) {
      s.mouseHoverStartTs = performance.now();
    }
  }, []);

  /** Call inside the touchstart / mousedown handler — before scratchAt() */
  const onTouchStart = useCallback(
    (e: TouchEvent | MouseEvent, canvasX: number, canvasY: number) => {
      const s = stateRef.current;
      if (!s) {
        console.log('[HCS-SCRATCH] onTouchStart: no session state — onCardDisplayed not called?');
        return;
      }

      // Cancel any pending idle-submit when user touches again
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }

      const now = performance.now();

      // Record hover end on first touch
      if (s.firstTouchTs === -1) {
        s.firstTouchTs = now;
        showToast('👆 First touch detected');
        console.log('[HCS-SCRATCH] onTouchStart: first touch, timeBeforeFirst=', Math.round(now - s.sessionStartTs), 'ms');
        if (s.mouseHoverStartTs !== -1) {
          s.hoverDurationMs = now - s.mouseHoverStartTs;
        }
      } else if (s.lastTouchTs !== -1 && now - s.lastTouchTs > IDLE_THRESHOLD_MS) {
        s.idlePeriods++;
      }

      s.lastTouchTs = now;

      // Extract pressure & radius from TouchEvent when available
      let pressure = 0.5;
      let radius = 10;
      if ('touches' in e && e.touches.length > 0) {
        const t = e.touches[0];
        pressure = (t as any).force ?? (t as any).webkitForce ?? 0.5;
        radius = t.radiusX ?? 10;
      }

      s.touchPoints.push({ t: now, x: canvasX, y: canvasY, p: pressure, r: radius });
      if (s.touchPoints.length % 20 === 0) {
        console.log('[HCS-SCRATCH] touchPoints count:', s.touchPoints.length, 'pressure:', pressure.toFixed(3));
      }
    },
    [],
  );

  /** Call inside the touchmove / mousemove handler — after scratchAt() */
  const onTouchMove = useCallback(
    (e: TouchEvent | MouseEvent, canvasX: number, canvasY: number) => {
      const s = stateRef.current;
      if (!s || s.firstTouchTs === -1) return;

      const now = performance.now();
      s.lastTouchTs = now;

      let pressure = 0.5;
      let radius = 10;
      if ('touches' in e && e.touches.length > 0) {
        const t = e.touches[0];
        pressure = (t as any).force ?? (t as any).webkitForce ?? 0.5;
        radius = t.radiusX ?? 10;
      }

      s.touchPoints.push({ t: now, x: canvasX, y: canvasY, p: pressure, r: radius });
    },
    [],
  );

  /** Call inside the touchend / mouseup handler — starts adaptive idle countdown */
  const onTouchEnd = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    s.lastTouchTs = performance.now();

    // If user lifts finger after reveal, record stop time
    if (s.revealedAt !== -1 && s.stopAfterRevealTs === -1) {
      s.stopAfterRevealTs = s.lastTouchTs;
    }

    // TRIGGER 2 — adaptive idle delay: 500ms mobile, 2000ms desktop
    const isMobile = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
    const idleDelay = isMobile ? 500 : 2000;
    console.log('[HCS-SCRATCH] idle timer delay:', idleDelay, 'ms');
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      console.log('[HCS-SCRATCH] idle timer fired (', idleDelay, 'ms) — submitting');
      submitSession(s.coveredAreaPct);
    }, idleDelay);

    console.log('[HCS-SCRATCH] onTouchEnd — points so far:', s.touchPoints.length, ', idle timer armed');
  }, [submitSession]);

  /** Call when a cell becomes revealed (from measureCell / onAllRevealed) */
  const onCellRevealed = useCallback((revealedCount: number, coveredPct: number) => {
    const s = stateRef.current;
    if (!s) return;

    s.revealedSymbolCount = revealedCount;
    s.coveredAreaPct = Math.round(coveredPct);

    if (s.revealedAt === -1 && revealedCount > 0) {
      // First reveal — capture velocity context window
      const now = performance.now();
      s.revealedAt = now;
      console.log('[HCS-SCRATCH] First cell revealed, count=', revealedCount);

      // Velocity just before reveal: average last 3 segments
      const vels = computeVelocities(s.touchPoints);
      const pre = vels.slice(-3);
      s.velocityBeforeReveal = pre.length
        ? pre.reduce((a, b) => a + b, 0) / pre.length
        : 0;
    } else if (s.revealedAt !== -1 && revealedCount > 1) {
      // Subsequent reveal — update post-reveal velocity
      const vels = computeVelocities(s.touchPoints);
      const post = vels.slice(-3);
      s.velocityAfterReveal = post.length
        ? post.reduce((a, b) => a + b, 0) / post.length
        : 0;
    }
  }, []);

  /** Call when full scratch completes (all cells revealed) — TRIGGER 1: submit immediately */
  const onFullScratch = useCallback((coveredPct: number) => {
    const s = stateRef.current;
    if (!s) return;
    console.log('[HCS-SCRATCH] onFullScratch triggered - submitting immediately');
    showToast('✅ Full scratch - submitting now');
    s.completedFullScratch = true;
    s.coveredAreaPct = 100;
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    submitSession(coveredPct);
  }, [submitSession]);

  /** TRIGGER 3 — onSessionEnd: called by ScratchScreen useEffect cleanup on unmount */
  const onSessionEnd = useCallback((coveredPct?: number) => {
    console.log('[HCS-SCRATCH] onSessionEnd called');
    submitSession(coveredPct ?? stateRef.current?.coveredAreaPct ?? 0);
  }, [submitSession]);

  return {
    onCardDisplayed,
    onMouseEnter,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onCellRevealed,
    onFullScratch,
    onSessionEnd,
  };
}
