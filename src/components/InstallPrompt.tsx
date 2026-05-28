import { useEffect, useState } from 'react';

/**
 * PWA install prompt banner.
 *
 * Captures the `beforeinstallprompt` event (Chromium / Edge / Samsung
 * Internet) and renders a non-intrusive glassmorphism banner above the
 * BottomNav. The banner is hidden when:
 *   - the user already dismissed it (localStorage flag), or
 *   - the app is already running in standalone display mode, or
 *   - no `beforeinstallprompt` event has been fired by the browser.
 *
 * Safari/iOS does not fire `beforeinstallprompt`; on that platform the
 * banner simply never appears (users install via the share sheet).
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'cg_install_dismissed';

export default function InstallPrompt() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Already installed → never show.
  if (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(display-mode: standalone)').matches
  ) {
    return null;
  }

  if (!installPrompt || dismissed) return null;

  const onInstall = async () => {
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[InstallPrompt] prompt failed', err);
    } finally {
      setInstallPrompt(null);
    }
  };

  const onDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, 'true');
    } catch {
      /* storage unavailable — still hide for this session */
    }
    setDismissed(true);
  };

  return (
    <div
      role="dialog"
      aria-label="Installer Congo Gaming"
      style={{
        position: 'fixed',
        bottom: 72,
        left: 0,
        right: 0,
        zIndex: 50,
        background: 'rgba(13,13,24,0.95)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(255,215,0,0.3)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <img
        src="/images/okapi.PNG"
        alt=""
        aria-hidden
        width={40}
        height={40}
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: '#FFFFFF',
            fontSize: 14,
            fontWeight: 700,
            lineHeight: 1.2,
          }}
        >
          Installer Congo Gaming
        </div>
        <div
          style={{
            color: '#9CA3AF',
            fontSize: 11,
            lineHeight: 1.3,
            marginTop: 2,
          }}
        >
          Accès rapide depuis votre écran d'accueil
        </div>
      </div>
      <button
        type="button"
        onClick={onInstall}
        style={{
          background: '#FFD700',
          color: '#000',
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: 1,
          padding: '8px 14px',
          borderRadius: 8,
          border: 'none',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        INSTALLER
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Ignorer"
        style={{
          background: 'transparent',
          color: '#9CA3AF',
          fontSize: 18,
          lineHeight: 1,
          padding: '6px 8px',
          border: 'none',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
}
