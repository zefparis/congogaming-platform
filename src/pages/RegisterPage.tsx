import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { registerEmail, getSession } from '../lib/auth';

const BG = '#080E1C';
const BG_2 = '#0C1628';
const ORANGE = '#FF6B00';
const SANS = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif";
const BEBAS = "'Bebas Neue', Impact, sans-serif";

const KEYFRAMES = `
@keyframes aFadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

export default function RegisterPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (getSession()) nav('/', { replace: true });
  }, [nav]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !email.includes('@')) {
      setError('Veuillez entrer une adresse email valide.');
      return;
    }
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    try {
      await registerEmail(email, password);
      nav('/');
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue lors de la création du compte.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: `linear-gradient(180deg, ${BG} 0%, ${BG_2} 100%)`,
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: SANS,
        padding: '0 20px',
      }}
    >
      <style>{KEYFRAMES}</style>

      {/* Top toast error */}
      {error && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            left: 20,
            right: 20,
            background: 'rgba(239, 68, 68, 0.9)',
            border: '1px solid rgba(239, 68, 68, 0.5)',
            color: '#fff',
            padding: '12px 16px',
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 500,
            zIndex: 50,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            animation: 'aFadeUp 0.2s ease-out',
          }}
        >
          {error}
        </div>
      )}

      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 60,
          marginTop: 10,
        }}
      >
        <button
          onClick={() => nav(-1)}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            width: 40,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 18,
          }}
        >
          ‹
        </button>
      </header>

      {/* Main Content */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          paddingBottom: 'env(safe-area-inset-bottom)',
          animation: 'aFadeUp 0.4s ease-out 0.15s both',
        }}
      >
        <div
          style={{
            fontFamily: BEBAS,
            fontSize: 42,
            letterSpacing: 1,
            lineHeight: 1,
            marginBottom: 8,
          }}
        >
          CRÉER UN COMPTE
        </div>
        <div
          style={{
            fontSize: 14,
            color: 'rgba(255,255,255,0.5)',
            marginBottom: 32,
          }}
        >
          Rejoins Congo Gaming
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input
            type="email"
            placeholder="Adresse email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12,
              padding: '14px 16px',
              color: '#fff',
              fontSize: 15,
              outline: 'none',
              fontFamily: SANS,
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => (e.target.style.borderColor = ORANGE)}
            onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
          />
          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12,
              padding: '14px 16px',
              color: '#fff',
              fontSize: 15,
              outline: 'none',
              fontFamily: SANS,
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => (e.target.style.borderColor = ORANGE)}
            onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
          />
          <input
            type="password"
            placeholder="Confirmer le mot de passe"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={loading}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12,
              padding: '14px 16px',
              color: '#fff',
              fontSize: 15,
              outline: 'none',
              fontFamily: SANS,
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => (e.target.style.borderColor = ORANGE)}
            onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '16px 0',
              background: ORANGE,
              border: 'none',
              borderRadius: 15,
              color: '#fff',
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: 0.8,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 5px 22px rgba(255,107,0,0.28)',
              marginTop: 12,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'CHARGEMENT...' : 'S\'INSCRIRE'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Link
            to="/login"
            style={{
              color: 'rgba(255,255,255,0.5)',
              fontSize: 13,
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Déjà un compte ? <span style={{ color: ORANGE }}>Se connecter</span>
          </Link>
        </div>
      </main>
    </div>
  );
}
