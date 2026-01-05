import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useUser } from "@/app/providers/UserProvider";
import { useSSEContext } from "@/app/providers/SSEProvider";
import { listUserMaterialFiles } from "@/shared/api/MaterialService";
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

  const [files, setFiles] = useState<MaterialFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown | null>(null);

  const requestSeq = useRef(0);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    if (!isAuthenticated) return;
    const seq = ++requestSeq.current;

    setLoading(true);
    setError(null);
    try {
      const loaded = await listUserMaterialFiles();
      if (requestSeq.current !== seq) return;
      const sorted = (loaded || []).slice().sort(byUpdatedDesc);
      setFiles(sorted);
    } catch (err) {
      if (requestSeq.current !== seq) return;
      setError(err);
      setFiles([]);
    } finally {
      if (requestSeq.current !== seq) return;
      setLoading(false);
    }
  }, [isAuthenticated]);

  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) return;
    reloadTimer.current = setTimeout(() => {
      reloadTimer.current = null;
      void reload();
    }, 250);
  }, [reload]);

  useEffect(() => {
    if (!isAuthenticated) {
      setFiles([]);
      setLoading(false);
      setError(null);
      return;
    }
    void reload();
  }, [isAuthenticated, reload]);

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

  const getById = useCallback(
    (id: string) => files.find((f) => String(f?.id || "") === String(id)) ?? null,
    [files]
  );

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

