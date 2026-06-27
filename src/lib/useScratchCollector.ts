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

import { useRef, useCallback } from 'react';

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

function deviceType(): 'mobile' | 'desktop' {
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
}

// ─── The hook ────────────────────────────────────────────────────────────────

export function useScratchCollector(userId?: string) {
  const stateRef = useRef<CollectorState | null>(null);

  /** Call when the ticket is purchased and the card is displayed */
  const onCardDisplayed = useCallback(() => {
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
      if (!s) return;

      const now = performance.now();

      // Record hover end on first touch
      if (s.firstTouchTs === -1) {
        s.firstTouchTs = now;
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

  /** Call inside the touchend / mouseup handler */
  const onTouchEnd = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    s.lastTouchTs = performance.now();

    // If user lifts finger after reveal, record stop time
    if (s.revealedAt !== -1 && s.stopAfterRevealTs === -1) {
      s.stopAfterRevealTs = s.lastTouchTs;
    }
  }, []);

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

  /** Call when full scratch completes (all cells revealed) */
  const onFullScratch = useCallback((coveredPct: number) => {
    const s = stateRef.current;
    if (!s) return;
    s.completedFullScratch = true;
    s.coveredAreaPct = 100;
    submitSession(coveredPct);
  }, []);

  /** Call after 2s idle OR on component unmount — fires the POST */
  const onSessionEnd = useCallback((coveredPct?: number) => {
    submitSession(coveredPct ?? stateRef.current?.coveredAreaPct ?? 0);
  }, []);

  // ── Internal submit (fire-and-forget) ──────────────────────────────────────

  function submitSession(coveredPct: number) {
    const s = stateRef.current;
    if (!s || s.submitted || s.touchPoints.length < 2) return;
    s.submitted = true;

    const pts = s.touchPoints;
    const now = performance.now();

    // Pressure stats
    const pressures = pts.map((p) => p.p);
    const pAvg = pressures.reduce((a, b) => a + b, 0) / pressures.length;
    const pStd = stdDev(pressures);
    const pMin = Math.min(...pressures);
    const pMax = Math.max(...pressures);

    // Touch radius
    const radii = pts.map((p) => p.r);
    const rAvg = radii.reduce((a, b) => a + b, 0) / radii.length;

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
      deviceType: deviceType(),
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

    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
    } else {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
        signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined,
      }).catch(() => {});
    }
  }

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
