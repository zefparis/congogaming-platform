import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, User, Zap, Mountain } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getSession } from '../lib/auth';

const API_BASE = import.meta.env.VITE_API_URL || 'https://api.congogaming.com';

type NavItem = {
  to: string;
  label: string;
  labelText?: string;
  icon?: LucideIcon;
  emoji?: string;
  badge?: string;
};

const items: NavItem[] = [
  { to: '/', icon: Home, label: 'nav.home' },
  { to: '/flash', icon: Zap, label: 'nav.flash' },
  { to: '/scratch', emoji: '🎫', label: 'nav.scratch' },
  { to: '/climb', icon: Mountain, label: 'nav.climb' },
  { to: '/predictions', emoji: '⚽', label: 'nav.predictions', badge: 'NOUVEAU' },
  { to: '/compte', icon: User, label: 'nav.account' },
];

export default function BottomNav() {
  const { t } = useTranslation();
  const [predCount, setPredCount] = useState<number | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session?.id) return;
    fetch(`${API_BASE}/api/predictions?user_id=${session.id}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.predictions) setPredCount(d.predictions.length); })
      .catch(() => {});
  }, []);

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-app bg-bg/95 backdrop-blur border-t border-zinc-900 z-30">
      <ul className="grid grid-cols-6 pb-[env(safe-area-inset-bottom)]">
        {items.map(({ to, icon: Icon, emoji, label, labelText, badge }) => {
          const dynBadge = to === '/compte' && predCount != null && predCount > 0
            ? String(predCount) : null;
          return (
          <li key={to} style={{ position: 'relative' }}>
            {badge && (
              <span
                style={{
                  position: 'absolute',
                  top: 4,
                  left: '50%',
                  transform: 'translateX(calc(-50% + 10px))',
                  background: '#FFD700',
                  color: '#0a0500',
                  fontSize: 6,
                  fontWeight: 900,
                  letterSpacing: 0.4,
                  padding: '1px 4px',
                  borderRadius: 3,
                  zIndex: 1,
                  pointerEvents: 'none',
                  lineHeight: 1.4,
                  whiteSpace: 'nowrap',
                }}
              >
                {badge}
              </span>
            )}
            {dynBadge && (
              <span style={{
                position: 'absolute', top: 6, right: 8,
                background: '#00C850', color: '#fff',
                fontSize: 8, fontWeight: 900,
                minWidth: 14, height: 14, borderRadius: 7,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1, pointerEvents: 'none',
                boxShadow: '0 0 6px rgba(0,200,80,0.5)',
              }}>{dynBadge}</span>
            )}
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 h-16 transition-colors ${
                  isActive ? 'text-gold' : 'text-zinc-400'
                }`
              }
            >
              {Icon ? (
                <Icon className="w-5 h-5" />
              ) : (
                <span className="text-xl leading-none">{emoji}</span>
              )}
              <span className="text-[10px] font-semibold uppercase tracking-wide">{labelText ?? t(label)}</span>
            </NavLink>
          </li>
          );
        })}
      </ul>
    </nav>
  );
}
