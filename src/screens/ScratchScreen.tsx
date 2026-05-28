import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wallet } from 'lucide-react';
import { api } from '../lib/api';
import { getSession, refreshBalance } from '../lib/auth';

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

export default function ScratchScreen() {
  const nav = useNavigate();
  const session = getSession();
  const userId = session?.id ?? '';
  const [balance, setBalance] = useState<number>(session?.balance_cdf ?? 0);
  const [bet, setBet] = useState<number>(1000);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [grid, setGrid] = useState<Sym[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ win: number; bet: number } | null>(null);
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
    ctx.fillText('GRATTEZ', CANVAS / 2, CANVAS / 2 - 10);
    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = 'rgba(255,215,0,0.65)';
    ctx.fillText('avec votre doigt', CANVAS / 2, CANVAS / 2 + 14);
  }, []);

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
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.font = 'bold 28px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ACHETER', top.width / 2, top.height / 2);
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
    try {
      const r = await api.scratchBuy(userId, bet);
      const newBal = await refreshBalance(userId).catch(() => null);
      if (newBal != null) setBalance(newBal);
      setTicketId(r.ticket_id);
      setGrid(r.grid as Sym[]);
    } catch (e: any) {
      alert(e?.message ?? 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  const playAgain = () => {
    setResult(null);
    setGrid(null);
    setTicketId(null);
  };

  const canBuy = balance >= bet && !busy && !ticketId;

  return (
    <div style={{ overflowY: 'auto', height: '100vh', paddingBottom: 80 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid rgba(255,215,0,0.2)',
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
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
          }}
        >
          <ArrowLeft size={18} />
          <span style={{ fontSize: 13 }}>Retour</span>
        </button>
        <h1
          style={{
            fontFamily: 'Bebas Neue',
            color: '#FFD700',
            fontSize: 20,
            letterSpacing: 2,
            margin: 0,
          }}
        >
          SCRATCH CARD
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Wallet style={{ color: '#FFD700', width: 14, height: 14 }} />
          <span
            style={{
              color: balanceFlash ? '#00C875' : '#FFD700',
              fontSize: 13,
              fontWeight: 800,
              transition: 'color 0.25s ease, text-shadow 0.25s ease',
              textShadow: balanceFlash ? '0 0 12px rgba(0,200,117,0.6)' : 'none',
            }}
          >
            {balance.toLocaleString('fr-FR')}
          </span>
        </div>
      </div>

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
              style={{
                height: 56,
                padding: '0 6px',
                background: selected ? '#FFD700' : 'rgba(255,255,255,0.05)',
                border: selected
                  ? '1px solid #FFD700'
                  : '1px solid rgba(255,255,255,0.1)',
                color: selected ? '#000000' : 'rgba(255,255,255,0.7)',
                borderRadius: 12,
                fontWeight: selected ? 900 : 700,
                fontSize: 18,
                lineHeight: 1,
                cursor: ticketId ? 'not-allowed' : 'pointer',
                opacity: ticketId && !selected ? 0.5 : 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
              }}
            >
              <span>{b.toLocaleString('fr-FR')}</span>
              <span style={{ fontSize: 10, opacity: 0.8 }}>CDF</span>
            </button>
          );
        })}
      </div>

      {/* Scratch card */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '0 18px',
          marginTop: 20,
        }}
      >
        <div
          style={{
            width: 300,
            height: 300,
            borderRadius: 18,
            padding: 6,
            background: 'linear-gradient(135deg, #FFD700 0%, #FF8C00 50%, #FFD700 100%)',
            boxShadow: '0 18px 40px -16px rgba(0,0,0,0.8)',
            position: 'relative',
          }}
        >
          <canvas
            ref={baseRef}
            width={CANVAS}
            height={CANVAS}
            style={{
              width: 288,
              height: 288,
              borderRadius: 12,
              display: 'block',
              position: 'absolute',
              top: 6,
              left: 6,
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
              borderRadius: 12,
              display: 'block',
              position: 'absolute',
              top: 6,
              left: 6,
              zIndex: 2,
              touchAction: 'none',
              userSelect: 'none',
              cursor: grid && !result ? 'crosshair' : 'default',
            }}
          />
        </div>
      </div>

      {!ticketId && (
        <button
          onClick={buy}
          disabled={!canBuy}
          style={{
            display: 'block',
            width: 'calc(100% - 36px)',
            margin: '20px 18px 0',
            padding: 16,
            borderRadius: 14,
            border: 'none',
            cursor: canBuy ? 'pointer' : 'not-allowed',
            fontSize: 16,
            fontWeight: '900',
            letterSpacing: '0.04em',
            color: '#000000',
            background: 'linear-gradient(135deg, #FFD700 0%, #DAA520 100%)',
            boxShadow: '0 10px 30px -10px rgba(255,215,0,0.6)',
            opacity: canBuy ? 1 : 0.5,
          }}
        >
          {balance < bet ? 'SOLDE INSUFFISANT' : `ACHETER — ${bet.toLocaleString('fr-FR')} CDF`}
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
          Grattez les 9 cases pour révéler votre résultat
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
                  GAGNÉ {result.win.toLocaleString('fr-FR')} CDF !
                </div>
                <p
                  style={{
                    color: '#00C875',
                    fontSize: 14,
                    fontWeight: 700,
                    marginTop: 10,
                  }}
                >
                  +{result.win.toLocaleString('fr-FR')} CDF ajouté à votre solde !
                </p>
                <p
                  style={{
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: 13,
                    marginTop: 8,
                  }}
                >
                  Mise : {result.bet.toLocaleString('fr-FR')} CDF
                </p>
              </>
            ) : (
              <>
                <div style={{ fontSize: 48, marginBottom: 8 }}>🥲</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>
                  Pas de chance...
                </div>
                <p
                  style={{
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: 13,
                    marginTop: 8,
                  }}
                >
                  Retentez votre chance !
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
              REJOUER
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
