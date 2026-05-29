import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, LogOut, Pencil, Phone, User, Wallet, X } from 'lucide-react';
import TransactionItem, { type TransactionType } from '../components/TransactionItem';
import { AuthApiError, clearSession, getSession, refreshSession, updateDisplayName } from '../lib/auth';
import { api } from '../lib/api';

function computeInitials(displayName: string | null | undefined, phone: string | undefined): string {
  if (displayName) {
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  }
  return phone?.slice(-2) || '??';
}

export default function AccountScreen() {
  const nav = useNavigate();
  const [session, setSession] = useState(getSession());
  const [balance, setBalance] = useState<number>(session?.balance_cdf ?? 0);
  const [tx, setTx] = useState<Array<{ id: string; type: TransactionType; amount: number; status: number; created_at: string }>>([]);

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState<string>(session?.display_name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    refreshSession().then((u) => {
      if (u) {
        setSession(u);
        setBalance(Number(u.balance_cdf || 0));
      }
    }).catch(() => {});
    api.transactions().then((r) => setTx(r.items)).catch(() => {});
  }, []);

  const initials = computeInitials(session?.display_name, session?.phone);

  const logout = () => {
    clearSession();
    nav('/login', { replace: true });
  };

  const startEdit = () => {
    setDraftName(session?.display_name ?? '');
    setNameError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setNameError(null);
  };

  const saveName = async () => {
    if (savingName) return;
    const value = draftName.trim();
    if (value && (value.length < 2 || value.length > 24)) {
      setNameError('Le pseudo doit faire 2 à 24 caractères');
      return;
    }
    setSavingName(true);
    setNameError(null);
    try {
      const updated = await updateDisplayName(value === '' ? null : value);
      setSession(updated);
      setEditing(false);
    } catch (e: any) {
      const msg = e instanceof AuthApiError ? e.message : 'Erreur inconnue';
      setNameError(msg);
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div className="min-h-screen p-4 pb-28">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-3xl text-gold tracking-wider">MON COMPTE</h1>
        <img
          src="/images/okapi.PNG"
          alt="Congo Gaming"
          className="h-10 w-auto object-contain cursor-pointer"
          onClick={() => {
            const user = getSession();
            user ? nav('/home') : nav('/');
          }}
        />
      </div>

      <div className="mt-4 rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-950 border border-gold/20 p-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gold/20 border-2 border-gold flex items-center justify-center font-display text-3xl text-gold">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-zinc-500 uppercase tracking-widest flex items-center gap-1">
              <User className="w-3 h-3" /> Pseudo
            </div>
            {!editing ? (
              <div className="flex items-center gap-2">
                <div className={`font-display text-xl tracking-wider truncate ${session?.display_name ? 'text-white' : 'text-zinc-500 italic'}`}>
                  {session?.display_name || 'Non défini'}
                </div>
                <button
                  type="button"
                  onClick={startEdit}
                  className="ml-auto text-gold hover:text-gold/80 p-1.5 rounded-lg hover:bg-gold/10"
                  aria-label="Modifier le pseudo"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="mt-1">
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  maxLength={24}
                  placeholder="Votre pseudo"
                  autoFocus
                  className="w-full bg-zinc-950 border border-gold/40 rounded-lg px-3 py-2 text-white font-display tracking-wider outline-none focus:border-gold"
                />
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={saveName}
                    disabled={savingName}
                    className="flex-1 h-10 rounded-lg bg-gold text-black font-bold tracking-wider flex items-center justify-center gap-1 disabled:opacity-60"
                  >
                    <Check className="w-4 h-4" /> {savingName ? '…' : 'ENREGISTRER'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="h-10 px-3 rounded-lg bg-zinc-800 text-zinc-300 flex items-center gap-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-[11px] text-zinc-500 mt-1.5">2 à 24 caractères • lettres, chiffres, espaces, _ . -</div>
                {nameError && <div className="text-red-400 text-xs mt-1">{nameError}</div>}
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-zinc-800/60">
          <div className="text-xs text-zinc-500 uppercase tracking-widest flex items-center gap-1">
            <Phone className="w-3 h-3" /> Numéro
          </div>
          <div className="font-display text-xl tracking-wider text-zinc-200">{session?.phone}</div>
        </div>
      </div>

      <div className="mt-3 rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4 flex items-center gap-3">
        <Wallet className="w-7 h-7 text-gold" />
        <div className="flex-1">
          <div className="text-xs text-zinc-500 uppercase tracking-widest">Solde</div>
          <div className="font-display text-3xl text-gold">{balance.toLocaleString('fr-FR')} <span className="text-xs text-zinc-400">CDF</span></div>
        </div>
      </div>

      <div className="mt-5">
        <h2 className="font-display text-xl text-zinc-400 tracking-wider mb-2">DERNIÈRES TRANSACTIONS</h2>
        <div className="space-y-2">
          {tx.length === 0 && (
            <div className="text-zinc-500 text-sm p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
              Aucune transaction pour le moment.
            </div>
          )}
          {tx.map((t) => (
            <TransactionItem key={t.id} type={t.type} amount={Number(t.amount)} status={t.status} date={t.created_at} />
          ))}
        </div>
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={logout}
        className="mt-6 w-full h-14 rounded-2xl bg-red-600/90 text-white font-display text-2xl tracking-widest flex items-center justify-center gap-2"
      >
        <LogOut className="w-5 h-5" /> DÉCONNEXION
      </motion.button>

      <div className="mt-6 text-center">
        <button
          onClick={() => nav('/legal')}
          className="text-xs text-gray-500 underline"
        >
          Mentions légales
        </button>
      </div>
    </div>
  );
}
