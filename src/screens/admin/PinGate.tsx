import { useState } from 'react';
import { Lock } from 'lucide-react';
import { adminApi, setAdminSecret, setAdminToken } from '../../lib/adminApi';

export default function PinGate({ onAuthed }: { onAuthed: () => void }) {
  const [phone, setPhone] = useState('');
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) {
      setError('Téléphone admin requis');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { token, role } = await adminApi.authenticate(secret, phone.trim());
      setAdminToken(token);
      // Persist the secret in sessionStorage so request() can silently
      // re-acquire a fresh token if the current one expires mid-session.
      setAdminSecret(secret);
      // Cache role so the UI can hide sensitive blocks for non-super-admins.
      try {
        sessionStorage.setItem('cg_admin_role', role || 'admin');
      } catch {}
      onAuthed();
    } catch (err: any) {
      setError(err?.message || 'Code invalide');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0f] px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-gold/30 bg-black/60 p-8 shadow-2xl backdrop-blur"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gold/10 text-gold">
            <Lock size={26} />
          </div>
          <h1 className="font-display text-3xl tracking-wider text-gold">CONGO GAMING</h1>
          <p className="mt-1 text-sm text-white/60">Admin — accès restreint</p>
        </div>

        <label className="mb-2 block text-xs uppercase tracking-wider text-white/60">
          Téléphone admin <span className="text-red-400">*</span>
        </label>
        <input
          type="tel"
          required
          autoFocus
          autoComplete="username"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mb-3 w-full rounded-lg border border-white/10 bg-black/50 px-4 py-3 font-mono text-white outline-none ring-gold/40 focus:border-gold/60 focus:ring-2"
          placeholder="0997174834"
        />

        <label className="mb-2 block text-xs uppercase tracking-wider text-white/60">
          Code administrateur
        </label>
        <input
          type="password"
          autoComplete="current-password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-black/50 px-4 py-3 font-mono text-white outline-none ring-gold/40 focus:border-gold/60 focus:ring-2"
          placeholder="••••••••"
        />

        {error && (
          <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !secret || !phone}
          className="mt-6 w-full rounded-lg bg-gold py-3 font-display text-lg tracking-wider text-black transition hover:brightness-110 disabled:opacity-50"
        >
          {loading ? 'Vérification…' : 'Entrer'}
        </button>

        <p className="mt-4 text-center text-xs text-white/40">
          Session valable 24h sur cet appareil.
        </p>
      </form>
    </div>
  );
}
