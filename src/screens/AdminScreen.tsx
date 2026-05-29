import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { adminApi, getAdminToken, setAdminSecret, setAdminToken } from '../lib/adminApi';
import PinGate from './admin/PinGate';
import OverviewTab from './admin/OverviewTab';
import PlayersTab from './admin/PlayersTab';
import GamesTab from './admin/GamesTab';
import TransactionsTab from './admin/TransactionsTab';
import ResponsibleTab from './admin/ResponsibleTab';

type Tab = 'overview' | 'players' | 'games' | 'transactions' | 'responsible';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'OVERVIEW' },
  { id: 'players', label: 'JOUEURS' },
  { id: 'games', label: 'JEUX' },
  { id: 'transactions', label: 'TRANSACTIONS' },
  { id: 'responsible', label: 'RESPONSABLE' },
];

export default function AdminScreen() {
  const [authed, setAuthed] = useState<boolean>(!!getAdminToken());
  const [tab, setTab] = useState<Tab>('overview');
  const [checking, setChecking] = useState<boolean>(!!getAdminToken());

  // Validate the stored token on mount by hitting a cheap endpoint.
  // On 401 the adminApi helper auto-clears the token.
  useEffect(() => {
    if (!authed) {
      setChecking(false);
      return;
    }
    adminApi
      .overview()
      .then(() => setChecking(false))
      .catch(() => {
        setAdminToken(null);
        setAuthed(false);
        setChecking(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function logout() {
    setAdminToken(null);
    setAdminSecret(null);
    setAuthed(false);
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-[#0a0a0f]">
        <PinGate onAuthed={() => setAuthed(true)} />
      </div>
    );
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f] text-white/50">
        Chargement…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#0a0a0f]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            <h1 className="font-display text-2xl tracking-wider text-gold">
              CONGO GAMING <span className="text-white/40">/ ADMIN</span>
            </h1>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-sm text-white/70 hover:bg-white/5"
          >
            <LogOut size={14} />
            Quitter
          </button>
        </div>
        <nav className="mx-auto max-w-6xl overflow-x-auto px-4 pb-2">
          <div className="flex gap-1 whitespace-nowrap">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`relative px-4 py-2 font-display text-sm tracking-[0.18em] transition ${
                    active ? 'text-gold' : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  {t.label}
                  {active && (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gold" />
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'players' && <PlayersTab />}
        {tab === 'games' && <GamesTab />}
        {tab === 'transactions' && <TransactionsTab />}
        {tab === 'responsible' && <ResponsibleTab />}
      </main>
    </div>
  );
}
