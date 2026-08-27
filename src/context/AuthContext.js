import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  getStoredUser,
  logout as apiLogout,
} from '../services/authService';
import { setSessionExpiredHandler } from '../services/apiClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore a stored session on cold start.
  useEffect(() => {
    let alive = true;
    (async () => {
      const stored = await getStoredUser();
      if (alive) {
        setUser(stored);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // When a refresh token is rejected, apiClient clears storage and calls this,
  // so the UI drops to the signed-out state instead of showing a stale user
  // whose every request 401s.
  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
    return () => setSessionExpiredHandler(null);
  }, []);

  const signIn = useCallback((userData) => {
    // authService has already persisted the user and tokens.
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  // Memoised: without this every consumer re-renders on each provider render,
  // and signIn/logout are unsafe to use in a dependency array.
  const value = useMemo(
    () => ({ user, loading, isAuthenticated: !!user, signIn, logout }),
    [user, loading, signIn, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used inside an <AuthProvider>');
  }
  return context;
}
