import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

/**
 * Reads the player's CGLT balance from the UniPay wallet via our backend
 * proxy (`GET /api/cglt/balance`, session-authenticated). The shared
 * GAMING_API_KEY never reaches the browser. Used by the header, Okapi Climb
 * and the CDF→CGLT swap modal.
 */
export function useCGLTBalance(autoLoad = true) {
  const [balanceCglt, setBalanceCglt] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(autoLoad);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.cgltBalance();
      const value = Number(res.cglt_balance) || 0;
      setBalanceCglt(value);
      setError(null);
      return value;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'cglt_balance_failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoLoad) void refresh();
  }, [autoLoad, refresh]);

  return { balanceCglt, setBalanceCglt, loading, error, refresh };
}

export default useCGLTBalance;
