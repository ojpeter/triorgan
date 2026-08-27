// ─────────────────────────────────────────────────────────────────────────────
// One wallet cache for the whole app.
//
// Four screens previously kept their own copy in useState with no shared
// invalidation, so buying credits on the Wallet tab left the Detection screen
// still saying "0 credits left" until it was destroyed. There is now one cache
// and one refresh() that every screen shares.
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { useAuth } from './AuthContext';
import { fetchWallet, fetchTransactions, EMPTY_WALLET } from '../services/paymentService';

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  // 'idle' before we have ever loaded, so the UI can show a skeleton instead of
  // rendering a confident "0 credits" that may be wrong.
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  const requestRef = useRef(0);

  const refresh = useCallback(
    async ({ includeTransactions = true } = {}) => {
      if (!userId) {
        setWallet(null);
        setTransactions([]);
        setStatus('idle');
        return;
      }

      const requestId = ++requestRef.current;
      setStatus((prev) => (prev === 'ready' ? 'refreshing' : 'loading'));
      setError(null);

      try {
        const [nextWallet, nextTransactions] = await Promise.all([
          fetchWallet(userId),
          includeTransactions ? fetchTransactions(userId) : Promise.resolve(null),
        ]);

        // A slower earlier request must not overwrite a newer result.
        if (requestId !== requestRef.current) return;

        setWallet(nextWallet);
        if (nextTransactions) setTransactions(nextTransactions);
        setStatus('ready');
      } catch (err) {
        if (requestId !== requestRef.current) return;
        setError(err?.userMessage ?? 'Could not load your wallet.');
        setStatus('error');
      }
    },
    [userId]
  );

  // Load on sign-in; clear on sign-out so one account never shows another's
  // balance.
  useEffect(() => {
    requestRef.current += 1;
    setWallet(null);
    setTransactions([]);
    setError(null);
    setStatus('idle');
    if (userId) refresh();
  }, [userId, refresh]);

  /** Apply a wallet the server just returned, without another round trip. */
  const applyWallet = useCallback((next) => {
    if (!next) return;
    setWallet(next);
    setStatus('ready');
    setError(null);
  }, []);

  const value = useMemo(
    () => ({
      wallet,
      transactions,
      status,
      error,
      isLoading: status === 'loading',
      isReady: status === 'ready' || status === 'refreshing',
      // Only ever a number once we have actually loaded. Screens must check
      // isReady before treating 0 as "out of credits".
      balanceScans: wallet?.balanceScans ?? null,
      refresh,
      applyWallet,
    }),
    [wallet, transactions, status, error, refresh, applyWallet]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === null) {
    throw new Error('useWallet must be used inside a <WalletProvider>');
  }
  return context;
}

export { EMPTY_WALLET };
