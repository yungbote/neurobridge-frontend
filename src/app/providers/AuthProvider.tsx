import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  loginUser,
  logoutUser,
  createOAuthNonce,
  oauthGoogle,
  oauthApple,
  refreshToken,
  registerUser,
  type RegisterPayload,
} from "@/shared/api/AuthService";
import {
  setTokens,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setExpiresAt,
  getExpiresAt,
} from "@/shared/services/StorageService";
import { queryKeys } from "@/shared/query/queryKeys";
import {
  getAppleIdTokenWithNonce,
  getFallbackNameFromIdToken,
  getGoogleIdTokenWithNonce,
} from "@/shared/services/OAuthService";

interface AuthContextValue {
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
}

// Auth context default shape
export const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: false,
  login: async () => {},
  loginWithGoogle: async () => {},
  loginWithApple: async () => {},
  logout: async () => {},
  refresh: async () => {},
  register: async () => {},
});

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(!!getAccessToken());
  const refreshTimerId = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  const clearSession = useCallback(() => {
    clearTokens();
    if (refreshTimerId.current) {
      clearTimeout(refreshTimerId.current);
      refreshTimerId.current = null;
    }
    queryClient.clear();
    setIsAuthenticated(false);
  }, [queryClient]);

  const refreshTokens = useCallback(async () => {
    try {
      const currentRefreshToken = getRefreshToken();
      if (!currentRefreshToken) {
        throw new Error("No refresh token in localStorage");
      }
      const { access_token, refresh_token, expires_in } = await refreshToken();
      doSessionLogin(access_token, refresh_token, expires_in);
    } catch (err) {
      console.error("[AuthProvider] Token refresh failed:", err);
      clearSession();
    }
  }, [clearSession]);

  const doSessionLogin = useCallback(
    (accessToken: string, newRefreshToken: string, expiresIn: number) => {
      setTokens(accessToken, newRefreshToken);
      const expiresAt = Date.now() + expiresIn * 1000;
      setExpiresAt(expiresAt);
      setIsAuthenticated(true);

      // If we refreshed the token (or logged in), ensure any auth-gated queries that may have
      // previously failed with 401/403 get a chance to refetch with the new credentials.
      void queryClient.invalidateQueries({ queryKey: queryKeys.me(), exact: true });
      void queryClient.invalidateQueries({ queryKey: queryKeys.paths(), exact: true });
      void queryClient.invalidateQueries({ queryKey: queryKeys.materialFiles(), exact: true });
      void queryClient.invalidateQueries({ queryKey: queryKeys.libraryTaxonomySnapshot(), exact: true });
      void queryClient.invalidateQueries({ queryKey: ["chatThreads"] as const, exact: false });

      // Clear any existing timer
      if (refreshTimerId.current) {
        clearTimeout(refreshTimerId.current);
      }

      // Schedule refresh a bit before expiry (30s early)
      const delayBeforeRefresh = expiresAt - Date.now() - 30000;
      const safeDelay = Math.max(0, delayBeforeRefresh);
      refreshTimerId.current = setTimeout(() => {
        refreshTokens();
      }, safeDelay);
    },
    [queryClient, refreshTokens]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const { access_token, refresh_token, expires_in } = await loginUser({
        email,
        password,
      });
      doSessionLogin(access_token, refresh_token, expires_in);
    },
    [doSessionLogin]
  );

  const logout = useCallback(async () => {
    try {
      await logoutUser();
    } catch (err) {
      console.error("[AuthProvider] Logout error (ignored):", err);
    }
    clearSession();
  }, [clearSession]);

  const register = useCallback(
    async ({ email, password, first_name, last_name }: RegisterPayload) => {
      await registerUser({ email, password, first_name, last_name });
      await login(email, password);
    }, [login]);

  const loginWithGoogle = useCallback(async () => {
    const { nonce_id, nonce } = await createOAuthNonce("google");
    const idToken = await getGoogleIdTokenWithNonce(nonce);

    const { first_name, last_name } = getFallbackNameFromIdToken(idToken);
    const { access_token, refresh_token, expires_in } = await oauthGoogle({
      id_token: idToken,
      nonce_id,
      first_name,
      last_name,
    });

    doSessionLogin(access_token, refresh_token, expires_in);
  }, [doSessionLogin]);

  const loginWithApple = useCallback(async () => {
    const { nonce_id, nonce } = await createOAuthNonce("apple");
    const { idToken, user } = await getAppleIdTokenWithNonce(nonce);

    const fromToken = getFallbackNameFromIdToken(idToken);
    const first_name = user?.name?.firstName || fromToken.first_name || "";
    const last_name = user?.name?.lastName || fromToken.last_name || "";

    const { access_token, refresh_token, expires_in } = await oauthApple({
      id_token: idToken,
      nonce_id,
      first_name,
      last_name,
    });

    doSessionLogin(access_token, refresh_token, expires_in);
  }, [doSessionLogin]);

  /**
   * On mount: If tokens are in localStorage, schedule a refresh
   * (or refresh immediately if near expiry).
   */
  useEffect(() => {
    const existingToken = getAccessToken();
    const existingExpiresAt = getExpiresAt();

    if (existingToken && existingExpiresAt) {
      const now = Date.now();
      const timeLeft = existingExpiresAt - now - 30000; // 30s early

      if (timeLeft > 0) {
        // Schedule a timer
        refreshTimerId.current = setTimeout(() => {
          refreshTokens();
        }, timeLeft);
      } else {
        // Already expired or near expiry => refresh immediately
        refreshTokens();
      }

      setIsAuthenticated(true);
    }

    return () => {
      // Clear any leftover timer
      if (refreshTimerId.current) {
        clearTimeout(refreshTimerId.current);
      }
    };
  }, [refreshTokens]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        login,
        loginWithGoogle,
        loginWithApple,
        logout,
        refresh: refreshTokens,
        register,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}







