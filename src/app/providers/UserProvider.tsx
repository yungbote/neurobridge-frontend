import React, { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/app/providers/AuthProvider";
import { useSSEContext } from "@/app/providers/SSEProvider";
import {
  getMe,
  changeName as apiChangeName,
  changeTheme as apiChangeTheme,
  changeAvatarColor as apiChangeAvatarColor,
  uploadAvatar as apiUploadAvatar,
} from "@/shared/api/UserService";
import { queryKeys } from "@/shared/query/queryKeys";
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
  const queryClient = useQueryClient();

  const userQuery = useQuery({
    queryKey: queryKeys.me(),
    enabled: isAuthenticated,
    queryFn: async () => {
      const { user } = await getMe();
      return user;
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!lastMessage) return;

    queryClient.setQueryData<UserProfile | null>(queryKeys.me(), (prev) => {
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
            avatarUrl: payload.avatar_url ?? prev.avatarUrl,
          };
        }

        case "UserThemeChanged": {
          const payload = asObject<UserThemeChangedPayload>(data);
          if (!payload) return prev;
          const nextUiTheme = payload.preferred_ui_theme;
          const resolvedUiTheme =
            nextUiTheme && UI_THEME_SET.has(nextUiTheme as UiTheme)
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
  }, [lastMessage, queryClient]);

  useEffect(() => {
    if (isAuthenticated) return;
    queryClient.removeQueries({ queryKey: queryKeys.me() });
  }, [isAuthenticated, queryClient]);

  const reload = useCallback(async () => {
    if (!isAuthenticated) return;
    await queryClient.refetchQueries({ queryKey: queryKeys.me(), exact: true });
  }, [isAuthenticated, queryClient]);

  const changeNameMutation = useMutation({
    mutationFn: apiChangeName,
    onMutate: async (data: ChangeNamePayload) => {
      const prev = queryClient.getQueryData<UserProfile | null>(queryKeys.me()) ?? null;
      if (!prev) return { prev: null };
      queryClient.setQueryData<UserProfile | null>(queryKeys.me(), {
        ...prev,
        firstName: data.first_name ?? prev.firstName,
        lastName: data.last_name ?? prev.lastName,
      });
      return { prev };
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.me(), ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me(), exact: true });
    },
  });

  const changeThemeMutation = useMutation({
    mutationFn: apiChangeTheme,
    onMutate: async (data: Parameters<typeof apiChangeTheme>[0]) => {
      const prev = queryClient.getQueryData<UserProfile | null>(queryKeys.me()) ?? null;
      if (!prev) return { prev: null };
      const nextUiThemeRaw = typeof data.preferred_ui_theme === "string" ? data.preferred_ui_theme : null;
      const nextUiTheme =
        nextUiThemeRaw && UI_THEME_SET.has(nextUiThemeRaw as UiTheme) ? (nextUiThemeRaw as UiTheme) : null;

      queryClient.setQueryData<UserProfile | null>(queryKeys.me(), {
        ...prev,
        preferredTheme: (data.preferred_theme ?? prev.preferredTheme) as ThemePreference,
        preferredUiTheme: nextUiTheme ?? prev.preferredUiTheme,
      });
      return { prev };
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.me(), ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me(), exact: true });
    },
  });

  const changeAvatarColorMutation = useMutation({
    mutationFn: apiChangeAvatarColor,
    onMutate: async (data: Parameters<typeof apiChangeAvatarColor>[0]) => {
      const prev = queryClient.getQueryData<UserProfile | null>(queryKeys.me()) ?? null;
      if (!prev) return { prev: null };
      const nextColor = typeof data.avatar_color === "string" ? data.avatar_color : null;
      queryClient.setQueryData<UserProfile | null>(queryKeys.me(), {
        ...prev,
        avatarColor: nextColor ?? prev.avatarColor,
      });
      return { prev };
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.me(), ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me(), exact: true });
    },
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: apiUploadAvatar,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me(), exact: true });
    },
  });

  const changeName = useCallback(
    async (data: ChangeNamePayload) => changeNameMutation.mutateAsync(data),
    [changeNameMutation]
  );

  const changeTheme = useCallback(
    async (preferredTheme: ThemePreference) =>
      changeThemeMutation.mutateAsync({ preferred_theme: preferredTheme }),
    [changeThemeMutation]
  );

  const changeUiTheme = useCallback(
    async (preferredUiTheme: UiTheme) =>
      changeThemeMutation.mutateAsync({ preferred_ui_theme: preferredUiTheme }),
    [changeThemeMutation]
  );

  const changeAvatarColor = useCallback(
    async (avatarColor: string) =>
      changeAvatarColorMutation.mutateAsync({ avatar_color: avatarColor }),
    [changeAvatarColorMutation]
  );

  const uploadAvatar = useCallback(
    async (file: File) => uploadAvatarMutation.mutateAsync(file),
    [uploadAvatarMutation]
  );

  const user = isAuthenticated ? (userQuery.data ?? null) : null;
  const loading = Boolean(isAuthenticated && userQuery.isPending);
  const error = isAuthenticated ? userQuery.error ?? null : null;

  const value = useMemo<UserContextValue>(
    () => ({
      user,
      loading,
      error,
      reload,
      changeName,
      changeTheme,
      changeUiTheme,
      changeAvatarColor,
      uploadAvatar,
    }),
    [changeAvatarColor, changeName, changeTheme, changeUiTheme, error, loading, reload, uploadAvatar, user]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext);
}





