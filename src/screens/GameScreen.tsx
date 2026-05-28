import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wallet } from 'lucide-react';
import { getSession } from '../lib/auth';

export default function GameScreen() {
  const nav = useNavigate();
  const session = getSession();
  const url = import.meta.env.VITE_GAME_IFRAME_URL || 'about:blank';

  return (
    <div className="fixed inset-0 mx-auto max-w-app bg-bg z-40 flex flex-col">
      <header className="flex items-center justify-between px-3 py-2 bg-zinc-950/95 border-b border-zinc-900">
        <button
          onClick={() => nav('/')}
          className="w-11 h-11 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-gold"
          aria-label="Retour"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <img
          src="/images/okapi.PNG"
          alt="Congo Gaming"
          className="h-10 w-auto object-contain cursor-pointer"
          onClick={() => {
            const user = getSession();
            user ? nav('/home') : nav('/');
          }}
        />
      </header>
      <iframe
        src={url}
        title="Game"
        className="flex-1 w-full bg-black"
        allow="autoplay; fullscreen; payment"
      />
    </div>
  );
}
