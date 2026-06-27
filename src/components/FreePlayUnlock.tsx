/**
 * FreePlayUnlock — Gamified Reaction-Time Cognitive Test
 *
 * Presented to the user as a fun reflex challenge that awards 5 free
 * scratch-card plays. Covertly measures reaction-time cognitive signals
 * for the HCS dual-layer system.
 *
 * Flow:
 *   INTRO → GAME (5 rounds) → RESULTS → onComplete()
 *
 * Cognitive validity:
 *   - Random ISI (800–2500 ms) prevents anticipation
 *   - Exact appearance / tap timestamps recorded
 *   - Object position recorded for accuracy scoring
 *   - React time NOT shown during test to avoid behavioural influence
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSession } from '../lib/auth';

// ─── Types ───────────────────────────────────────────────────────────────────

type ObjectType = 'football' | 'star' | 'lightning' | 'diamond' | 'fire';

interface Round {
  roundNumber: number;
  reactionTimeMs: number;
  hit: boolean;
  objectType: ObjectType;
  position: { x: number; y: number };
  tapOffset?: { dx: number; dy: number };
}

type Phase = 'intro' | 'countdown' | 'game' | 'waiting' | 'results';

interface Props {
  onComplete: (freePlays: number) => void;
  onSkip: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const HCS_WIDGET_ID = 'afd56010-48f1-48fb-8436-7f77254f11e0';
const HCS_API = 'https://api.hcs-u7.org';
const TOTAL_ROUNDS = 5;
const OBJECT_VISIBLE_MS = 2000;
const MIN_ISI_MS = 800;
const MAX_ISI_MS = 2500;
const TARGET_SIZE_PX = 88;

const OBJECTS: { type: ObjectType; emoji: string; label: string }[] = [
  { type: 'football', emoji: '⚽', label: 'Football' },
  { type: 'star',     emoji: '⭐', label: 'Étoile' },
  { type: 'lightning',emoji: '⚡', label: 'Éclair' },
  { type: 'diamond',  emoji: '💎', label: 'Diamant' },
  { type: 'fire',     emoji: '🔥', label: 'Feu' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomObject(): typeof OBJECTS[number] {
  return OBJECTS[Math.floor(Math.random() * OBJECTS.length)];
}

/** Random position keeping target fully inside the play area (% coordinates). */
function randomPosition(
  areaW: number,
  areaH: number,
): { x: number; y: number } {
  const margin = TARGET_SIZE_PX / 2;
  const xPx = randomBetween(margin, areaW - margin);
  const yPx = randomBetween(margin + 40, areaH - margin - 20); // top+bottom padding
  return {
    x: Math.round((xPx / areaW) * 100),
    y: Math.round((yPx / areaH) * 100),
  };
}

function generateSessionId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function deviceType(): 'mobile' | 'desktop' {
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
}

const FREE_PLAYS_KEY = 'cg_free_plays_pending';

function creditFreePlays(n: number) {
  const existing = parseInt(localStorage.getItem(FREE_PLAYS_KEY) || '0', 10);
  localStorage.setItem(FREE_PLAYS_KEY, String(existing + n));
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function FreePlayUnlock({ onComplete, onSkip }: Props) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [countdown, setCountdown] = useState(3);
  const [currentRound, setCurrentRound] = useState(0);
  const [activeObj, setActiveObj] = useState<{
    type: ObjectType;
    emoji: string;
    position: { x: number; y: number };
    appearedAt: number;
  } | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [avgMs, setAvgMs] = useState(0);

  const areaRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef(generateSessionId());
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Cleanup ──────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // ── Countdown logic ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) {
      setPhase('waiting');
      scheduleNextObject(0);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // ── Schedule next object with random ISI ──────────────────────────────────
  const scheduleNextObject = useCallback((roundIdx: number) => {
    if (roundIdx >= TOTAL_ROUNDS) return;
    const isi = randomBetween(MIN_ISI_MS, MAX_ISI_MS);
    timeoutRef.current = setTimeout(() => {
      showObject(roundIdx);
    }, isi);
  }, []);

  const showObject = useCallback(
    (roundIdx: number) => {
      const area = areaRef.current;
      const w = area?.offsetWidth || 360;
      const h = area?.offsetHeight || 500;
      const pos = randomPosition(w, h);
      const obj = randomObject();

      setCurrentRound(roundIdx + 1);
      setActiveObj({
        type: obj.type,
        emoji: obj.emoji,
        position: pos,
        appearedAt: Date.now(),
      });
      setPhase('game');

      // Auto-miss after OBJECT_VISIBLE_MS
      timeoutRef.current = setTimeout(() => {
        recordRound(roundIdx, obj.type, pos, false, OBJECT_VISIBLE_MS, null);
      }, OBJECT_VISIBLE_MS);
    },
    [],
  );

  const recordRound = useCallback(
    (
      roundIdx: number,
      type: ObjectType,
      pos: { x: number; y: number },
      hit: boolean,
      rtMs: number,
      tapOffset: { dx: number; dy: number } | null,
    ) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setActiveObj(null);

      const round: Round = {
        roundNumber: roundIdx + 1,
        reactionTimeMs: rtMs,
        hit,
        objectType: type,
        position: pos,
        ...(tapOffset ? { tapOffset } : {}),
      };

      setRounds((prev) => {
        const next = [...prev, round];
        if (next.length >= TOTAL_ROUNDS) {
          // All rounds done — compute results
          const hitRts = next.filter((r) => r.hit).map((r) => r.reactionTimeMs);
          const average = avg(hitRts.length > 0 ? hitRts : next.map((r) => r.reactionTimeMs));
          setAvgMs(average);
          setPhase('results');
          submitData(next, average);
        } else {
          setPhase('waiting');
          scheduleNextObject(roundIdx + 1);
        }
        return next;
      });
    },
    [scheduleNextObject],
  );

  // ── Handle tap on object ──────────────────────────────────────────────────
  const handleTap = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!activeObj) return;
      const rt = Date.now() - activeObj.appearedAt;

      // Compute tap offset from object centre for accuracy recording
      let tapOffset: { dx: number; dy: number } | null = null;
      const area = areaRef.current;
      if (area) {
        const rect = area.getBoundingClientRect();
        const clientX =
          'touches' in e ? e.changedTouches[0]?.clientX ?? 0 : (e as React.MouseEvent).clientX;
        const clientY =
          'touches' in e ? e.changedTouches[0]?.clientY ?? 0 : (e as React.MouseEvent).clientY;
        const tapXPct = ((clientX - rect.left) / rect.width) * 100;
        const tapYPct = ((clientY - rect.top) / rect.height) * 100;
        tapOffset = {
          dx: Math.round(tapXPct - activeObj.position.x),
          dy: Math.round(tapYPct - activeObj.position.y),
        };
      }

      // Find the current round index
      setRounds((prev) => {
        const roundIdx = prev.length;
        recordRound(roundIdx, activeObj.type, activeObj.position, true, rt, tapOffset);
        return prev;
      });
    },
    [activeObj, recordRound],
  );

  // ── Submit data to HCS backend ────────────────────────────────────────────
  const submitData = useCallback(async (completedRounds: Round[], averageMs: number) => {
    const session = getSession();
    try {
      const body = {
        widgetId: HCS_WIDGET_ID,
        userId: session?.id || undefined,
        rounds: completedRounds,
        averageReactionTimeMs: averageMs,
        sessionId: sessionId.current,
        deviceType: deviceType(),
        timestamp: new Date().toISOString(),
      };
      await fetch(`${HCS_API}/api/cognitive/reaction-time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        // Fire-and-forget — never block user flow on network
        signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
      });
    } catch {
      // Fail silently — data collection is best-effort
    }

    // Credit free plays — logged-in user OR localStorage pending
    creditFreePlays(5);
  }, []);

  // ─── Render helpers ───────────────────────────────────────────────────────

  const hitRts = rounds.filter((r) => r.hit).map((r) => r.reactionTimeMs);
  const hitsCount = hitRts.length;

  function perfLabel(ms: number): string {
    if (ms < 300) return 'Incroyable ⚡';
    if (ms < 450) return 'Excellent 🔥';
    if (ms < 600) return 'Bien 👍';
    return 'Pas mal 😄';
  }

  // ─── STYLES (inline — no Tailwind dependency for modal overlay) ───────────

  const overlay: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.96)',
    overflowY: 'auto',
  };

  const card: React.CSSProperties = {
    width: '100%',
    maxWidth: 420,
    margin: '0 auto',
    padding: '28px 20px 32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    textAlign: 'center',
  };

  const goldText: React.CSSProperties = {
    color: '#FFD700',
    fontWeight: 800,
  };

  const greyText: React.CSSProperties = { color: '#aaa', fontSize: 14 };

  const primaryBtn: React.CSSProperties = {
    width: '100%',
    padding: '16px 0',
    borderRadius: 12,
    background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
    color: '#000',
    fontWeight: 800,
    fontSize: 18,
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(255,215,0,0.4)',
    marginTop: 8,
  };

  const skipBtn: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: '#666',
    fontSize: 13,
    cursor: 'pointer',
    textDecoration: 'underline',
    marginTop: 4,
    padding: 8,
  };

  // ─── Phase: INTRO ─────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <div style={overlay}>
        <div style={card}>
          <div style={{ fontSize: 64 }}>🎁</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#FFD700', lineHeight: 1.2 }}>
            Gagne 5 Free Plays !
          </div>
          <div style={{ color: '#ddd', fontSize: 15, lineHeight: 1.5, maxWidth: 300 }}>
            Complète le <strong style={{ color: '#FFD700' }}>défi réflexes</strong> en 30 secondes
            et débloque <strong style={{ color: '#FFD700' }}>5 grattages gratuits</strong>.
          </div>
          <div
            style={{
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              margin: '8px 0',
              flexWrap: 'wrap',
            }}
          >
            {OBJECTS.map((o) => (
              <span key={o.type} style={{ fontSize: 32 }}>
                {o.emoji}
              </span>
            ))}
          </div>
          <div style={{ ...greyText, fontSize: 13 }}>
            Tape sur chaque objet le plus vite possible !
          </div>
          <button
            style={primaryBtn}
            onClick={() => {
              setCountdown(3);
              setPhase('countdown');
            }}
          >
            JOUER 🎮
          </button>
          <button style={skipBtn} onClick={onSkip}>
            Non merci, continuer sans
          </button>
        </div>
      </div>
    );
  }

  // ─── Phase: COUNTDOWN ────────────────────────────────────────────────────
  if (phase === 'countdown') {
    return (
      <div style={overlay}>
        <div style={card}>
          <div style={{ fontSize: 20, color: '#aaa', letterSpacing: 2 }}>PRÊT ?</div>
          <div
            style={{
              fontSize: 120,
              fontWeight: 900,
              color: '#FFD700',
              lineHeight: 1,
              textShadow: '0 0 40px rgba(255,215,0,0.6)',
            }}
          >
            {countdown > 0 ? countdown : '⚡'}
          </div>
        </div>
      </div>
    );
  }

  // ─── Phase: GAME + WAITING ────────────────────────────────────────────────
  if (phase === 'game' || phase === 'waiting') {
    return (
      <div style={overlay}>
        {/* Progress bar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            background: '#111',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${(rounds.length / TOTAL_ROUNDS) * 100}%`,
              background: 'linear-gradient(90deg, #FFD700, #FFA500)',
              transition: 'width 0.3s ease',
            }}
          />
        </div>

        {/* Round counter */}
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            color: '#FFD700',
            fontWeight: 700,
            fontSize: 16,
            letterSpacing: 1,
          }}
        >
          Round {Math.min(currentRound, TOTAL_ROUNDS)}/{TOTAL_ROUNDS}
        </div>

        {/* Play area */}
        <div
          ref={areaRef}
          style={{
            position: 'relative',
            width: '100%',
            flex: 1,
            maxWidth: 480,
            margin: '56px 0 16px',
          }}
        >
          {/* Waiting hint */}
          {phase === 'waiting' && (
            <div
              style={{
                position: 'absolute',
                top: '45%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                color: '#333',
                fontSize: 14,
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            >
              ...
            </div>
          )}

          {/* Active object */}
          {phase === 'game' && activeObj && (
            <button
              onClick={handleTap}
              onTouchEnd={handleTap}
              style={{
                position: 'absolute',
                left: `calc(${activeObj.position.x}% - ${TARGET_SIZE_PX / 2}px)`,
                top: `calc(${activeObj.position.y}% - ${TARGET_SIZE_PX / 2}px)`,
                width: TARGET_SIZE_PX,
                height: TARGET_SIZE_PX,
                borderRadius: '50%',
                border: '3px solid rgba(255,215,0,0.6)',
                background: 'rgba(255,215,0,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 48,
                cursor: 'pointer',
                padding: 0,
                animation: 'popIn 0.15s ease-out',
                boxShadow: '0 0 24px rgba(255,215,0,0.35)',
                touchAction: 'manipulation',
              }}
              aria-label="Tape ici !"
            >
              {activeObj.emoji}
            </button>
          )}
        </div>

        {/* Round indicators */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '0 0 24px',
          }}
        >
          {Array.from({ length: TOTAL_ROUNDS }, (_, i) => (
            <div
              key={i}
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background:
                  i < rounds.length
                    ? rounds[i]?.hit
                      ? '#FFD700'
                      : '#444'
                    : i === rounds.length && phase === 'game'
                    ? '#FFA500'
                    : '#222',
                border: '2px solid',
                borderColor:
                  i < rounds.length ? (rounds[i]?.hit ? '#FFD700' : '#555') : '#333',
                transition: 'background 0.2s',
              }}
            />
          ))}
        </div>

        <style>{`
          @keyframes popIn {
            from { transform: scale(0.5); opacity: 0; }
            to   { transform: scale(1);   opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  // ─── Phase: RESULTS ───────────────────────────────────────────────────────
  return (
    <div style={overlay}>
      <div style={card}>
        <div style={{ fontSize: 64 }}>🎉</div>
        <div style={{ fontSize: 24, fontWeight: 900, ...goldText, lineHeight: 1.2 }}>
          Incroyable !
        </div>
        <div style={{ color: '#ddd', fontSize: 15 }}>
          Tu as débloqué{' '}
          <strong style={{ color: '#FFD700', fontSize: 20 }}>5 Free Scratch Cards</strong> !
        </div>

        {/* Stats */}
        <div
          style={{
            background: 'rgba(255,215,0,0.08)',
            border: '1px solid rgba(255,215,0,0.2)',
            borderRadius: 12,
            padding: '16px 20px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={greyText}>Réflexes</span>
            <span style={{ ...goldText, fontSize: 15 }}>{perfLabel(avgMs)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={greyText}>Objets touchés</span>
            <span style={{ color: '#fff', fontWeight: 700 }}>
              {hitsCount}/{TOTAL_ROUNDS}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: '1px solid rgba(255,215,0,0.15)',
              paddingTop: 8,
              marginTop: 4,
            }}
          >
            <span style={greyText}>Free Plays gagnés</span>
            <span style={{ color: '#FFD700', fontWeight: 900, fontSize: 18 }}>+5 🎟️</span>
          </div>
        </div>

        <button style={primaryBtn} onClick={() => onComplete(5)}>
          JOUER MAINTENANT 🎰
        </button>
      </div>
    </div>
  );
}
