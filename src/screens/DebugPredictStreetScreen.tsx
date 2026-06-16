import { useEffect, useMemo, useRef, useState } from 'react';
import { getSession } from '../lib/auth';

const API_BASE = import.meta.env.VITE_API_URL || 'https://api.congogaming.com';
const PS_ORIGIN = (import.meta.env.VITE_PREDICTSTREET_ORIGIN || '').replace(/\/$/, '');

export default function DebugPredictStreetScreen() {
  const s = getSession();
  const providerUserId = s?.id || '—';

  const [cookiesEnabled, setCookiesEnabled] = useState<boolean | null>(null);
  const [lsOk, setLsOk] = useState<boolean | null>(null);
  const [ssOk, setSsOk] = useState<boolean | null>(null);
  const [tokenStatus, setTokenStatus] = useState<number | null>(null);
  const [tokenOk, setTokenOk] = useState<boolean | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [lastOrigin, setLastOrigin] = useState<string | null>(null);
  const [lastType, setLastType] = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setCookiesEnabled(navigator.cookieEnabled);
    try { localStorage.setItem('dbg', '1'); localStorage.removeItem('dbg'); setLsOk(true); } catch { setLsOk(false); }
    try { sessionStorage.setItem('dbg', '1'); sessionStorage.removeItem('dbg'); setSsOk(true); } catch { setSsOk(false); }
  }, []);

  useEffect(() => {
    const h = (e: MessageEvent) => {
      setLastOrigin(e.origin);
      setLastType((e.data && (e as any).data.type) || null);
    };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, []);

  const ua = useMemo(() => navigator.userAgent, []);

  const testToken = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/predictstreet/token`, { method: 'POST', credentials: 'include' });
      setTokenStatus(res.status);
      setTokenOk(res.ok);
    } catch {
      setTokenStatus(-1);
      setTokenOk(false);
    }
  };

  const submitDebug = async () => {
    try {
      const payload = {
        provider_user_id: providerUserId,
        ua,
        cookiesEnabled,
        lsOk, ssOk,
        lastOrigin, lastType,
        iframeLoaded,
        tokenStatus, tokenOk,
        now: new Date().toISOString(),
      };
      await fetch(`${API_BASE}/api/predictstreet/debug`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      alert('Debug payload sent');
    } catch {
      alert('Failed to send debug payload');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1c', color: '#fff', fontFamily: "-apple-system, 'Inter', 'Segoe UI', sans-serif" }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontWeight: 800, letterSpacing: 1 }}>PredictStreet Debug</div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Diagnostics for iframe SSO</div>
      </div>

      <div style={{ padding: 20, display: 'grid', gap: 12 }}>
        <div>provider_user_id: <strong style={{ color: '#FCD34D' }}>{providerUserId}</strong></div>
        <div>userAgent: <code style={{ color: '#93C5FD' }}>{ua}</code></div>
        <div>cookies enabled: <strong>{String(cookiesEnabled)}</strong></div>
        <div>localStorage: <strong>{String(lsOk)}</strong> · sessionStorage: <strong>{String(ssOk)}</strong></div>
        <div>last postMessage: origin=<code>{lastOrigin || '—'}</code> · type=<code>{lastType || '—'}</code></div>
        <div>iframe loaded: <strong>{String(iframeLoaded)}</strong></div>
        <div>SSO token endpoint: status=<strong>{String(tokenStatus)}</strong> ok=<strong>{String(tokenOk)}</strong></div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button onClick={testToken} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.05)', color: '#fff' }}>Test token</button>
          <button onClick={submitDebug} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,107,0,0.28)', background: 'rgba(255,107,0,0.15)', color: '#fff' }}>Send debug</button>
        </div>
      </div>

      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '6px 0 10px' }} />

      <div style={{ padding: '0 20px 20px' }}>
        <div style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>Test iframe ({PS_ORIGIN || 'origin not set'})</div>
        {PS_ORIGIN ? (
          <iframe
            ref={iframeRef}
            src={`${PS_ORIGIN}/widget?partner_id=congo-gaming`}
            title="PS Debug Iframe"
            width="100%"
            height="520"
            style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10 }}
            allow="clipboard-read; clipboard-write; payment; autoplay; fullscreen"
            onLoad={() => setIframeLoaded(true)}
          />
        ) : (
          <div style={{ color: '#fca5a5' }}>VITE_PREDICTSTREET_ORIGIN is not configured.</div>
        )}
      </div>
    </div>
  );
}
