import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import SplashScreen from './screens/SplashScreen';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import ResetPinScreen from './screens/ResetPinScreen';
import HomeScreen from './screens/HomeScreen';
import GameScreen from './screens/GameScreen';
import DepositScreen from './screens/DepositScreen';
import WithdrawScreen from './screens/WithdrawScreen';
import AccountScreen from './screens/AccountScreen';
import LotoScreen from './screens/LotoScreen';
import OkapiColorScreen from './screens/OkapiColorScreen';
import OkapiColorTVScreen from './screens/OkapiColorTVScreen';
import FlashScreen from './screens/FlashScreen';
import ScratchScreen from './screens/ScratchScreen';
import LegalScreen from './screens/LegalScreen';
import OkapiGame from './screens/okapi/OkapiGame';
import AdminScreen from './screens/AdminScreen';
import KycScreen from './screens/KycScreen';
import BottomNav from './components/BottomNav';
import InstallPrompt from './components/InstallPrompt';
import { clearSession, getSession, refreshSession } from './lib/auth';

function PageWrap({ children, fullscreen = false }: { children: React.ReactNode; fullscreen?: boolean }) {
  if (fullscreen) {
    // Game screens (Okapi Climb) own their own 100dvh layout and must not be
    // wrapped in min-h-screen + a translateY animation: that creates a tall
    // outer scroller and the dreaded "page slides up/down" effect.
    return <>{children}</>
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25 }}
      className="min-h-screen"
    >
      {children}
    </motion.div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (!session) return <Navigate to="/splash" replace />;
  // Hard-block denied accounts (PlayGuard verdict DENIED → minor or banned).
  // We can't proceed: drop the session and return to splash.
  if (session.blocked || session.kyc_status === 'denied') {
    clearSession();
    return <Navigate to="/splash" replace />;
  }
  // KYC is no longer a global gate. It's enforced ONLY on the PredictStreet
  // sports-betting route (/jouer) via `PredictStreetRoute` below. All other
  // games (Climb, Loto, Flash, Scratch) and account pages are reachable
  // immediately after registration regardless of `kyc_status`.
  return <>{children}</>;
}

/**
 * Sports-betting (PredictStreet) gate. FIFA WC26 betting requires a
 * verified identity per the PredictStreet contract, so we redirect users
 * with a `pending` KYC status to /kyc (preserving the intended
 * destination in localStorage so KycScreen can bounce them back here).
 */
function PredictStreetRoute({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (!session) return <Navigate to="/splash" replace />;
  if (session.blocked || session.kyc_status === 'denied') {
    clearSession();
    return <Navigate to="/splash" replace />;
  }
  if (session.kyc_status !== 'approved' && session.kyc_status !== 'verify_age') {
    try {
      localStorage.setItem('kyc_redirect', '/jouer');
    } catch {
      /* storage unavailable — KycScreen will fall back to '/' */
    }
    return <Navigate to="/kyc" replace />;
  }
  return <>{children}</>;
}

/**
 * /kyc itself is protected against anonymous access but bypasses the
 * kyc_status check (otherwise we'd loop forever).
 */
function KycRoute() {
  const session = getSession();
  if (!session) return <Navigate to="/splash" replace />;
  if (session.blocked) {
    clearSession();
    return <Navigate to="/splash" replace />;
  }
  // Already verified → don't re-prompt; bounce to home.
  if (session.kyc_status === 'approved' || session.kyc_status === 'verify_age') {
    return <Navigate to="/" replace />;
  }
  return <KycScreen />;
}

function AppRoutes() {
  const location = useLocation();
  const showNav = ['/', '/loto', '/flash', '/scratch', '/climb', '/okapi-color', '/compte'].includes(location.pathname);
  return (
    <>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/splash" element={<PageWrap><SplashScreen /></PageWrap>} />
          <Route path="/login" element={<PageWrap><LoginScreen /></PageWrap>} />
          <Route path="/register" element={<PageWrap><RegisterScreen /></PageWrap>} />
          <Route path="/reset-pin" element={<PageWrap><ResetPinScreen /></PageWrap>} />
          <Route path="/" element={<Protected><PageWrap><HomeScreen /></PageWrap></Protected>} />
          <Route
            path="/jouer"
            element={
              <Protected>
                <PredictStreetRoute>
                  <PageWrap><GameScreen /></PageWrap>
                </PredictStreetRoute>
              </Protected>
            }
          />
          <Route path="/depot" element={<Protected><PageWrap><DepositScreen /></PageWrap></Protected>} />
          <Route path="/retrait" element={<Protected><PageWrap><WithdrawScreen /></PageWrap></Protected>} />
          <Route path="/compte" element={<Protected><PageWrap><AccountScreen /></PageWrap></Protected>} />
          <Route path="/loto" element={<Protected><PageWrap><LotoScreen /></PageWrap></Protected>} />
          <Route path="/flash" element={<Protected><PageWrap><FlashScreen /></PageWrap></Protected>} />
          <Route path="/scratch" element={<Protected><PageWrap><ScratchScreen /></PageWrap></Protected>} />
          <Route path="/climb" element={<Protected><PageWrap fullscreen><OkapiGame /></PageWrap></Protected>} />
          <Route path="/okapi-color" element={<Protected><PageWrap><OkapiColorScreen /></PageWrap></Protected>} />
          <Route path="/legal" element={<Protected><PageWrap><LegalScreen /></PageWrap></Protected>} />
          <Route path="/kyc" element={<PageWrap><KycRoute /></PageWrap>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
      {showNav && <InstallPrompt />}
      {showNav && <BottomNav />}
    </>
  );
}

function AppShell() {
  const location = useLocation();
  // /climb is a fullscreen game: it manages its own 100dvh layout and the
  // BottomNav clearance internally. The default pb-20 + min-h-screen wrapper
  // would create an outer scroller and break the lock-to-viewport layout.
  const isFullscreen = location.pathname === '/climb';
  // /admin is a desktop-oriented dashboard: it must not be constrained to
  // the 430px mobile shell, and must not show the player BottomNav.
  const isAdmin = location.pathname.startsWith('/admin');
  const isTV    = location.pathname.startsWith('/tv');
  if (isAdmin) {
    return (
      <Routes>
        <Route path="/admin" element={<AdminScreen />} />
      </Routes>
    );
  }
  if (isTV) {
    return (
      <Routes>
        <Route path="/tv/okapi-color" element={<OkapiColorTVScreen />} />
      </Routes>
    );
  }
  return (
    <div
      className={
        isFullscreen
          ? 'mx-auto w-full max-w-app bg-bg relative'
          : 'mx-auto w-full max-w-app min-h-screen bg-bg relative pb-20'
      }
      style={isFullscreen ? { height: '100dvh', overflow: 'hidden' } : undefined}
    >
      <AppRoutes />
    </div>
  );
}

/**
 * Auth bootstrap: the in-memory session is wiped on every page refresh,
 * but the httpOnly cookie `cg_access_token` survives. We must call
 * `/api/auth/me` once on boot to rehydrate the session before letting
 * `Protected` decide where to route — otherwise refreshing any page
 * kicks the user back to /splash even though they are still
 * authenticated server-side.
 */
function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    refreshSession().finally(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!ready) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-bg text-zinc-500 text-sm">
        Chargement…
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthBootstrap>
      <AppShell />
    </AuthBootstrap>
  );
}
