import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, BadgeCheck, Check, KeyRound, LogOut, Pencil, Phone, ShieldAlert, ShieldCheck, TrendingDown, TrendingUp, Trophy, User, Wallet, X } from 'lucide-react';
import TransactionItem, { type TransactionType } from '../components/TransactionItem';
import { AuthApiError, changePin, clearSession, getSession, refreshSession, updateDisplayName } from '../lib/auth';
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

  type Stats = {
    totals: { deposit_cdf: number; withdrawal_cdf: number; bet_cdf: number; win_cdf: number; net_cdf: number };
    counts: { bets: number; wins: number; pending_deposits: number; pending_withdrawals: number };
    win_rate_percent: number;
  };
  const [stats, setStats] = useState<Stats | null>(null);

  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState(false);

  useEffect(() => {
    refreshSession().then((u) => {
      if (u) {
        setSession(u);
        setBalance(Number(u.balance_cdf || 0));
      }
    }).catch(() => {});
    api.transactions().then((r) => setTx(r.items)).catch(() => {});
    api.myStats().then(setStats).catch(() => {});
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

  const openPinModal = () => {
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setPinError(null);
    setPinSuccess(false);
    setPinModalOpen(true);
  };

  const closePinModal = () => {
    setPinModalOpen(false);
    setPinError(null);
  };

  const submitPinChange = async () => {
    if (pinSaving) return;
    if (!/^\d{4}$/.test(currentPin)) return setPinError('PIN actuel : 4 chiffres');
    if (!/^\d{4}$/.test(newPin)) return setPinError('Nouveau PIN : 4 chiffres');
    if (newPin !== confirmPin) return setPinError('Les nouveaux PIN ne correspondent pas');
    if (currentPin === newPin) return setPinError('Le nouveau PIN doit être différent');

    setPinSaving(true);
    setPinError(null);
    try {
      await changePin(currentPin, newPin);
      setPinSuccess(true);
      setTimeout(() => closePinModal(), 1500);
    } catch (e: any) {
      const msg = e instanceof AuthApiError ? e.message : 'Erreur inconnue';
      setPinError(msg);
    } finally {
      setPinSaving(false);
    }
  };

  const kycLabel = (() => {
    switch (session?.kyc_status) {
      case 'approved': return { text: 'Identité vérifiée', color: 'emerald', Icon: ShieldCheck };
      case 'denied': return { text: 'Identité refusée', color: 'red', Icon: ShieldAlert };
      case 'verify_age': return { text: 'Vérification d\'âge requise', color: 'amber', Icon: AlertTriangle };
      default: return { text: 'Identité non vérifiée', color: 'amber', Icon: ShieldAlert };
    }
  })();

  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');

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

      {/* KYC Status */}
      <div
        className={`mt-3 rounded-2xl p-3 flex items-center gap-3 border ${
          kycLabel.color === 'emerald' ? 'bg-emerald-500/10 border-emerald-500/30' :
          kycLabel.color === 'red' ? 'bg-red-500/10 border-red-500/30' :
          'bg-amber-500/10 border-amber-500/30'
        }`}
      >
        <kycLabel.Icon className={`w-6 h-6 shrink-0 ${
          kycLabel.color === 'emerald' ? 'text-emerald-400' :
          kycLabel.color === 'red' ? 'text-red-400' :
          'text-amber-400'
        }`} />
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold ${
            kycLabel.color === 'emerald' ? 'text-emerald-300' :
            kycLabel.color === 'red' ? 'text-red-300' :
            'text-amber-300'
          }`}>
            {kycLabel.text}
          </div>
          {session?.kyc_status !== 'approved' && (
            <div className="text-xs text-zinc-400">Recommandé pour les retraits importants</div>
          )}
        </div>
        {session?.kyc_status !== 'approved' && (
          <button
            type="button"
            onClick={() => nav('/kyc')}
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gold text-black"
          >
            VÉRIFIER
          </button>
        )}
      </div>

      {/* Personal stats */}
      {stats && (stats.counts.bets > 0 || stats.totals.deposit_cdf > 0) && (
        <div className="mt-3 rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-5 h-5 text-gold" />
            <h2 className="font-display text-base text-zinc-300 tracking-wider">MES STATISTIQUES</h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-zinc-950/60 border border-zinc-800 p-3">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Total déposé</div>
              <div className="font-display text-lg text-emerald-400">+{fmt(stats.totals.deposit_cdf)}</div>
            </div>
            <div className="rounded-xl bg-zinc-950/60 border border-zinc-800 p-3">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Total retiré</div>
              <div className="font-display text-lg text-amber-400">-{fmt(stats.totals.withdrawal_cdf)}</div>
            </div>
            <div className="rounded-xl bg-zinc-950/60 border border-zinc-800 p-3">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Paris joués</div>
              <div className="font-display text-lg text-white">{stats.counts.bets}</div>
            </div>
            <div className="rounded-xl bg-zinc-950/60 border border-zinc-800 p-3">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Taux de victoire</div>
              <div className="font-display text-lg text-gold">{stats.win_rate_percent}%</div>
            </div>
            <div className={`col-span-2 rounded-xl p-3 border flex items-center gap-2 ${
              stats.totals.net_cdf >= 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'
            }`}>
              {stats.totals.net_cdf >= 0
                ? <TrendingUp className="w-5 h-5 text-emerald-400" />
                : <TrendingDown className="w-5 h-5 text-red-400" />
              }
              <div className="flex-1">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Résultat net (gains − mises)</div>
                <div className={`font-display text-xl ${stats.totals.net_cdf >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {stats.totals.net_cdf >= 0 ? '+' : ''}{fmt(stats.totals.net_cdf)} <span className="text-xs text-zinc-400">CDF</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Security */}
      <div className="mt-3 rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4">
        <div className="flex items-center gap-2 mb-2">
          <BadgeCheck className="w-5 h-5 text-gold" />
          <h2 className="font-display text-base text-zinc-300 tracking-wider">SÉCURITÉ</h2>
        </div>
        <button
          type="button"
          onClick={openPinModal}
          className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 hover:border-gold/40 transition"
        >
          <KeyRound className="w-5 h-5 text-gold" />
          <div className="flex-1 text-left">
            <div className="text-sm text-white font-semibold">Changer mon PIN</div>
            <div className="text-xs text-zinc-500">Recommandé tous les 3 mois</div>
          </div>
          <Pencil className="w-4 h-4 text-zinc-400" />
        </button>
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

      {/* PIN change modal */}
      {pinModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-4">
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="w-full max-w-md bg-zinc-900 border border-gold/30 rounded-2xl p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-gold" />
                <h3 className="font-display text-xl text-white tracking-wider">CHANGER LE PIN</h3>
              </div>
              <button onClick={closePinModal} className="text-zinc-400 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {pinSuccess ? (
              <div className="py-6 text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/20 border-2 border-emerald-500 mb-3">
                  <Check className="w-7 h-7 text-emerald-400" />
                </div>
                <div className="text-emerald-300 font-semibold">PIN mis à jour avec succès</div>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-zinc-500 uppercase tracking-wider">PIN actuel</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={currentPin}
                      onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-3 text-white font-display text-2xl tracking-[0.5em] text-center outline-none focus:border-gold"
                      placeholder="••••"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 uppercase tracking-wider">Nouveau PIN</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-3 text-white font-display text-2xl tracking-[0.5em] text-center outline-none focus:border-gold"
                      placeholder="••••"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 uppercase tracking-wider">Confirmer le nouveau PIN</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-3 text-white font-display text-2xl tracking-[0.5em] text-center outline-none focus:border-gold"
                      placeholder="••••"
                    />
                  </div>
                </div>

                {pinError && (
                  <div className="mt-3 text-red-400 text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {pinError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={submitPinChange}
                  disabled={pinSaving || currentPin.length !== 4 || newPin.length !== 4 || confirmPin.length !== 4}
                  className="mt-4 w-full h-12 rounded-xl bg-gold text-black font-display text-lg tracking-wider disabled:opacity-50"
                >
                  {pinSaving ? 'ENREGISTREMENT…' : 'VALIDER'}
                </button>
              </>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
