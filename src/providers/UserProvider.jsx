import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { useSSEContext } from "@/providers/SSEProvider";
import { getMe } from "@/api/UserService";

const UserContext = createContext({
  user: null,
  loading: false,
  error: null,
  reload: async () => {}
});

export function UserProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const { lastMessage } = useSSEContext();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadUser = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { user } = await getMe();
      setUser(user);
    } catch (err) {
      console.error("[UserProvider] Failed to load user:", err);
      setError(err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setUser(null);
      setLoading(false);
      setError(null);
      return;
    }
    loadUser();
  }, [isAuthenticated, loadUser]);

  useEffect(() => {
    if (!lastMessage) return;
    setUser((prev) => {
      if (!prev) return prev;
      if (lastMessage.channel != prev.id) return prev;
      const { event, data } = lastMessage;
      switch (event) {
        case "USERNAMECHANGED": {
          if (!data) return prev;
          return {
            ...prev,
            firstName: data.first_name ?? prev.firstName,
            lastName: data.last_name ?? prev.lastName,
          };
        }
        case "USERAVATARCHANGED": {
          if (!data) return prev;
          return {
            ...prev,
            avatarUrl: data.avatar_url ?? prev.avatarUrl,
          };
        }
        default:
          return prev;
      }
    });
  }, [lastMessage]);

  const value = {
    user,
    loading,
    error,
    reload: loadUser
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext);
}










