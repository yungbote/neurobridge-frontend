import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "@/app/providers/AuthProvider";
import { useSSEContext } from "@/app/providers/SSEProvider";
import {
  getMe,
  changeName as apiChangeName,
  changeTheme as apiChangeTheme,
  changeAvatarColor as apiChangeAvatarColor,
  uploadAvatar as apiUploadAvatar,
} from "@/shared/api/UserService";
import { UI_THEME_SET } from "@/shared/theme/uiThemes";
import type {
  SseMessage,
  ThemePreference,
  UiTheme,
  UserAvatarChangedPayload,
  UserNameChangedPayload,
  UserProfile,
  UserThemeChangedPayload,
} from "@/shared/types/models";

type ChangeNamePayload = Parameters<typeof apiChangeName>[0];

interface UserContextValue {
  user: UserProfile | null;
  loading: boolean;
  error: unknown | null;
  reload: () => Promise<void>;
  changeName: (data: ChangeNamePayload) => Promise<void>;
  changeTheme: (preferredTheme: ThemePreference) => Promise<void>;
  changeUiTheme: (preferredUiTheme: UiTheme) => Promise<void>;
  changeAvatarColor: (color: string) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  loading: false,
  error: null,
  reload: async () => {},
  changeName: async () => {},
  changeTheme: async () => {},
  changeUiTheme: async () => {},
  changeAvatarColor: async () => {},
  uploadAvatar: async () => {},
});

function asObject<T extends object>(value: SseMessage["data"]): T | null {
  if (!value || typeof value !== "object") return null;
  return value as T;
}

interface UserProviderProps {
  children: React.ReactNode;
}

export function UserProvider({ children }: UserProviderProps) {
  const { isAuthenticated } = useAuth();
  const { lastMessage } = useSSEContext();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown | null>(null);

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
          const payload = asObject<UserNameChangedPayload>(data);
          if (!payload) return prev;
          return {
            ...prev,
            firstName: payload.first_name ?? prev.firstName,
            lastName: payload.last_name ?? prev.lastName,
            avatarUrl: payload.avatar_url ?? prev.avatarUrl,         // IMPORTANT
          };
        }

        case "UserThemeChanged": {
          const payload = asObject<UserThemeChangedPayload>(data);
          if (!payload) return prev;
          const nextUiTheme = payload.preferred_ui_theme;
          const resolvedUiTheme = nextUiTheme && UI_THEME_SET.has(nextUiTheme as UiTheme)
            ? (nextUiTheme as UiTheme)
            : prev.preferredUiTheme;
          return {
            ...prev,
            preferredTheme: (payload.preferred_theme ?? prev.preferredTheme) as ThemePreference,
            preferredUiTheme: resolvedUiTheme,
          };
        }

        case "UserAvatarChanged": {
          const payload = asObject<UserAvatarChangedPayload>(data);
          if (!payload) return prev;
          return {
            ...prev,
            avatarUrl: payload.avatar_url ?? prev.avatarUrl,
            avatarColor: payload.avatar_color ?? prev.avatarColor,
          };
        }

        default:
          return prev;
      }
    });
  }, [lastMessage]);

  const changeName = useCallback(async (data: ChangeNamePayload) => {
    await apiChangeName(data);
  }, []);

  const changeTheme = useCallback(async (preferredTheme: ThemePreference) => {
    setUser((prev) => (prev ? { ...prev, preferredTheme } : prev));
    await apiChangeTheme({ preferred_theme: preferredTheme });
  }, []);

  const changeUiTheme = useCallback(async (preferredUiTheme: UiTheme) => {
    setUser((prev) => (prev ? { ...prev, preferredUiTheme } : prev));
    await apiChangeTheme({ preferred_ui_theme: preferredUiTheme });
  }, []);

  const changeAvatarColor = useCallback(async (avatarColor: string) => {
    setUser((prev) => (prev ? { ...prev, avatarColor } : prev));
    await apiChangeAvatarColor({ avatar_color: avatarColor });
  }, []);

  const uploadAvatar = useCallback(async (file: File) => {
    await apiUploadAvatar(file);
  }, []);

  const value = {
    user,
    loading,
    error,
    reload: loadUser,
    changeName,
    changeTheme,
    changeUiTheme,
    changeAvatarColor,
    uploadAvatar,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext);
}






