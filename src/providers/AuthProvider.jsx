import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  loginUser,
  logoutUser,
  refreshToken,
  registerUser,
} from "@/api/AuthService";
import {
  setTokens,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setExpiresAt,
  getExpiresAt,
} from "@/services/StorageService";

// Auth context default shape
export const AuthContext = createContext({
  isAuthenticated: false,
  login: async () => {},
  logout: async () => {},
  refresh: async () => {},
  register: async () => {},
});

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(!!getAccessToken());
  const refreshTimerId = useRef(null);

  const clearSession = useCallback(() => {
    clearTokens();
    if (refreshTimerId.current) {
      clearTimeout(refreshTimerId.current);
      refreshTimerId.current = null;
    }
    setIsAuthenticated(false);
  }, []);

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
    (accessToken, newRefreshToken, expiresIn) => {
      setTokens(accessToken, newRefreshToken);
      const expiresAt = Date.now() + expiresIn * 1000;
      setExpiresAt(expiresAt);
      setIsAuthenticated(true);

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
    [refreshTokens]
  );

  const login = useCallback(
    async (email, password) => {
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
    async (
      email,
      password,
      first_name,
      last_name,
      new_company_name,
      new_wms_name,
      company_id,
      wms_id
    ) => {
      await registerUser({
        email,
        password,
        first_name,
        last_name,
        new_company_name,
        new_wms_name,
        company_id,
        wms_id,
      });
    },
    []
  );

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
      value={{ isAuthenticated, login, logout, refresh: refreshTokens, register }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
