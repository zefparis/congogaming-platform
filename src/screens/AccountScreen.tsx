import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogOut, Phone, Wallet } from 'lucide-react';
import TransactionItem, { type TransactionType } from '../components/TransactionItem';
import { clearSession, getSession, refreshBalance } from '../lib/auth';
import { api } from '../lib/api';

export default function AccountScreen() {
  const nav = useNavigate();
  const session = getSession();
  const [balance, setBalance] = useState<number>(session?.balance_cdf ?? 0);
  const [tx, setTx] = useState<Array<{ id: string; type: TransactionType; amount: number; status: number; created_at: string }>>([]);

  useEffect(() => {
    if (!session) return;
    refreshBalance(session.id).then(setBalance).catch(() => {});
    api.transactions().then((r) => setTx(r.items)).catch(() => {});
  }, []);

  const initials = session?.phone?.slice(-2) || '??';

  const logout = () => {
    clearSession();
    nav('/login', { replace: true });
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

      <div className="mt-4 rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-950 border border-gold/20 p-4 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-gold/20 border-2 border-gold flex items-center justify-center font-display text-3xl text-gold">
          {initials}
        </div>
        <div className="flex-1">
          <div className="text-xs text-zinc-500 uppercase tracking-widest flex items-center gap-1">
            <Phone className="w-3 h-3" /> Numéro
          </div>
          <div className="font-display text-2xl tracking-wider">{session?.phone}</div>
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
