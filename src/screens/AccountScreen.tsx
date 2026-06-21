import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import SwapCGLTModal from '../components/SwapCGLTModal';
import { AlertTriangle, BadgeCheck, Check, Copy, Gift, Globe, KeyRound, LogOut, Pause, Pencil, Phone, ShieldAlert, ShieldCheck, Share2, ShieldOff, TrendingDown, TrendingUp, Trophy, User, Users, Wallet, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import TransactionItem, { type TransactionType } from '../components/TransactionItem';
import { AuthApiError, changePin, clearSession, getSession, refreshSession, updateDisplayName } from '../lib/auth';
import { api } from '../lib/api';
import { displayError } from '../lib/errors';

function computeInitials(displayName: string | null | undefined, phone: string | undefined): string {
  if (displayName) {
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  }
  return phone?.slice(-2) || '??';
}

export default function AccountScreen() {
  const { t } = useTranslation();
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

  // Limits
  const [limits, setLimits] = useState<{
    daily_deposit_cdf: number | null;
    weekly_deposit_cdf: number | null;
    monthly_deposit_cdf: number | null;
    self_exclusion_until: string | null;
    pending_raise: Record<string, number | null> | null;
    pending_raise_effective_at: string | null;
  } | null>(null);
  const [limitsModalOpen, setLimitsModalOpen] = useState(false);
  const [limitDaily, setLimitDaily] = useState('');
  const [limitWeekly, setLimitWeekly] = useState('');
  const [limitMonthly, setLimitMonthly] = useState('');
  const [limitsSaving, setLimitsSaving] = useState(false);
  const [limitsError, setLimitsError] = useState<string | null>(null);

  // Self-exclusion
  const [exclusionModalOpen, setExclusionModalOpen] = useState(false);
  const [exclusionSaving, setExclusionSaving] = useState(false);

  // Referral — full payload from /api/me/referral. We rely on the
  // server-provided `rules` so the UI always reflects the current
  // program, and on `as_referee` to reassure freshly-referred users
  // that their welcome bonus is on its way.
  const [referral, setReferral] = useState<Awaited<ReturnType<typeof api.myReferral>> | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  // CDF→CGLT swap modal (also auto-opened from games).
  const [showSwapModal, setShowSwapModal] = useState(false);

  useEffect(() => {
    refreshSession().then((u) => {
      if (u) {
        setSession(u);
        setBalance(Number(u.balance_cdf || 0));
      }
    }).catch(() => {});
    api.transactions().then((r) => setTx(r.items)).catch(() => {});
    api.myStats().then(setStats).catch(() => {});
    api.myLimits().then((r) => setLimits(r.limits)).catch(() => {});
    api.myReferral().then(setReferral).catch(() => {});

    // Refresh balance every 30 seconds to catch admin adjustments
    const interval = setInterval(() => {
      refreshSession().then((u) => {
        if (u) setBalance(Number(u.balance_cdf || 0));
      }).catch(() => {});
    }, 30000);

    return () => clearInterval(interval);
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
      setNameError(t('account.pseudo_error'));
      return;
    }
    setSavingName(true);
    setNameError(null);
    try {
      const updated = await updateDisplayName(value === '' ? null : value);
      setSession(updated);
      setEditing(false);
    } catch (e: any) {
      setNameError(displayError(t, e instanceof AuthApiError ? e.code : undefined, e.message));
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
    if (!/^\d{6}$/.test(currentPin)) return setPinError(t('account.pin_error_current'));
    if (!/^\d{6}$/.test(newPin)) return setPinError(t('account.pin_error_new'));
    if (newPin !== confirmPin) return setPinError(t('account.pin_error_mismatch'));
    if (currentPin === newPin) return setPinError(t('account.pin_error_same'));

    setPinSaving(true);
    setPinError(null);
    try {
      await changePin(currentPin, newPin);
      setPinSuccess(true);
      setTimeout(() => closePinModal(), 1500);
    } catch (e: any) {
      setPinError(displayError(t, e instanceof AuthApiError ? e.code : undefined, e.message));
    } finally {
      setPinSaving(false);
    }
  };

  const kycLabel = (() => {
    switch (session?.kyc_status) {
      case 'approved': return { text: t('account.kyc_approved'), color: 'emerald', Icon: ShieldCheck };
      case 'denied': return { text: t('account.kyc_denied'), color: 'red', Icon: ShieldAlert };
      case 'verify_age': return { text: t('account.kyc_verify_age'), color: 'amber', Icon: AlertTriangle };
      default: return { text: t('account.kyc_unverified'), color: 'amber', Icon: ShieldAlert };
    }
  })();

  const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');

  const openLimitsModal = () => {
    setLimitDaily(limits?.daily_deposit_cdf != null ? String(limits.daily_deposit_cdf) : '');
    setLimitWeekly(limits?.weekly_deposit_cdf != null ? String(limits.weekly_deposit_cdf) : '');
    setLimitMonthly(limits?.monthly_deposit_cdf != null ? String(limits.monthly_deposit_cdf) : '');
    setLimitsError(null);
    setLimitsModalOpen(true);
  };

  const saveLimits = async () => {
    if (limitsSaving) return;
    const parseVal = (v: string): number | null => {
      const t = v.trim();
      if (t === '') return null;
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return NaN as unknown as null;
      return n;
    };
    const d = parseVal(limitDaily);
    const w = parseVal(limitWeekly);
    const m = parseVal(limitMonthly);
    if (Number.isNaN(d as any) || Number.isNaN(w as any) || Number.isNaN(m as any)) {
      setLimitsError(t('account.limits_invalid'));
      return;
    }
    setLimitsSaving(true);
    setLimitsError(null);
    try {
      await api.updateLimits({
        daily_deposit_cdf: d,
        weekly_deposit_cdf: w,
        monthly_deposit_cdf: m,
      });
      const refreshed = await api.myLimits();
      setLimits(refreshed.limits);
      setLimitsModalOpen(false);
    } catch (e: any) {
      setLimitsError(displayError(t, e?.code, e?.message));
    } finally {
      setLimitsSaving(false);
    }
  };

  const submitSelfExclusion = async (duration: '24h' | '7d' | '30d' | 'permanent') => {
    if (exclusionSaving) return;
    const durationLabels: Record<string, string> = {
      '24h': t('account.exclusion_duration_24h'),
      '7d': t('account.exclusion_duration_7d'),
      '30d': t('account.exclusion_duration_30d'),
      'permanent': t('account.exclusion_duration_permanent'),
    };
    if (!confirm(t('account.exclusion_confirm', { duration: durationLabels[duration] }))) return;
    setExclusionSaving(true);
    try {
      await api.selfExclusion(duration);
      const refreshed = await api.myLimits();
      setLimits(refreshed.limits);
      setExclusionModalOpen(false);
      alert(t('account.exclusion_success'));
    } catch (e: any) {
      alert(displayError(t, e?.code, e?.message));
    } finally {
      setExclusionSaving(false);
    }
  };

  const copyReferralCode = async () => {
    if (!referral?.code) return;
    try {
      await navigator.clipboard.writeText(referral.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1500);
    } catch {}
  };

  const shareReferralCode = () => {
    if (!referral?.code) return;
    const url = (typeof window !== 'undefined' ? window.location.origin : '') + '/register?ref=' + encodeURIComponent(referral.code);
    const text = t('account.referral_share_message', { code: referral.code, url });
    if (navigator.share) {
      // Pass `url` only; do NOT include it in `text` to avoid duplication on some platforms.
      navigator.share({ title: 'Congo Gaming', text: t('account.referral_share_text', { code: referral.code }), url }).catch(() => {});
    } else {
      const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(wa, '_blank');
    }
  };

  const exclusionActive = limits?.self_exclusion_until && new Date(limits.self_exclusion_until).getTime() > Date.now();

  return (
    <div className="min-h-screen p-4 pb-28">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-3xl text-gold tracking-wider">{t('account.title')}</h1>
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
              <User className="w-3 h-3" /> {t('account.pseudo_label')}
            </div>
            {!editing ? (
              <div className="flex items-center gap-2">
                <div className={`font-display text-xl tracking-wider truncate ${session?.display_name ? 'text-white' : 'text-zinc-500 italic'}`}>
                  {session?.display_name || t('account.pseudo_undefined')}
                </div>
                <button
                  type="button"
                  onClick={startEdit}
                  className="ml-auto text-gold hover:text-gold/80 p-1.5 rounded-lg hover:bg-gold/10"
                  aria-label={t('account.modify_aria')}
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
                  placeholder={t('account.pseudo_placeholder')}
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
                    <Check className="w-4 h-4" /> {savingName ? '…' : t('account.save')}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="h-10 px-3 rounded-lg bg-zinc-800 text-zinc-300 flex items-center gap-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-[11px] text-zinc-500 mt-1.5">{t('account.pseudo_hint')}</div>
                {nameError && <div className="text-red-400 text-xs mt-1">{nameError}</div>}
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-zinc-800/60">
          <div className="text-xs text-zinc-500 uppercase tracking-widest flex items-center gap-1">
            <Phone className="w-3 h-3" /> {t('account.phone_label')}
          </div>
          <div className="font-display text-xl tracking-wider text-zinc-200">{session?.phone}</div>
        </div>
      </div>

      <div className="mt-3 rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4 flex items-center gap-3">
        <Wallet className="w-7 h-7 text-gold" />
        <div className="flex-1">
          <div className="text-xs text-zinc-500 uppercase tracking-widest">{t('account.balance_label')}</div>
          <div className="font-display text-3xl text-gold">{balance.toLocaleString('fr-FR')} <span className="text-xs text-zinc-400">CDF</span></div>
        </div>
        <button
          type="button"
          onClick={() => setShowSwapModal(true)}
          className="shrink-0 h-10 px-4 rounded-xl font-bold text-sm text-black"
          style={{ background: 'linear-gradient(90deg, #FFD700, #38BDF8)' }}
        >
          Obtenir CGLT 💎
        </button>
      </div>

      {showSwapModal && (
        <SwapCGLTModal onClose={() => setShowSwapModal(false)} />
      )}

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
            <div className="text-xs text-zinc-400">{t('account.kyc_recommended')}</div>
          )}
        </div>
        {session?.kyc_status !== 'approved' && (
          <button
            type="button"
            onClick={() => nav('/kyc')}
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gold text-black"
          >
            {t('account.kyc_verify_button')}
          </button>
        )}
      </div>

      {/* Personal stats */}
      {stats && (stats.counts.bets > 0 || stats.totals.deposit_cdf > 0) && (
        <div className="mt-3 rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-5 h-5 text-gold" />
            <h2 className="font-display text-base text-zinc-300 tracking-wider">{t('account.stats_title')}</h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-zinc-950/60 border border-zinc-800 p-3">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{t('account.stats_deposited')}</div>
              <div className="font-display text-lg text-emerald-400">+{fmt(stats.totals.deposit_cdf)}</div>
            </div>
            <div className="rounded-xl bg-zinc-950/60 border border-zinc-800 p-3">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{t('account.stats_withdrawn')}</div>
              <div className="font-display text-lg text-amber-400">-{fmt(stats.totals.withdrawal_cdf)}</div>
            </div>
            <div className="rounded-xl bg-zinc-950/60 border border-zinc-800 p-3">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{t('account.stats_bets')}</div>
              <div className="font-display text-lg text-white">{stats.counts.bets}</div>
            </div>
            <div className="rounded-xl bg-zinc-950/60 border border-zinc-800 p-3">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{t('account.stats_win_rate')}</div>
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
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{t('account.stats_net')}</div>
                <div className={`font-display text-xl ${stats.totals.net_cdf >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {stats.totals.net_cdf >= 0 ? '+' : ''}{fmt(stats.totals.net_cdf)} <span className="text-xs text-zinc-400">CDF</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* As-referee callout — shown only if the player was themselves
          referred. Tells them WHO brought them, WHAT they get, and
          WHEN. Removes the "I entered a code, now what?" anxiety. */}
      {referral?.as_referee?.has_referrer && (
        <div className="mt-3 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-emerald-700/5 border border-emerald-500/30 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Gift className="w-5 h-5 text-emerald-400" />
            <h2 className="font-display text-base text-zinc-200 tracking-wider">{t('account.referral_been_referred')}</h2>
          </div>
          {referral.as_referee.referrer_display && (
            <div className="text-xs text-zinc-400 mb-2">
              {t('account.referral_by')} <b className="text-zinc-200">{referral.as_referee.referrer_display}</b>
            </div>
          )}
          {referral.as_referee.welcome_bonus_status === 'credited' ? (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" />
                <div className="text-sm text-emerald-200">
                  {t('account.referral_bonus_credited', { amount: fmt(referral.as_referee.welcome_bonus_cdf || 0) })}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-zinc-950/60 border border-zinc-800 px-4 py-3">
              <div className="text-sm text-zinc-200 leading-relaxed">
                {t('account.referral_first_deposit', { min: fmt(referral.rules.welcome_min_deposit_cdf), pct: referral.rules.welcome_bonus_pct, cap: fmt(referral.rules.welcome_bonus_cap_cdf) })}
              </div>
              <div className="text-[11px] text-zinc-500 mt-2">
                {t('account.referral_auto_credit')}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Referral — as referrer */}
      {referral?.code && (
        <div className="mt-3 rounded-2xl bg-gradient-to-br from-gold/10 to-amber-500/5 border border-gold/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Gift className="w-5 h-5 text-gold" />
            <h2 className="font-display text-base text-zinc-300 tracking-wider">{t('account.referral_section_title')}</h2>
          </div>
          <div className="text-xs text-zinc-400 mb-2">{t('account.referral_share_hint')}</div>
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <div className="w-full sm:flex-1 rounded-xl bg-zinc-950 border border-gold/40 px-3 py-3 font-display text-lg tracking-[0.15em] text-gold text-center">
              {referral.code}
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={copyReferralCode}
                className="h-12 w-12 rounded-xl bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center shrink-0"
                aria-label={t('account.referral_copy_aria')}
              >
                {copiedCode ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5 text-zinc-300" />}
              </button>
              <button
                type="button"
                onClick={shareReferralCode}
                className="h-12 px-3 rounded-xl bg-gold text-black font-bold flex items-center gap-1.5 text-xs shrink-0"
              >
                <Share2 className="w-4 h-4" /> {t('account.referral_share_button')}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="rounded-xl bg-zinc-950/60 border border-zinc-800 p-3 flex items-center gap-2">
              <Users className="w-5 h-5 text-gold" />
              <div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{t('account.referral_filleuls')}</div>
                <div className="font-display text-lg text-white">{referral.referred_count}</div>
              </div>
            </div>
            <div className="rounded-xl bg-zinc-950/60 border border-zinc-800 p-3">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{t('account.referral_bonuses')}</div>
              <div className="font-display text-lg text-emerald-400">+{fmt(referral.total_credited_cdf)}</div>
            </div>
          </div>

          {/* Annual cap progress — only shown if the player has earned
              at least once, otherwise it's just noise. */}
          {referral.annual_credited_cdf > 0 && (
            <div className="mt-3 rounded-xl bg-zinc-950/60 border border-zinc-800 p-3">
              <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                <span>{t('account.referral_annual_cap')}</span>
                <span className="text-zinc-200">
                  {fmt(referral.annual_credited_cdf)} / {fmt(referral.rules.annual_cap_cdf)} CDF
                </span>
              </div>
              <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-gold transition-all"
                  style={{
                    width: `${Math.min(100, (referral.annual_credited_cdf / referral.rules.annual_cap_cdf) * 100).toFixed(1)}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Rules drawer — collapsed by default to keep the card
              compact, but always one tap away. Server-driven so the
              numbers stay accurate forever. */}
          <button
            type="button"
            onClick={() => setRulesOpen((v) => !v)}
            className="mt-3 w-full text-left text-xs text-zinc-400 hover:text-zinc-200 flex items-center justify-between"
          >
            <span>{t('account.referral_how')}</span>
            <span className="text-zinc-500">{rulesOpen ? '▴' : '▾'}</span>
          </button>
          {rulesOpen && (
            <div className="mt-2 rounded-xl bg-zinc-950/60 border border-zinc-800 p-3 space-y-2 text-xs text-zinc-300 leading-relaxed">
              <div>
                <b className="text-gold">{t('account.referral_for_filleul')}</b> {t('account.referral_filleul_rule', { pct: referral.rules.welcome_bonus_pct, min: fmt(referral.rules.welcome_min_deposit_cdf), cap: fmt(referral.rules.welcome_bonus_cap_cdf) })}
              </div>
              <div>
                <b className="text-gold">{t('account.referral_for_parrain')}</b> {t('account.referral_parrain_rule_cta')}
                <ul className="mt-1 ml-4 list-disc text-zinc-400 space-y-0.5">
                  {referral.rules.tiers.map((tier) => (
                    <li key={tier.tier}>
                      {fmt(tier.threshold_cdf)} CDF misés → <b className="text-emerald-400">+{fmt(tier.reward_cdf)} CDF</b>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="text-[11px] text-zinc-500">
                {t('account.referral_cap_note', { amount: fmt(referral.rules.annual_cap_cdf) })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Security */}
      <div className="mt-3 rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4">
        <div className="flex items-center gap-2 mb-2">
          <BadgeCheck className="w-5 h-5 text-gold" />
          <h2 className="font-display text-base text-zinc-300 tracking-wider">{t('account.security_title')}</h2>
        </div>
        <button
          type="button"
          onClick={openPinModal}
          className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 hover:border-gold/40 transition"
        >
          <KeyRound className="w-5 h-5 text-gold" />
          <div className="flex-1 text-left">
            <div className="text-sm text-white font-semibold">{t('account.security_change_pin')}</div>
            <div className="text-xs text-zinc-500">{t('account.security_pin_recommended')}</div>
          </div>
          <Pencil className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      {/* Responsible Gaming */}
      <div className="mt-3 rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-5 h-5 text-gold" />
          <h2 className="font-display text-base text-zinc-300 tracking-wider">{t('account.responsible_title')}</h2>
        </div>

        {exclusionActive && (
          <div className="mb-3 rounded-xl bg-red-500/10 border border-red-500/30 p-3 flex items-start gap-2">
            <ShieldOff className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-red-300">{t('account.exclusion_active_label')}</div>
              <div className="text-xs text-zinc-400">{t('account.exclusion_until', { date: new Date(limits!.self_exclusion_until!).toLocaleString('fr-FR') })}</div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={openLimitsModal}
          className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 hover:border-gold/40 transition mb-2"
        >
          <Wallet className="w-5 h-5 text-gold" />
          <div className="flex-1 text-left">
            <div className="text-sm text-white font-semibold">{t('account.limits_title')}</div>
            <div className="text-xs text-zinc-500">
              {limits?.daily_deposit_cdf || limits?.weekly_deposit_cdf || limits?.monthly_deposit_cdf
                ? `J: ${limits.daily_deposit_cdf ? fmt(limits.daily_deposit_cdf) : '∞'} • S: ${limits.weekly_deposit_cdf ? fmt(limits.weekly_deposit_cdf) : '∞'} • M: ${limits.monthly_deposit_cdf ? fmt(limits.monthly_deposit_cdf) : '∞'}`
                : t('account.limits_none')}
            </div>
          </div>
          <Pencil className="w-4 h-4 text-zinc-400" />
        </button>

        <button
          type="button"
          onClick={() => setExclusionModalOpen(true)}
          disabled={!!exclusionActive}
          className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 hover:border-red-500/40 transition disabled:opacity-50"
        >
          <Pause className="w-5 h-5 text-red-400" />
          <div className="flex-1 text-left">
            <div className="text-sm text-white font-semibold">{t('account.exclusion_menu_title')}</div>
            <div className="text-xs text-zinc-500">{t('account.exclusion_hint')}</div>
          </div>
        </button>
      </div>

      <div className="mt-5">
        <h2 className="font-display text-xl text-zinc-400 tracking-wider mb-2">{t('account.transactions_title')}</h2>
        <div className="space-y-2">
          {tx.length === 0 && (
            <div className="text-zinc-500 text-sm p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
              {t('account.no_transactions')}
            </div>
          )}
          {tx.map((txItem) => (
            <TransactionItem key={txItem.id} type={txItem.type} amount={Number(txItem.amount)} status={txItem.status} date={txItem.created_at} />
          ))}
        </div>
      </div>

      {/* Language toggle */}
      <div className="mt-3 rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-gold" />
          <h2 className="font-display text-base text-zinc-300 tracking-wider">{t('account.language_section')}</h2>
        </div>
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={logout}
        className="mt-6 w-full h-14 rounded-2xl bg-red-600/90 text-white font-display text-2xl tracking-widest flex items-center justify-center gap-2"
      >
        <LogOut className="w-5 h-5" /> {t('account.logout')}
      </motion.button>

      <div className="mt-6 text-center">
        <button
          onClick={() => nav('/legal')}
          className="text-xs text-gray-500 underline"
        >
          {t('account.legal')}
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
                <h3 className="font-display text-xl text-white tracking-wider">{t('account.pin_modal_title')}</h3>
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
                <div className="text-emerald-300 font-semibold">{t('account.pin_updated')}</div>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-zinc-500 uppercase tracking-wider">{t('account.pin_current_label')}</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={currentPin}
                      onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-3 text-white font-display text-2xl tracking-[0.5em] text-center outline-none focus:border-gold"
                      placeholder="••••••"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 uppercase tracking-wider">{t('account.pin_new_label')}</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-3 text-white font-display text-2xl tracking-[0.5em] text-center outline-none focus:border-gold"
                      placeholder="••••••"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 uppercase tracking-wider">{t('account.pin_confirm_label')}</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-3 text-white font-display text-2xl tracking-[0.5em] text-center outline-none focus:border-gold"
                      placeholder="••••••"
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
                  disabled={pinSaving || currentPin.length !== 6 || newPin.length !== 6 || confirmPin.length !== 6}
                  className="mt-4 w-full h-12 rounded-xl bg-gold text-black font-display text-lg tracking-wider disabled:opacity-50"
                >
                  {pinSaving ? t('account.pin_saving') : t('account.pin_validate')}
                </button>
              </>
            )}
          </motion.div>
        </div>
      )}

      {/* Limits modal */}
      {limitsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-4">
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="w-full max-w-md bg-zinc-900 border border-gold/30 rounded-2xl p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-gold" />
                <h3 className="font-display text-xl text-white tracking-wider">{t('account.limits_modal_title')}</h3>
              </div>
              <button onClick={() => setLimitsModalOpen(false)} className="text-zinc-400 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-zinc-400 mb-3">
              {t('account.limits_info')}
            </div>

            <div className="space-y-3">
              {[
                { label: t('account.limits_daily'), value: limitDaily, set: setLimitDaily },
                { label: t('account.limits_weekly'), value: limitWeekly, set: setLimitWeekly },
                { label: t('account.limits_monthly'), value: limitMonthly, set: setLimitMonthly },
              ].map((f) => (
                <div key={f.label}>
                  <label className="text-xs text-zinc-500 uppercase tracking-wider">{f.label}</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={f.value}
                    onChange={(e) => f.set(e.target.value.replace(/\D/g, '').slice(0, 12))}
                    placeholder="∞"
                    className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-3 text-white font-display text-lg outline-none focus:border-gold"
                  />
                </div>
              ))}
            </div>

            {limits?.pending_raise && limits?.pending_raise_effective_at && (
              <div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-300">
                {t('account.limits_pending_raise', { date: new Date(limits.pending_raise_effective_at).toLocaleString('fr-FR') })}
              </div>
            )}

            {limitsError && (
              <div className="mt-3 text-red-400 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {limitsError}
              </div>
            )}

            <button
              type="button"
              onClick={saveLimits}
              disabled={limitsSaving}
              className="mt-4 w-full h-12 rounded-xl bg-gold text-black font-display text-lg tracking-wider disabled:opacity-50"
            >
              {limitsSaving ? t('account.limits_saving') : t('account.save')}
            </button>
          </motion.div>
        </div>
      )}

      {/* Self-exclusion modal */}
      {exclusionModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-4">
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="w-full max-w-md bg-zinc-900 border border-red-500/30 rounded-2xl p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Pause className="w-5 h-5 text-red-400" />
                <h3 className="font-display text-xl text-white tracking-wider">{t('account.exclusion_modal_title')}</h3>
              </div>
              <button onClick={() => setExclusionModalOpen(false)} className="text-zinc-400 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 mb-4 text-sm text-red-300">
              {t('account.exclusion_warning')}
            </div>

            <div className="space-y-2">
              {([
                { value: '24h' as const, label: t('account.exclusion_24h_label'), desc: t('account.exclusion_24h_desc') },
                { value: '7d' as const, label: t('account.exclusion_7d_label'), desc: t('account.exclusion_7d_desc') },
                { value: '30d' as const, label: t('account.exclusion_30d_label'), desc: t('account.exclusion_30d_desc') },
                { value: 'permanent' as const, label: t('account.exclusion_permanent_label'), desc: t('account.exclusion_permanent_desc') },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => submitSelfExclusion(opt.value)}
                  disabled={exclusionSaving}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 hover:border-red-500/40 transition disabled:opacity-50"
                >
                  <div className="flex-1 text-left">
                    <div className="text-sm text-white font-semibold">{opt.label}</div>
                    <div className="text-xs text-zinc-500">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
