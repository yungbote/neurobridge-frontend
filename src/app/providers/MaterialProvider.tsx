import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/app/providers/AuthProvider";
import { useUser } from "@/app/providers/UserProvider";
import { useSSEContext } from "@/app/providers/SSEProvider";
import { listUserMaterialFiles } from "@/shared/api/MaterialService";
import { queryKeys } from "@/shared/query/queryKeys";
import type { JobEventPayload, MaterialFile, SseMessage } from "@/shared/types/models";

interface MaterialContextValue {
  files: MaterialFile[];
  loading: boolean;
  error: unknown | null;
  reload: () => Promise<void>;
  getById: (id: string) => MaterialFile | null;
}

const MaterialContext = createContext<MaterialContextValue>({
  files: [],
  loading: false,
  error: null,
  reload: async () => {},
  getById: () => null,
});

interface MaterialProviderProps {
  children: React.ReactNode;
}

function asJobPayload(value: SseMessage["data"]): JobEventPayload | null {
  if (!value || typeof value !== "object") return null;
  return value as JobEventPayload;
}

function byUpdatedDesc(a: MaterialFile, b: MaterialFile) {
  const ad = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
  const bd = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
  return bd - ad;
}

export function MaterialProvider({ children }: MaterialProviderProps) {
  const { isAuthenticated } = useAuth();
  const { user } = useUser();
  const { connected, lastMessage } = useSSEContext();
  const queryClient = useQueryClient();

  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    if (!isAuthenticated) return;
    await queryClient.refetchQueries({ queryKey: queryKeys.materialFiles(), exact: true });
  }, [isAuthenticated, queryClient]);

  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) return;
    reloadTimer.current = setTimeout(() => {
      reloadTimer.current = null;
      void queryClient.invalidateQueries({ queryKey: queryKeys.materialFiles(), exact: true });
    }, 250);
  }, [queryClient]);

  useEffect(() => {
    if (isAuthenticated) return;
    queryClient.removeQueries({ queryKey: queryKeys.materialFiles() });
  }, [isAuthenticated, queryClient]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!connected) return;
    // SSE has no replay; converge from a durable snapshot after reconnect.
    scheduleReload();
  }, [connected, isAuthenticated, scheduleReload]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!user?.id) return;
    if (!lastMessage) return;
    if (lastMessage.channel !== user.id) return;

    const event = String(lastMessage.event || "").toLowerCase();
    if (event !== "jobcreated" && event !== "jobdone" && event !== "jobfailed") return;

    const payload = asJobPayload(lastMessage.data);
    if (!payload) return;
    const job = payload.job as { job_type?: string; jobType?: string } | undefined;
    const jobType = String(payload.job_type ?? job?.job_type ?? job?.jobType ?? "").toLowerCase();
    if (jobType !== "learning_build") return;

    scheduleReload();
  }, [connected, isAuthenticated, lastMessage, scheduleReload, user?.id]);

  const filesQuery = useQuery({
    queryKey: queryKeys.materialFiles(),
    enabled: isAuthenticated,
    queryFn: listUserMaterialFiles,
    staleTime: 30_000,
    select: (loaded) => (loaded || []).slice().sort(byUpdatedDesc),
  });

  const files = isAuthenticated ? (filesQuery.data ?? []) : [];
  const loading = Boolean(isAuthenticated && filesQuery.isPending);
  const error = isAuthenticated ? filesQuery.error ?? null : null;

  const getById = useCallback((id: string) => files.find((f) => String(f?.id || "") === String(id)) ?? null, [files]);

  const value = useMemo(
    () => ({
      files,
      loading,
      error,
      reload,
      getById,
    }),
    [error, files, getById, loading, reload]
  );

  return <MaterialContext.Provider value={value}>{children}</MaterialContext.Provider>;
}

export function useMaterials() {
  return useContext(MaterialContext);
}
