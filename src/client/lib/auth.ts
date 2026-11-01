import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { authApi, UserProfile } from './api';

/* ─── Constants ──────────────────────────────────────────────────────────── */
const TOKEN_KEY = 'trimnova_token';
const USER_KEY  = 'trimnova_user';

/* ─── Auth Context Types ─────────────────────────────────────────────────── */
export interface AuthContextValue {
  user:            UserProfile | null;
  token:           string | null;
  isLoading:       boolean;
  isAuthenticated: boolean;
  login:           (identifier: string, password: string, role: string, totpCode?: string) => Promise<void>;
  logout:          () => Promise<void>;
  refreshUser:     () => Promise<void>;
}

/* ─── Context ────────────────────────────────────────────────────────────── */
const AuthContext = createContext<AuthContextValue | null>(null);

/* ─── Helper: safe JSON parse ────────────────────────────────────────────── */
function safeParseUser(raw: string | null): UserProfile | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as UserProfile; }
  catch { return null; }
}

/* ─── AuthProvider ───────────────────────────────────────────────────────── */
interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user,      setUser]      = useState<UserProfile | null>(() =>
    safeParseUser(localStorage.getItem(USER_KEY)),
  );
  const [token,     setToken]     = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY),
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);

  /* Verify stored token on mount */
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (!storedToken) { setIsLoading(false); return; }

    authApi.me()
      .then(freshUser => {
        setUser(freshUser);
        localStorage.setItem(USER_KEY, JSON.stringify(freshUser));
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setUser(null);
        setToken(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(
    async (identifier: string, password: string, role: string, totpCode?: string, passkey?: string) => {
      const response = await authApi.login({
        identifier,
        password,
        role: role.toUpperCase(),
        totpCode,
        passkey,
      });
      const { token: newToken, user: newUser } = response;
      localStorage.setItem(TOKEN_KEY, newToken);
      localStorage.setItem(USER_KEY, JSON.stringify(newUser));
      setToken(newToken);
      setUser(newUser);
    },
    [],
  );

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch { /* fire and forget */ }
    finally {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setToken(null);
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const freshUser = await authApi.me();
      setUser(freshUser);
      localStorage.setItem(USER_KEY, JSON.stringify(freshUser));
    } catch { /* silent */ }
  }, []);

  const value: AuthContextValue = {
    user,
    token,
    isLoading,
    isAuthenticated: !!token && !!user,
    login,
    logout,
    refreshUser,
  };

  /* Use createElement instead of JSX so this .ts file stays valid */
  return React.createElement(AuthContext.Provider, { value }, children);
}

/* ─── useAuth hook ───────────────────────────────────────────────────────── */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/* ─── Role helpers ───────────────────────────────────────────────────────── */
export function useIsVendor():   boolean { return useAuth().user?.role === 'VENDOR';   }
export function useIsCustomer(): boolean { return useAuth().user?.role === 'CUSTOMER'; }
export function useIsApprover(): boolean { return useAuth().user?.role === 'APPROVER'; }
export function useIsAdmin():    boolean {
  const role = useAuth().user?.role;
  return role === 'ADMIN' || role === 'SUPERUSER';
}
