import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import SplashScreen from './screens/SplashScreen';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import ResetPinScreen from './screens/ResetPinScreen';
import HomeScreen from './screens/HomeScreen';
import DepositScreen from './screens/DepositScreen';
import WithdrawScreen from './screens/WithdrawScreen';
import AccountScreen from './screens/AccountScreen';
import OkapiColorScreen from './screens/OkapiColorScreen';
import OkapiColorTVScreen from './screens/OkapiColorTVScreen';
import AgentDashboard from './screens/AgentDashboard';
import LegalScreen from './screens/LegalScreen';
import AdminScreen from './screens/AdminScreen';
import KycScreen from './screens/KycScreen';
import BottomNav from './components/BottomNav';
import InstallPrompt from './components/InstallPrompt';
import { LanguageToggle } from './components/LanguageToggle';
import { clearSession, getSession, refreshSession } from './lib/auth';
import ErrorBoundary from './components/ErrorBoundary';

function PageWrap({ children }: { children: React.ReactNode }) {
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
  const showNav = ['/', '/okapi-color', '/compte'].includes(location.pathname);
  return (
    <>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/splash" element={<PageWrap><SplashScreen /></PageWrap>} />
          <Route path="/login" element={<PageWrap><LoginScreen /></PageWrap>} />
          <Route path="/register" element={<PageWrap><RegisterScreen /></PageWrap>} />
          <Route path="/reset-pin" element={<PageWrap><ResetPinScreen /></PageWrap>} />
          <Route path="/" element={<Protected><PageWrap><HomeScreen /></PageWrap></Protected>} />
          <Route path="/depot" element={<Protected><PageWrap><DepositScreen /></PageWrap></Protected>} />
          <Route path="/retrait" element={<Protected><PageWrap><WithdrawScreen /></PageWrap></Protected>} />
          <Route path="/compte" element={<Protected><PageWrap><AccountScreen /></PageWrap></Protected>} />
          {/* Removed games redirect to home (no 404). */}
          <Route path="/loto" element={<Navigate to="/" replace />} />
          <Route path="/flash" element={<Navigate to="/" replace />} />
          <Route path="/scratch" element={<Navigate to="/" replace />} />
          <Route path="/climb" element={<Navigate to="/" replace />} />
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
  // /admin is a desktop-oriented dashboard: it must not be constrained to
  // the 430px mobile shell, and must not show the player BottomNav.
  const isAdmin = location.pathname.startsWith('/admin');
  const isTV    = location.pathname.startsWith('/tv');
  const isAgent = location.pathname.startsWith('/agent');
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
  if (isAgent) {
    return (
      <Routes>
        <Route path="/agent/:qrCode" element={<AgentDashboard />} />
      </Routes>
    );
  }
  return (
    <div className="mx-auto w-full max-w-app min-h-screen bg-bg relative pb-20">
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '4px 16px',
        background: '#0f0f0f',
        borderBottom: '1px solid #1e1e1e',
      }}>
        <LanguageToggle />
      </div>
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
    <ErrorBoundary>
      <AuthBootstrap>
        <AppShell />
      </AuthBootstrap>
    </ErrorBoundary>
  );
}
