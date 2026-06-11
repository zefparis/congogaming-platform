import { useEffect, useRef, useState } from 'react';
import { getSession } from '../lib/auth';

const API_BASE    = import.meta.env.VITE_API_URL || 'https://api.congogaming.com';
const PS_IFRAME   = 'https://iframe.adipredictstreet.com';
const IFRAME_SRC  = `${PS_IFRAME}/embed?partner_id=congo-gaming`;

type Status = 'waiting' | 'token_sent' | 'not_logged_in';

function isAllowed(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return new URLSearchParams(window.location.search).get('test') === '1';
  } catch {
    return false;
  }
}

export default function PredictStreetTestScreen() {
  const iframeRef             = useRef<HTMLIFrameElement>(null);
  const [status, setStatus]   = useState<Status>('waiting');
  const [userId, setUserId]   = useState<string | null>(null);

  useEffect(() => {
    const s = getSession();
    if (s?.id) setUserId(s.id);
  }, []);

  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      if (event.origin !== PS_IFRAME) return;
      if (event.data?.type !== 'PREDICTSTREET_SSO_TOKEN_REQUEST') return;

      const nonce   = event.data?.nonce as string | undefined;
      const iframe  = iframeRef.current;

      const post = (msg: object) =>
        iframe?.contentWindow?.postMessage(msg, PS_IFRAME);

      try {
        const res = await fetch(`${API_BASE}/api/predictstreet/token`, {
          method:      'POST',
          credentials: 'include',
        });

        if (!res.ok) {
          post({ type: 'PREDICTSTREET_SSO_NOT_LOGGED_IN', nonce });
          setStatus('not_logged_in');
          return;
        }

        const { token } = (await res.json()) as { token: string };
        post({ type: 'PREDICTSTREET_SSO_TOKEN_RESPONSE', nonce, token });
        setStatus('token_sent');
      } catch {
        post({ type: 'PREDICTSTREET_SSO_NOT_LOGGED_IN', nonce });
        setStatus('not_logged_in');
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  if (!isAllowed()) {
    return (
      <div style={{ padding: 32, color: '#fff', fontFamily: 'monospace' }}>
        403 — accessible uniquement en dev ou avec <code>?test=1</code>
      </div>
    );
  }

  const statusColor: Record<Status, string> = {
    waiting:      '#9CA3AF',
    token_sent:   '#4ADE80',
    not_logged_in: '#F87171',
  };

  const statusLabel: Record<Status, string> = {
    waiting:      'Waiting...',
    token_sent:   'Token sent ✓',
    not_logged_in: 'Not logged in',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column' }}>
      {/* Debug bandeau */}
      <div
        style={{
          background: '#111827',
          borderBottom: '1px solid #374151',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          fontFamily: 'monospace',
          fontSize: 13,
        }}
      >
        <span style={{ color: '#6B7280', fontWeight: 600, letterSpacing: 1 }}>
          PS SSO TEST
        </span>
        <span>
          <span style={{ color: '#6B7280' }}>status: </span>
          <span style={{ color: statusColor[status], fontWeight: 700 }}>
            {statusLabel[status]}
          </span>
        </span>
        {userId && (
          <span>
            <span style={{ color: '#6B7280' }}>provider_user_id: </span>
            <span style={{ color: '#FCD34D' }}>{userId}</span>
          </span>
        )}
        <span style={{ color: '#4B5563', marginLeft: 'auto' }}>
          {PS_IFRAME}
        </span>
      </div>

      {/* Iframe */}
      <iframe
        ref={iframeRef}
        src={IFRAME_SRC}
        title="PredictStreet SSO Test"
        width="100%"
        height="700px"
        style={{ border: 'none', flex: 1 }}
        allow="clipboard-read; clipboard-write; payment; autoplay; fullscreen"
      />
    </div>
  );
}
