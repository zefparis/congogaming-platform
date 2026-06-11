import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const API_BASE    = import.meta.env.VITE_API_URL || 'https://api.congogaming.com';
const PS_ORIGIN   = (import.meta.env.VITE_PREDICTSTREET_ORIGIN   || 'https://app.dev.predictstreet.sde.adifoundation.ai').replace(/\/$/, '');
const PARTNER_ID  = import.meta.env.VITE_PREDICTSTREET_PARTNER_ID || '';
const IFRAME_URL  = PARTNER_ID
  ? `${PS_ORIGIN}/widget?partner_id=${encodeURIComponent(PARTNER_ID)}`
  : (import.meta.env.VITE_GAME_IFRAME_URL || PS_ORIGIN);

export default function GameScreen() {
  const nav       = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    /* ── PredictStreet SSO postMessage bridge ────────────────────────────────
     * PredictStreet widget sends PREDICTSTREET_SSO_TOKEN_REQUEST from its origin.
     * We respond with a fresh RS256 JWT minted by our backend.
     *
     * Security rules respected:
     *  • Strict origin check — never '*'
     *  • nonce echo'd verbatim to prevent replay/confusion
     *  • Token minted fresh on every request (no caching)
     *  • JWT sent only to PS_ORIGIN, never logged
     * ──────────────────────────────────────────────────────────────────────── */
    const handler = async (event: MessageEvent) => {
      if (event.origin !== PS_ORIGIN) return;
      if (event.data?.type !== 'PREDICTSTREET_SSO_TOKEN_REQUEST') return;

      const nonce  = event.data?.nonce as string | undefined;
      const iframe = iframeRef.current;

      const sendResponse = (token: string | null) => {
        iframe?.contentWindow?.postMessage(
          { type: 'PREDICTSTREET_SSO_TOKEN_RESPONSE', nonce, token },
          PS_ORIGIN,
        );
      };

      try {
        const res = await fetch(`${API_BASE}/api/predictstreet/token`, {
          method:      'POST',
          credentials: 'include', // sends cg_access_token httpOnly cookie
        });
        if (!res.ok) { sendResponse(null); return; }
        const { token } = await res.json() as { token: string };
        sendResponse(token);
      } catch {
        sendResponse(null);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []); // PS_ORIGIN and API_BASE are module-level constants — no deps needed

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

      <iframe
        ref={iframeRef}
        id="predictstreet-widget"
        src={IFRAME_URL}
        title="PredictStreet"
        className="flex-1 w-full bg-black"
        allow="clipboard-read; clipboard-write; payment; autoplay; fullscreen"
      />
    </div>
  );
}
