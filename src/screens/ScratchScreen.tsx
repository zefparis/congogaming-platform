import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { displayError } from '../lib/errors';
import { ArrowLeft, Wallet } from 'lucide-react';
import { api } from '../lib/api';
import { getSession, refreshBalance } from '../lib/auth';
import FarmingBar from '../components/FarmingBar';
import FreePlayUnlock from '../components/FreePlayUnlock';

type Sym = 'okapi' | 'diamond' | 'lightning' | 'star' | 'coin' | 'flame';

const BETS = [500, 1000, 2000, 5000] as const;

const SYMBOL_EMOJI: Record<Exclude<Sym, 'okapi'>, string> = {
  diamond: '💎',
  lightning: '⚡',
  star: '⭐',
  coin: '🪙',
  flame: '🔥',
};
const SYMBOL_VALUE_LABEL: Record<Sym, string> = {
  okapi: '×50',
  diamond: '×20',
  lightning: '×10',
  star: '×5',
  coin: '×3',
  flame: '×2',
};

const CANVAS = 288;
const CELL = 90;
const GAP = 9;
const PAD = (CANVAS - CELL * 3 - GAP * 2) / 2;
const BRUSH = 25;
const REVEAL_THRESHOLD = 0.55;

const cellRect = (i: number) => {
  const col = i % 3;
  const row = Math.floor(i / 3);
  return {
    x: PAD + col * (CELL + GAP),
    y: PAD + row * (CELL + GAP),
    w: CELL,
    h: CELL,
  };
};

const FREE_PLAYS_KEY = 'cg_free_plays_pending';

export default function ScratchScreen() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const session = getSession();
  const userId = session?.id ?? '';
  const [balance, setBalance] = useState<number>(session?.balance_cdf ?? 0);
  const [bet, setBet] = useState<number>(1000);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [grid, setGrid] = useState<Sym[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ win: number; bet: number } | null>(null);

  // Free Play Unlock gate — show once per page-load if not already completed
  const [showFreePlay, setShowFreePlay] = useState<boolean>(() => {
    // Skip if user already has pending free plays from a previous visit
    const pending = parseInt(localStorage.getItem(FREE_PLAYS_KEY) || '0', 10);
    return pending === 0;
  });
  const [freePlaysAvailable, setFreePlaysAvailable] = useState<number>(() => {
    return parseInt(localStorage.getItem(FREE_PLAYS_KEY) || '0', 10);
  });
  // Visual cue: flash the header balance green for ~2s after the server
  // credits a winning ticket so the user has an unambiguous confirmation
  // that the new balance has landed.
  const [balanceFlash, setBalanceFlash] = useState(false);

  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const okapiImg = useRef<HTMLImageElement | null>(null);
  const [okapiReady, setOkapiReady] = useState(false);

  const drawingRef = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const cellRevealedRef = useRef<boolean[]>(Array(9).fill(false));
  const cellStrokesRef = useRef<number[]>(Array(9).fill(0));
  const claimingRef = useRef(false);

  // Sync the cached session balance on mount.
  useEffect(() => {
    if (!userId) return;
    refreshBalance(userId).then(setBalance).catch(() => {});

    // Refresh balance every 30 seconds to catch admin adjustments
    const interval = setInterval(() => {
      if (userId) refreshBalance(userId).then(setBalance).catch(() => {});
    }, 30000);

    return () => clearInterval(interval);
  }, [userId]);

  // Preload okapi image once. We bump `okapiReady` so the drawing effect
  // re-renders the grid once the image is actually decoded — without it the
  // jackpot cells would silently fall through to the emoji fallback if the
  // network call lost the race against the canvas draw.
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      okapiImg.current = img;
      setOkapiReady(true);
    };
    img.onerror = () => {
      okapiImg.current = null;
    };
    img.src = '/images/okapi/okapi-tip.png';
  }, []);

  // Ensure the canvas internal pixel buffer matches its CSS size. Without
  // this the bottom canvas can render black when its offsetWidth/Height are
  // measured to 0 during the very first layout pass.
  const sizeCanvas = (canvas: HTMLCanvasElement) => {
    const w = canvas.offsetWidth || CANVAS;
    const h = canvas.offsetHeight || CANVAS;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  };

  // ----- BASE LAYER: 3×3 grid with symbols (drawn once per ticket) -----
  const drawBase = useCallback(() => {
    const canvas = baseRef.current;
    if (!canvas || !grid) return;
    sizeCanvas(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS, CANVAS);

    const bg = ctx.createLinearGradient(0, 0, CANVAS, CANVAS);
    bg.addColorStop(0, '#0a0a0a');
    bg.addColorStop(0.5, '#000000');
    bg.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CANVAS, CANVAS);

    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 14px Arial';
    for (let y = 14; y < CANVAS; y += 28) {
      for (let x = -10 + ((y / 28) % 2) * 14; x < CANVAS; x += 38) {
        ctx.fillText('CG', x, y);
      }
    }
    ctx.restore();

    for (let i = 0; i < 9; i++) {
      const r = cellRect(i);
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = 'rgba(255,215,0,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

      const sym = grid[i];
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (sym === 'okapi') {
        if (okapiImg.current) {
          ctx.drawImage(okapiImg.current, cx - 25, cy - 30, 50, 50);
        } else {
          ctx.fillStyle = '#FFD700';
          ctx.font = 'bold 32px Arial';
          ctx.fillText('🦓', cx, cy - 10);
        }
      } else {
        ctx.font = '40px Arial';
        ctx.fillText(SYMBOL_EMOJI[sym as Exclude<Sym, 'okapi'>], cx, cy - 10);
      }
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 12px Arial';
      ctx.fillText(SYMBOL_VALUE_LABEL[sym], cx, cy + 28);
    }
  }, [grid]);

  // ----- SCRATCH LAYER: opaque gold-grey surface user erases -----
  const drawScratchLayer = useCallback(() => {
    const canvas = scratchRef.current;
    if (!canvas) return;
    sizeCanvas(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, CANVAS, CANVAS);

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#FFD700');
    gradient.addColorStop(0.5, '#DAA520');
    gradient.addColorStop(1, '#B8860B');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const sheen = ctx.createLinearGradient(0, 0, CANVAS, CANVAS);
    sheen.addColorStop(0, 'rgba(255,255,255,0.2)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0.02)');
    sheen.addColorStop(1, 'rgba(255,255,255,0.2)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, CANVAS, CANVAS);

    ctx.fillStyle = 'rgba(255,215,0,0.85)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 22px Arial';
    ctx.fillText(t('scratch.scratch_prompt'), CANVAS / 2, CANVAS / 2 - 10);
    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = 'rgba(255,215,0,0.65)';
    ctx.fillText(t('scratch.with_finger'), CANVAS / 2, CANVAS / 2 + 14);
  }, [t]);

  // Draw both layers AFTER the ticket is purchased and the canvases are
  // mounted/laid out. A requestAnimationFrame tick gives the browser a
  // chance to compute offsetWidth/offsetHeight; without it, sizeCanvas can
  // read 0 and the base layer renders as an empty (black-looking) rect.
  useEffect(() => {
    if (!ticketId || !grid) return;
    cellRevealedRef.current = Array(9).fill(false);
    cellStrokesRef.current = Array(9).fill(0);
    claimingRef.current = false;
    const raf = requestAnimationFrame(() => {
      drawBase();
      drawScratchLayer();
    });
    return () => cancelAnimationFrame(raf);
  }, [ticketId, grid, okapiReady, drawBase, drawScratchLayer]);

  // Idle paint: when there is no active ticket, fill the scratch (top)
  // canvas with the gold gradient + "ACHETER" hint AND wipe the base
  // (symbols) canvas. The symbols layer must NEVER hold pixels before the
  // ticket is purchased — otherwise the outcome would be visible to anyone
  // who could peek behind the overlay (or to the user himself if the top
  // canvas failed to paint for any reason).
  useEffect(() => {
    if (ticketId) return;
    const top = scratchRef.current;
    const base = baseRef.current;
    const raf = requestAnimationFrame(() => {
      if (base) {
        sizeCanvas(base);
        const bctx = base.getContext('2d');
        if (bctx) bctx.clearRect(0, 0, base.width, base.height);
      }
      if (!top) return;
      sizeCanvas(top);
      const ctx = top.getContext('2d');
      if (!ctx) return;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, top.width, top.height);
      const gradient = ctx.createLinearGradient(0, 0, top.width, top.height);
      gradient.addColorStop(0, '#FFD700');
      gradient.addColorStop(0.5, '#DAA520');
      gradient.addColorStop(1, '#B8860B');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, top.width, top.height);
      // Premium idle splash — DOM overlay above the canvas carries the
      // marketing copy (GRATTEZ & GAGNEZ + sub-line + jackpot badge), so we
      // keep the canvas itself almost clean: just a faint inner sheen.
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.font = 'bold 22px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★ CONGO SCRATCH ★', top.width / 2, top.height / 2);
    });
    return () => cancelAnimationFrame(raf);
  }, [ticketId]);

  const measureCell = (ctx: CanvasRenderingContext2D, i: number) => {
    const r = cellRect(i);
    const data = ctx.getImageData(r.x, r.y, r.w, r.h).data;
    const step = 5;
    let cleared = 0;
    let total = 0;
    for (let py = 0; py < r.h; py += step) {
      for (let px = 0; px < r.w; px += step) {
        const idx = (py * r.w + px) * 4 + 3;
        if (data[idx] < 32) cleared++;
        total++;
      }
    }
    return cleared / total;
  };

  const onAllRevealed = useCallback(async () => {
    if (claimingRef.current || !ticketId || !userId) return;
    if (!cellRevealedRef.current.every(Boolean)) return;
    claimingRef.current = true;

    const canvas = scratchRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d')!;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillRect(0, 0, CANVAS, CANVAS);
      ctx.restore();
    }
    try {
      const r = await api.scratchClaim(userId, ticketId);
      // SERVER-ONLY TRUTH: win is decided exclusively by the backend.
      // The grid symbols rendered on the base canvas are purely cosmetic
      // and MUST NOT influence win detection. Any client-side grid
      // evaluation would be a security regression.
      const winAmount = Number(r.win_amount_cdf || 0);
      const isWin = winAmount > 0;
      // Use the authoritative new_balance from the claim response when
      // present (server already includes it post-credit) — falls back to
      // a fresh refreshBalance() if the field is missing.
      if (r.new_balance !== undefined && r.new_balance !== null) {
        setBalance(Number(r.new_balance));
      } else {
        refreshBalance(userId).then(setBalance).catch(() => {});
      }
      // Belt-and-suspenders: persist the new balance into the session so
      // other screens see the credit without a page refresh.
      refreshBalance(userId).catch(() => {});
      if (isWin) {
        setBalanceFlash(true);
        window.setTimeout(() => setBalanceFlash(false), 2000);
      }
      setResult({ win: isWin ? winAmount : 0, bet });
    } catch (e) {
      console.error(e);
      // On network/claim failure, we do NOT infer a win locally.
      setResult({ win: 0, bet });
    }
  }, [ticketId, bet, userId]);

  // Safety auto-reveal after 20s of inactivity.
  useEffect(() => {
    if (!ticketId) return;
    const t = setTimeout(() => {
      if (claimingRef.current) return;
      cellRevealedRef.current = Array(9).fill(true);
      onAllRevealed();
    }, 20000);
    return () => clearTimeout(t);
  }, [ticketId, onAllRevealed]);

  const scratchAt = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = scratchRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      const x = (clientX - rect.left) * sx;
      const y = (clientY - rect.top) * sy;

      const ctx = canvas.getContext('2d')!;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = BRUSH * 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (lastPos.current) {
        ctx.beginPath();
        ctx.moveTo(lastPos.current.x, lastPos.current.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x, y, BRUSH, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      lastPos.current = { x, y };

      for (let i = 0; i < 9; i++) {
        if (cellRevealedRef.current[i]) continue;
        const r = cellRect(i);
        if (x < r.x - BRUSH || x > r.x + r.w + BRUSH) continue;
        if (y < r.y - BRUSH || y > r.y + r.h + BRUSH) continue;
        cellStrokesRef.current[i]++;
        if (cellStrokesRef.current[i] % 4 !== 0) continue;
        const pct = measureCell(ctx, i);
        if (pct > REVEAL_THRESHOLD) {
          cellRevealedRef.current[i] = true;
          ctx.save();
          ctx.globalCompositeOperation = 'destination-out';
          ctx.fillRect(r.x, r.y, r.w, r.h);
          ctx.restore();
          onAllRevealed();
        }
      }
    },
    [onAllRevealed],
  );

  useEffect(() => {
    const canvas = scratchRef.current;
    if (!canvas) return;
    if (!grid || result) return;

    const start = (x: number, y: number) => {
      drawingRef.current = true;
      lastPos.current = null;
      scratchAt(x, y);
    };
    const move = (x: number, y: number) => {
      if (!drawingRef.current) return;
      scratchAt(x, y);
    };
    const end = () => {
      drawingRef.current = false;
      lastPos.current = null;
    };

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      start(e.clientX, e.clientY);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (drawingRef.current) move(e.clientX, e.clientY);
    };
    const onMouseUp = () => end();

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      if (t) start(t.clientX, t.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      if (t) move(t.clientX, t.clientY);
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      end();
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [grid, result, scratchAt]);

  const buy = async () => {
    if (busy || !userId) return;
    setBusy(true);
    setResult(null);
    setGrid(null);
    setTicketId(null);

    // Consume a free play if available, otherwise charge CDF balance as usual
    const usingFreePlay = freePlaysAvailable > 0 && balance < bet;
    if (usingFreePlay) {
      const remaining = freePlaysAvailable - 1;
      localStorage.setItem(FREE_PLAYS_KEY, String(remaining));
      setFreePlaysAvailable(remaining);
    }

    try {
      const r = await api.scratchBuy(userId, usingFreePlay ? 0 : bet);
      const newBal = await refreshBalance(userId).catch(() => null);
      if (newBal != null) setBalance(newBal);
      setTicketId(r.ticket_id);
      // XP awarded server-side for this wager — refresh the farming bar.
      window.dispatchEvent(new Event('farming:refresh'));
      setGrid(r.grid as Sym[]);
    } catch (e: any) {
      alert(displayError(t, e?.code, e?.message));
    } finally {
      setBusy(false);
    }
  };

  const playAgain = () => {
    setResult(null);
    setGrid(null);
    setTicketId(null);
  };

  const canBuy = (balance >= bet || freePlaysAvailable > 0) && !busy && !ticketId;

  const handleFreePlayComplete = (awarded: number) => {
    const total = freePlaysAvailable + awarded;
    localStorage.setItem(FREE_PLAYS_KEY, String(total));
    setFreePlaysAvailable(total);
    setShowFreePlay(false);
  };

  const handleFreePlaySkip = () => {
    setShowFreePlay(false);
  };

  return (
    <>
      {showFreePlay && (
        <FreePlayUnlock
          onComplete={handleFreePlayComplete}
          onSkip={handleFreePlaySkip}
        />
      )}
    <div
      style={{
        overflowY: 'auto',
        height: '100vh',
        paddingBottom: 80,
        background:
          'radial-gradient(circle at 50% 22%, rgba(255,215,0,0.14), transparent 38%),' +
          'radial-gradient(circle at 85% 80%, rgba(255,140,0,0.08), transparent 45%),' +
          'linear-gradient(180deg, #050505 0%, #0b0b0f 55%, #000000 100%)',
      }}
    >
      {/* Header — premium compact */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: '1px solid rgba(255,215,0,0.18)',
          background: 'rgba(10,10,15,0.55)',
          backdropFilter: 'blur(14px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(14px) saturate(1.3)',
          position: 'sticky',
          top: 0,
          zIndex: 5,
        }}
      >
        <button
          onClick={() => nav(-1)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#FFD700',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: 4,
          }}
          aria-label={t('scratch.back')}
        >
          <ArrowLeft size={18} />
          <span style={{ fontSize: 13 }}>{t('scratch.back')}</span>
        </button>
        <h1
          style={{
            fontFamily: 'Bebas Neue',
            color: '#FFD700',
            fontSize: 22,
            letterSpacing: 3,
            margin: 0,
            textShadow: '0 0 14px rgba(255,215,0,0.35)',
          }}
        >
          {t('scratch.title')}
        </h1>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 10px',
            borderRadius: 999,
            background: 'rgba(255,215,0,0.08)',
            border: '1px solid rgba(255,215,0,0.25)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <Wallet style={{ color: '#FFD700', width: 14, height: 14 }} />
          <span
            style={{
              color: balanceFlash ? '#00C875' : '#FFD700',
              fontSize: 12,
              fontWeight: 800,
              transition: 'color 0.25s ease, text-shadow 0.25s ease',
              textShadow: balanceFlash ? '0 0 12px rgba(0,200,117,0.6)' : 'none',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {balance.toLocaleString('fr-FR')}
          </span>
        </div>
      </div>

      {/* Free Plays badge */}
      {freePlaysAvailable > 0 && (
        <div
          style={{
            margin: '10px 14px 0',
            padding: '8px 14px',
            borderRadius: 10,
            background: 'rgba(255,215,0,0.1)',
            border: '1px solid rgba(255,215,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 20 }}>🎟️</span>
          <span style={{ color: '#FFD700', fontWeight: 800, fontSize: 14 }}>
            {freePlaysAvailable} Free Play{freePlaysAvailable > 1 ? 's' : ''} disponible{freePlaysAvailable > 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* FARMING MINI-BAR — sticky, just under the header */}
      <FarmingBar top={56} zIndex={5} />

      {/* Bet chips */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
          padding: '12px 18px 0',
          flexShrink: 0,
        }}
      >
        {BETS.map((b) => {
          const selected = bet === b;
          return (
            <button
              key={b}
              onClick={() => !ticketId && setBet(b)}
              disabled={!!ticketId}
              className="scratch-chip"
              style={{
                height: 60,
                padding: '0 6px',
                background: selected
                  ? 'linear-gradient(135deg, #FFE27A 0%, #D9A400 100%)'
                  : 'rgba(255,255,255,0.04)',
                border: selected
                  ? '1px solid rgba(255,215,0,0.9)'
                  : '1px solid rgba(255,215,0,0.18)',
                color: selected ? '#0a0500' : 'rgba(255,255,255,0.78)',
                borderRadius: 18,
                fontWeight: selected ? 900 : 700,
                fontSize: 17,
                lineHeight: 1,
                cursor: ticketId ? 'not-allowed' : 'pointer',
                opacity: ticketId && !selected ? 0.45 : 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                boxShadow: selected
                  ? '0 6px 18px rgba(217,164,0,0.45), 0 0 0 1px rgba(255,255,255,0.18) inset'
                  : 'none',
                backdropFilter: selected ? 'none' : 'blur(8px)',
                WebkitBackdropFilter: selected ? 'none' : 'blur(8px)',
                transition: 'transform 200ms ease, box-shadow 200ms ease, background 200ms ease',
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  letterSpacing: 1.5,
                  opacity: 0.75,
                  fontWeight: 700,
                }}
              >
                {t('scratch.bet_label')}
              </span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                {b.toLocaleString('fr-FR')}
              </span>
              <span style={{ fontSize: 9, opacity: 0.85, letterSpacing: 1 }}>CDF</span>
            </button>
          );
        })}
      </div>

      {/* Scratch card — premium ticket frame */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '0 18px',
          marginTop: 22,
        }}
      >
        <div
          className="scratch-ticket"
          style={{
            width: 320,
            maxWidth: '100%',
            borderRadius: 28,
            padding: '14px 14px 16px',
            background:
              'linear-gradient(180deg, #FFE45C 0%, #D99A00 55%, #8A5A00 100%)',
            boxShadow:
              '0 22px 48px -16px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.25) inset, 0 0 32px rgba(255,180,0,0.25)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Decorative shine overlay */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background:
                'radial-gradient(circle at 20% 0%, rgba(255,255,255,0.35), transparent 45%),' +
                'radial-gradient(circle at 100% 100%, rgba(0,0,0,0.25), transparent 45%)',
            }}
          />
          {/* Top band */}
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
              padding: '0 4px',
            }}
          >
            <span
              style={{
                fontFamily: 'Bebas Neue',
                fontSize: 14,
                letterSpacing: 3,
                color: '#3a2400',
                fontWeight: 900,
              }}
            >
              ★ CONGO SCRATCH
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: 1.2,
                background: 'rgba(0,0,0,0.65)',
                color: '#FFD700',
                padding: '4px 8px',
                borderRadius: 999,
                border: '1px solid rgba(255,215,0,0.6)',
              }}
            >
              {t('scratch.win_up_to')}
            </span>
          </div>
          {/* Inner canvas frame */}
          <div
            style={{
              position: 'relative',
              width: 288,
              height: 288,
              margin: '0 auto',
              borderRadius: 14,
              boxShadow:
                '0 0 0 2px rgba(0,0,0,0.35), 0 0 0 3px rgba(255,255,255,0.25), 0 8px 24px rgba(0,0,0,0.4) inset',
            }}
          >
          <canvas
            ref={baseRef}
            width={CANVAS}
            height={CANVAS}
            style={{
              width: 288,
              height: 288,
              borderRadius: 14,
              display: 'block',
              position: 'absolute',
              top: 0,
              left: 0,
              zIndex: 1,
              pointerEvents: 'none',
              touchAction: 'none',
              userSelect: 'none',
            }}
          />
          <canvas
            ref={scratchRef}
            width={CANVAS}
            height={CANVAS}
            style={{
              width: 288,
              height: 288,
              borderRadius: 14,
              display: 'block',
              position: 'absolute',
              top: 0,
              left: 0,
              zIndex: 2,
              touchAction: 'none',
              userSelect: 'none',
              cursor: grid && !result ? 'crosshair' : 'default',
            }}
          />
          {/* Pre-purchase marketing overlay — disappears once ticket is
              issued so the canvas takes over for scratching. */}
          {!ticketId && (
            <div
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 3,
                pointerEvents: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: 18,
                color: '#1a0d00',
              }}
            >
              <div
                style={{
                  fontFamily: 'Bebas Neue',
                  fontSize: 34,
                  lineHeight: 1,
                  letterSpacing: 2,
                  textShadow: '0 2px 0 rgba(255,255,255,0.35), 0 0 16px rgba(255,255,255,0.4)',
                  fontWeight: 900,
                }}
              >
                {t('scratch.scratch_prompt')}
              </div>
              <div
                style={{
                  fontFamily: 'Bebas Neue',
                  fontSize: 34,
                  lineHeight: 1,
                  letterSpacing: 2,
                  marginTop: 2,
                  fontWeight: 900,
                  textShadow: '0 2px 0 rgba(255,255,255,0.35), 0 0 16px rgba(255,255,255,0.4)',
                }}
              >
                {t('scratch.and_win')}
              </div>
              <div
                style={{
                  fontSize: 11,
                  marginTop: 10,
                  opacity: 0.85,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                }}
              >
                {t('scratch.choose_bet')}
              </div>
            </div>
          )}
          </div>
          {/* Bottom decorative pastilles */}
          <div
            aria-hidden
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              justifyContent: 'space-between',
              padding: '10px 6px 0',
            }}
          >
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: 'rgba(0,0,0,0.4)',
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.25)',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {!ticketId && (
        <button
          onClick={buy}
          disabled={!canBuy}
          className="scratch-buy-btn"
          style={{
            display: 'block',
            width: 'calc(100% - 36px)',
            margin: '22px 18px 0',
            padding: '16px 18px',
            borderRadius: 18,
            border: 'none',
            cursor: canBuy ? 'pointer' : 'not-allowed',
            fontSize: 16,
            fontWeight: 900,
            letterSpacing: '0.05em',
            color: '#0a0500',
            background: 'linear-gradient(135deg, #FFE27A 0%, #FFC400 45%, #D9A400 100%)',
            boxShadow: canBuy
              ? '0 12px 32px -8px rgba(255,180,0,0.55), 0 0 0 1px rgba(255,255,255,0.25) inset'
              : 'none',
            opacity: canBuy ? 1 : 0.45,
            transition: 'transform 200ms ease, box-shadow 200ms ease, filter 200ms ease',
          }}
        >
          {balance < bet ? t('scratch.insufficient_balance') : t('scratch.buy_button', { amount: bet.toLocaleString('fr-FR') })}
        </button>
      )}
      {ticketId && !result && (
        <p
          style={{
            textAlign: 'center',
            marginTop: 12,
            color: 'rgba(255,255,255,0.6)',
            fontSize: 13,
          }}
        >
          {t('scratch.reveal_prompt')}
        </p>
      )}

      {/* Result overlay */}
      {result && (
        <div
          onClick={playAgain}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'linear-gradient(180deg, #0a0a0a, #000000)',
              border: '1px solid rgba(255,215,0,0.35)',
              borderRadius: 18,
              padding: '28px 22px',
              width: '100%',
              maxWidth: 360,
              textAlign: 'center',
            }}
          >
            {result.win > 0 ? (
              <>
                <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 900,
                    color: '#FFD700',
                    letterSpacing: '0.04em',
                  }}
                >
                  {t('scratch.won', { amount: result.win.toLocaleString('fr-FR') })}
                </div>
                <p
                  style={{
                    color: '#00C875',
                    fontSize: 14,
                    fontWeight: 700,
                    marginTop: 10,
                  }}
                >
                  {t('scratch.added_to_balance', { amount: result.win.toLocaleString('fr-FR') })}
                </p>
                <p
                  style={{
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: 13,
                    marginTop: 8,
                  }}
                >
                  {t('scratch.bet_placed', { amount: result.bet.toLocaleString('fr-FR') })}
                </p>
              </>
            ) : (
              <>
                <div style={{ fontSize: 48, marginBottom: 8 }}>🥲</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>
                  {t('scratch.no_luck')}
                </div>
                <p
                  style={{
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: 13,
                    marginTop: 8,
                  }}
                >
                  {t('scratch.try_again')}
                </p>
              </>
            )}
            <button
              onClick={playAgain}
              style={{
                width: '100%',
                margin: '18px 0 0',
                padding: 14,
                borderRadius: 14,
                border: 'none',
                cursor: 'pointer',
                fontSize: 15,
                fontWeight: 900,
                letterSpacing: '0.04em',
                color: '#000000',
                background: 'linear-gradient(135deg, #FFD700, #FF8C00)',
              }}
            >
              {t('scratch.play_again')}
            </button>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
