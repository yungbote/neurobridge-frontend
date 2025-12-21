import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { useSSEContext } from "@/providers/SSEProvider";
import {
  getMe,
  changeName as apiChangeName,
  changeTheme as apiChangeTheme,
  changeAvatarColor as apiChangeAvatarColor,
  uploadAvatar as apiUploadAvatar,
} from "@/api/UserService";

const UserContext = createContext({
  user: null,
  loading: false,
  error: null,
  reload: async () => {},
  changeName: async () => {},
  changeTheme: async () => {},
  changeAvatarColor: async () => {},
  uploadAvatar: async () => {},
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
      if (lastMessage.channel !== prev.id) return prev;

      const { event, data } = lastMessage;

      switch (event) {
        case "UserNameChanged": {
          if (!data) return prev;
          return {
            ...prev,
            firstName: data.first_name ?? prev.firstName,
            lastName: data.last_name ?? prev.lastName,
            avatarUrl: data.avatar_url ?? prev.avatarUrl,         // IMPORTANT
          };
        }

        case "UserThemeChanged": {
          if (!data) return prev;
          return {
            ...prev,
            preferredTheme: data.preferred_theme ?? prev.preferredTheme,
          };
        }

        case "UserAvatarChanged": {
          if (!data) return prev;
          return {
            ...prev,
            avatarUrl: data.avatar_url ?? prev.avatarUrl,
            avatarColor: data.avatar_color ?? prev.avatarColor,
          };
        }

        default:
          return prev;
      }
    });
  }, [lastMessage]);

  const changeName = useCallback(async (data) => {
    await apiChangeName(data);
  }, []);

  const changeTheme = useCallback(async (preferred_theme) => {
    setUser((prev) => (prev ? { ...prev, preferredTheme: preferred_theme } : prev));
    await apiChangeTheme({ preferred_theme });
  }, []);

  const changeAvatarColor = useCallback(async (avatar_color) => {
    setUser((prev) => (prev ? { ...prev, avatarColor: avatar_color } : prev));
    await apiChangeAvatarColor({ avatar_color });
  }, []);

  const uploadAvatar = useCallback(async (file) => {
    await apiUploadAvatar(file);
  }, []);

  const value = {
    user,
    loading,
    error,
    reload: loadUser,
    changeName,
    changeTheme,
    changeAvatarColor,
    uploadAvatar,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext);
}










