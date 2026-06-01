import { NavLink } from 'react-router-dom';
import { Home, User, Zap, Mountain } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type NavItem = {
  to: string;
  label: string;
  icon?: LucideIcon;
  emoji?: string;
};

const items: NavItem[] = [
  { to: '/', icon: Home, label: 'Accueil' },
  { to: '/flash', icon: Zap, label: 'Flash' },
  { to: '/scratch', emoji: '🎫', label: 'Scratch' },
  { to: '/climb', icon: Mountain, label: 'Climb' },
  { to: '/compte', icon: User, label: 'Compte' },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-app bg-bg/95 backdrop-blur border-t border-zinc-900 z-30">
      <ul className="grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
        {items.map(({ to, icon: Icon, emoji, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 h-16 transition-colors ${
                  isActive ? 'text-gold' : 'text-zinc-400'
                }`
              }
            >
              {Icon ? (
                <Icon className="w-6 h-6" />
              ) : (
                <span className="text-2xl leading-none">{emoji}</span>
              )}
              <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
