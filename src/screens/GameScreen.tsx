import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';

const API_BASE    = import.meta.env.VITE_API_URL || 'https://api.congogaming.com';
const PS_ORIGIN   = (import.meta.env.VITE_PREDICTSTREET_ORIGIN   || 'https://app.dev.predictstreet.sde.adifoundation.ai').replace(/\/$/, '');
const PARTNER_ID  = import.meta.env.VITE_PREDICTSTREET_PARTNER_ID || '';
const IFRAME_URL  = PARTNER_ID
  ? `${PS_ORIGIN}/widget?partner_id=${encodeURIComponent(PARTNER_ID)}`
  : (import.meta.env.VITE_GAME_IFRAME_URL || PS_ORIGIN);

type WalletStatus = 'initializing' | 'ready' | 'error';

/* Timeout (ms) before we give up waiting for the first SSO token request */
const INIT_TIMEOUT_MS = 15_000;

export default function GameScreen() {
  const nav                                = useNavigate();
  const iframeRef                          = useRef<HTMLIFrameElement>(null);
  const [walletStatus, setWalletStatus]    = useState<WalletStatus>('initializing');
  const [retryKey,     setRetryKey]        = useState(0);
  const [iframeLoaded, setIframeLoaded]    = useState(false);
  const [lastMsgOrigin, setLastMsgOrigin]  = useState<string | null>(null);
  const [lastMsgType,   setLastMsgType]    = useState<string | null>(null);
  const [lastTokenOk,   setLastTokenOk]    = useState<boolean | null>(null);
  const [lastTokenStatus, setLastTokenStatus] = useState<number | null>(null);

  // ── Basic webview detection (best-effort): FB/IG/WA/TG/TikTok/Twitter/Snap etc.
  const isInAppWebView = (() => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    // Android WebView has 'wv' or 'Version/' tokens; iOS FB/IG contain FBAN/FB_IAB
    const needles = [
      'FBAN', 'FB_IAB', 'Instagram', 'Line/', 'WhatsApp', 'Telegram', 'TikTok', 'Twitter', 'Snapchat', 'WeChat',
      'wv; ', ' wv)', 'Version/', 'GSA/'];
    return needles.some(n => ua.includes(n));
  })();

  /* ── Auto-timeout: if widget never sends a token request, show error ── */
  useEffect(() => {
    if (walletStatus !== 'initializing') return;
    const t = setTimeout(() => setWalletStatus('error'), INIT_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [walletStatus, retryKey]);

  /* ── PredictStreet SSO postMessage bridge ─────────────────────────────────
   * PredictStreet widget sends PREDICTSTREET_SSO_TOKEN_REQUEST from its origin.
   * We respond with a fresh RS256 JWT minted by our backend.
   *
   * Security rules respected:
   *  • Strict origin check — never '*'
   *  • nonce echo'd verbatim to prevent replay/confusion
   *  • Token minted fresh on every request (no caching)
   *  • JWT sent only to PS_ORIGIN, never logged
   *
   * wallet_address is now included in the JWT by the backend
   * (deriveEVMAddress in predictstreet.ts) — fixes ADI no_evm_wallet (401).
   * ─────────────────────────────────────────────────────────────────────────*/
  useEffect(() => {
    if (import.meta.env.DEV) {
      // DEBUG — log key values
      console.log('[PS-DEBUG] PS_ORIGIN =', PS_ORIGIN);
      console.log('[PS-DEBUG] IFRAME_URL =', IFRAME_URL);
    }
    const debugHandler = (e: MessageEvent) => {
      if (e.data?.type?.startsWith?.('PREDICTSTREET')) {
        if (import.meta.env.DEV) console.log('[PS-DEBUG] postMessage received — origin:', e.origin, 'type:', e.data?.type);
      }
    };
    window.addEventListener('message', debugHandler);

    const handler = async (event: MessageEvent) => {
      // Record last message for diagnostics
      setLastMsgOrigin(event.origin);
      setLastMsgType(event.data?.type);
      try {
        sessionStorage.setItem('ps:lastOrigin', String(event.origin || ''));
        sessionStorage.setItem('ps:lastType', String(event.data?.type || ''));
      } catch {}

      // Strict origin gate: only the exact configured origin
      if (event.origin !== PS_ORIGIN) return;
      if (event.data?.type !== 'PREDICTSTREET_SSO_TOKEN_REQUEST') return;

      const nonce  = event.data?.nonce as string | undefined;
      const iframe = iframeRef.current;

      const sendResponse = (token: string | null) => {
        if (token) {
          setWalletStatus('ready');
        } else {
          setWalletStatus('error');
        }
        if (import.meta.env.DEV) console.log('[PS-DEBUG] posting SSO_TOKEN_RESPONSE to', PS_ORIGIN, 'hasToken=', Boolean(token));
        iframe?.contentWindow?.postMessage(
          { type: 'PREDICTSTREET_SSO_TOKEN_RESPONSE', nonce, token },
          PS_ORIGIN,
        );
        try { sessionStorage.setItem('ps:lastPostOk', String(Boolean(token))); } catch {}
      };

      try {
        if (import.meta.env.DEV) console.log('[PS-DEBUG] fetching /api/predictstreet/token ...');
        const res = await fetch(`${API_BASE}/api/predictstreet/token`, {
          method:      'POST',
          credentials: 'include', // sends cg_access_token httpOnly cookie
        });
        setLastTokenOk(res.ok);
        setLastTokenStatus(res.status);
        try {
          sessionStorage.setItem('ps:lastTokenOk', String(res.ok));
          sessionStorage.setItem('ps:lastTokenStatus', String(res.status));
        } catch {}
        if (!res.ok) { if (import.meta.env.DEV) console.log('[PS-DEBUG] token fetch not ok:', res.status); sendResponse(null); return; }
        const { token } = await res.json() as { token: string };
        if (import.meta.env.DEV) console.log('[PS-DEBUG] token fetched ✓, length=', token?.length ?? 0);
        sendResponse(token);
      } catch {
        if (import.meta.env.DEV) console.log('[PS-DEBUG] token fetch failed (network)');
        sendResponse(null);
      }
    };

    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      window.removeEventListener('message', debugHandler);
    };
  }, [retryKey]); // re-register on retry so state closure is fresh

  const handleRetry = () => {
    setWalletStatus('initializing');
    setRetryKey(k => k + 1);
  };

  // ── Hard-block unsupported in-app webviews where embedded wallets fail
  if (isInAppWebView) {
    return (
      <div className="fixed inset-0 mx-auto max-w-app bg-bg z-40 flex flex-col items-center justify-center" style={{ padding: 24 }}>
        <header className="flex items-center justify-center mb-6">
          <img src="/images/logo/logo.svg" alt="Congo Gaming" width={120} height={40} loading="lazy" />
        </header>
        <div style={{
          maxWidth: 520,
          textAlign: 'center',
          color: '#fff',
          fontFamily: "-apple-system, 'Inter', 'Segoe UI', sans-serif",
        }}>
          <h1 style={{ fontSize: 20, margin: 0, marginBottom: 8, letterSpacing: 1, fontWeight: 800 }}>Ouvrir dans votre navigateur</h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0, lineHeight: 1.6 }}>
            La création du wallet PredictStreet nécessite un navigateur complet. Veuillez ouvrir cette page dans Chrome (Android) ou Safari (iOS).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 mx-auto max-w-app bg-bg z-40 flex flex-col">
      <header className="flex items-center justify-between px-3 py-2 bg-zinc-950/95 border-b border-zinc-900">
        <button
          onClick={() => nav('/')}
          className="w-11 h-11 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-gold"
          aria-label="Retour"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <img
          src="/images/okapi.PNG"
          alt="Congo Gaming"
          className="h-10 w-auto object-contain cursor-pointer"
          onClick={() => nav('/')}
        />
      </header>

      {/* ── Main area: iframe + overlays ── */}
      <div className="flex-1 relative">

        {/* Iframe always rendered — overlays sit on top while not ready */}
        <iframe
          key={retryKey}
          ref={iframeRef}
          id="predictstreet-widget"
          src={IFRAME_URL}
          title="PredictStreet"
          className="absolute inset-0 w-full h-full bg-black"
          allow="clipboard-read; clipboard-write; payment; autoplay; fullscreen"
          onLoad={() => {
            setIframeLoaded(true);
            try { sessionStorage.setItem('ps:iframeLoaded', '1'); } catch {}
            if (import.meta.env.DEV) console.log('[PS-DEBUG] iframe onLoad ✓');
          }}
        />

        {/* ── Loading overlay: wallet initializing ── */}
        {walletStatus === 'initializing' && (
          <div
            style={{
              position: 'absolute', inset: 0, zIndex: 10,
              background: '#010820',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 16,
            }}
          >
            <style>{`@keyframes _psSpinner { to { transform: rotate(360deg); } }`}</style>
            <div
              style={{
                width: 44, height: 44,
                border: '3px solid rgba(1,60,255,0.22)',
                borderTop: '3px solid #013CFF',
                borderRadius: '50%',
                animation: '_psSpinner 0.85s linear infinite',
              }}
            />
            <p
              style={{
                color: '#fff',
                fontFamily: "'Bebas Neue', Impact, sans-serif",
                fontSize: 18, letterSpacing: 2,
                margin: 0,
              }}
            >
              Initialisation de votre wallet...
            </p>
            <p
              style={{
                color: 'rgba(255,255,255,0.38)',
                fontSize: 12, letterSpacing: 1,
                margin: 0,
              }}
            >
              ADI PredictStreet × Congo Gaming
            </p>
          </div>
        )}

        {/* ── Error overlay: token exchange failed or timeout ── */}
        {walletStatus === 'error' && (
          <div
            style={{
              position: 'absolute', inset: 0, zIndex: 10,
              background: '#010820',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 14, padding: '0 32px', textAlign: 'center',
            }}
          >
            <span style={{ fontSize: 38 }}>⚠️</span>
            <p
              style={{
                color: '#fff',
                fontFamily: "'Bebas Neue', Impact, sans-serif",
                fontSize: 20, letterSpacing: 2,
                margin: 0,
              }}
            >
              Connexion au widget impossible
            </p>
            <p
              style={{
                color: 'rgba(255,255,255,0.45)',
                fontSize: 13, lineHeight: 1.55,
                margin: 0,
              }}
            >
              Le service ADI PredictStreet n'a pas pu initialiser votre session.
              Vérifiez votre connexion et réessayez.
            </p>
            <button
              type="button"
              onClick={handleRetry}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'linear-gradient(135deg, #013CFF, #FF710A)',
                color: '#fff',
                fontFamily: "'Bebas Neue', Impact, sans-serif",
                fontSize: 16, letterSpacing: 2,
                padding: '12px 28px',
                borderRadius: 12, border: 'none',
                cursor: 'pointer',
                marginTop: 6,
                boxShadow: '0 4px 20px rgba(1,60,255,0.38)',
              }}
            >
              <RefreshCw size={16} />
              Réessayer
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
