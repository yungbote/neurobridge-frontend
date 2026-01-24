import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/app/providers/AuthProvider";
import { useUser } from "@/app/providers/UserProvider";
import { useSSEContext } from "@/app/providers/SSEProvider";
import { uploadMaterialSet as apiUploadMaterialSet } from "@/shared/api/MaterialService";
import { getPath as apiGetPath, listPaths as apiListPaths } from "@/shared/api/PathService";
import { getSessionState, patchSessionState } from "@/shared/api/SessionService";
import { normalizeStage } from "@/shared/lib/learningBuildStages";
import { queryKeys } from "@/shared/query/queryKeys";
import type { BackendJob, BackendMaterialUploadResponse } from "@/shared/types/backend";
import type { JobEventPayload, Path, SseMessage } from "@/shared/types/models";

interface PathContextValue {
  paths: Path[];
  loading: boolean;
  error: unknown | null;
  activePathId: string | null;
  activePath: Path | null;
  setActivePathId: (id: string | null) => void;
  setActivePath: (path: Path | null) => void;
  clearActivePath: () => void;
  activatePath: (id: string | null) => Promise<Path | null>;
  reload: () => Promise<void>;
  getById: (id: string) => Path | null;
  uploadMaterialSet: (files: File[], opts?: { prompt?: string }) => Promise<BackendMaterialUploadResponse>;
}

const PathContext = createContext<PathContextValue>({
  paths: [],
  loading: false,
  error: null,
  activePathId: null,
  activePath: null,
  setActivePathId: () => {},
  setActivePath: () => {},
  clearActivePath: () => {},
  activatePath: async () => null,
  reload: async () => {},
  getById: () => null,
  uploadMaterialSet: async () => ({}),
});

type JobLike = BackendJob & {
  jobType?: string | null;
  jobId?: string | null;
  jobStatus?: string | null;
  jobStage?: string | null;
  jobProgress?: number | null;
  jobMessage?: string | null;
};

function upsertById<T extends { id?: string | null }>(
  list: T[],
  next: T,
  opts: { replace?: boolean } = {}
): T[] {
  const replace = Boolean(opts.replace);
  if (!next?.id) return list;

  const idx = list.findIndex((p) => p?.id === next.id);
  if (idx === -1) return [next, ...list];

  if (list[idx] === next) return list;

  const out = list.slice();
  out[idx] = replace ? next : { ...out[idx], ...next };
  return out;
}

function attachJobFields(
  path: Path,
  {
    job,
    stage,
    progress,
    message,
    status,
    jobId,
    jobType,
  }: {
    job?: JobLike | null;
    stage?: string | null;
    progress?: number | null;
    message?: string | null;
    status?: string | null;
    jobId?: string | null;
    jobType?: string | null;
  } = {}
): Path {
  const nextJobId = jobId ?? job?.id ?? path.jobId;
  const nextJobType =
    jobType ?? job?.job_type ?? job?.jobType ?? path.jobType ?? "";

  const nextJobStatus = status ?? job?.status ?? path.jobStatus;
  const nextJobStage = stage ?? job?.stage ?? path.jobStage;
  const nextJobProgress =
    typeof progress === "number"
      ? progress
      : typeof job?.progress === "number"
        ? job.progress
        : path.jobProgress ?? 0;

  const nextJobMessage = message ?? path.jobMessage ?? "";

  return {
    ...path,
    jobId: nextJobId,
    jobType: nextJobType,
    jobStatus: nextJobStatus,
    jobStage: nextJobStage,
    jobProgress: nextJobProgress,
    jobMessage: nextJobMessage,
  };
}

function createPathSkeleton(input: Partial<Path> & Pick<Path, "id" | "title" | "description" | "status">): Path {
  return {
    id: input.id,
    userId: input.userId ?? null,
    parentPathId: input.parentPathId ?? null,
    rootPathId: input.rootPathId ?? null,
    depth: typeof input.depth === "number" ? input.depth : 0,
    sortIndex: typeof input.sortIndex === "number" ? input.sortIndex : 0,
    kind: input.kind ?? "path",
    title: input.title ?? "",
    description: input.description ?? "",
    status: input.status ?? "draft",
    jobId: input.jobId ?? null,
    jobType: input.jobType,
    jobStatus: input.jobStatus ?? null,
    jobStage: input.jobStage ?? null,
    jobProgress: input.jobProgress ?? null,
    jobMessage: input.jobMessage ?? null,
    avatarUrl: input.avatarUrl ?? null,
    avatarSquareUrl: input.avatarSquareUrl ?? null,
    avatarAssetId: input.avatarAssetId ?? null,
    metadata: input.metadata ?? null,
    materialSetId: input.materialSetId ?? null,
    createdAt: input.createdAt ?? null,
    updatedAt: input.updatedAt ?? null,
  };
}

function safeParseJSON(v: unknown): Record<string, unknown> | null {
  if (!v) return null;
  if (typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

function extractPathIdFromJob(job: JobLike | null | undefined) {
  if (!job) return null;
  const obj = safeParseJSON(job.result ?? job.Result);
  const id = obj?.path_id ?? obj?.pathId ?? null;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function asJobPayload(value: SseMessage["data"]): JobEventPayload | null {
  if (!value || typeof value !== "object") return null;
  return value as JobEventPayload;
}

interface PathProviderProps {
  children: React.ReactNode;
}

type UploadMaterialSetArgs = { files: File[]; prompt?: string };

export function PathProvider({ children }: PathProviderProps) {
  const { isAuthenticated } = useAuth();
  const { user } = useUser();
  const { lastMessage, connected } = useSSEContext();
  const queryClient = useQueryClient();

  const [activePathId, setActivePathIdState] = useState<string | null>(null);
  const restoredActivePathRef = useRef(false);
  const lastJobStageRef = useRef<Map<string, string>>(new Map());

  const pathsQuery = useQuery({
    queryKey: queryKeys.paths(),
    enabled: isAuthenticated,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const data = query.state.data ?? [];
      let hasFastPending = false;
      let hasSlowPending = false;
      for (const p of data) {
        const id = String(p?.id || "");
        if (id.startsWith("job:")) {
          hasFastPending = true;
          break;
        }
        const jobId = String(p?.jobId || "");
        if (!jobId) continue;
        const jobStatus = String(p?.jobStatus || "").toLowerCase();
        if (jobStatus === "queued" || jobStatus === "running") {
          hasFastPending = true;
          break;
        }
        if (jobStatus === "waiting_user") {
          hasSlowPending = true;
        }
      }
      if (hasFastPending) return 5_000;
      if (hasSlowPending) return 15_000;
      return false;
    },
    queryFn: async () => {
      const loaded = await apiListPaths();
      const normalized = (Array.isArray(loaded) ? loaded : []).map((p) => {
        if (!p?.jobId) return p;
        return attachJobFields(p, {
          jobId: p.jobId,
          jobType: "learning_build",
          status: p?.jobStatus ?? "queued",
          stage: p?.jobStage ?? "queued",
          progress: typeof p?.jobProgress === "number" ? p.jobProgress : 0,
        });
      });

      const prev = queryClient.getQueryData<Path[]>(queryKeys.paths()) ?? [];
      const pending = (prev || []).filter((p) => String(p?.id || "").startsWith("job:"));
      return [...pending, ...normalized];
    },
  });

  const paths = isAuthenticated ? (pathsQuery.data ?? []) : [];
  const loading = Boolean(isAuthenticated && pathsQuery.isPending);
  const error = isAuthenticated ? pathsQuery.error ?? null : null;

  // Restore active path for this session (best-effort; doesn't navigate).
  useEffect(() => {
    if (!isAuthenticated) return;
    if (restoredActivePathRef.current) return;
    restoredActivePathRef.current = true;

    let mounted = true;
    (async () => {
      try {
        const state = await getSessionState();
        if (!mounted) return;
        const pathId = state?.activePathId ? String(state.activePathId) : null;
        if (!pathId) return;
        setActivePathIdState((prev) => (prev ? prev : pathId));
        void queryClient.prefetchQuery({
          queryKey: queryKeys.path(pathId),
          queryFn: () => apiGetPath(pathId),
          staleTime: 60_000,
        });
      } catch {
        // ignore restore errors
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isAuthenticated]);

  // Converge from a durable snapshot when SSE reconnects (SSE has no replay).
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!connected) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.paths(), exact: true });
  }, [connected, isAuthenticated, queryClient]);

  useEffect(() => {
    if (isAuthenticated) return;
    setActivePathIdState(null);
    restoredActivePathRef.current = false;
    lastJobStageRef.current.clear();
    queryClient.removeQueries({ queryKey: queryKeys.paths() });
  }, [isAuthenticated, queryClient]);

  useEffect(() => {
    if (!lastMessage) return;
    if (!user?.id) return;
    if (lastMessage.channel !== user.id) return;

    const event = String(lastMessage.event || "").toLowerCase();
    const payload = asJobPayload(lastMessage.data);
    if (!payload) return;
    const job = payload.job as JobLike | undefined;
    const jobType = String(
      payload.job_type ?? job?.job_type ?? job?.jobType ?? ""
    ).toLowerCase();
    const jobId = payload.job_id ?? job?.id ?? null;
    const pathIdFromEvent = payload.path_id ?? payload.pathId ?? null;

    if (!jobId) return;

    // Node avatars are generated in a follow-up job after the path build completes.
    // Refresh the node list when that job finishes so avatars appear without a manual reload.
    if (jobType === "node_avatar_render") {
      if (event !== "jobdone" && event !== "jobfailed") return;
      const pid = pathIdFromEvent ?? extractPathIdFromJob(job);
      if (!pid) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.pathNodes(String(pid)), exact: true });
      return;
    }

    if (jobType !== "learning_build") return;

    if (event === "jobcreated") {
      queryClient.setQueryData<Path[]>(queryKeys.paths(), (prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const exists = list.some((p) => p?.jobId === jobId);
        if (exists) return list;

        const placeholderId = pathIdFromEvent ? String(pathIdFromEvent) : `job:${jobId}`;
        const existingById = list.find((p) => String(p?.id || "") === placeholderId) ?? null;
        const placeholder = attachJobFields(
          createPathSkeleton({
            id: placeholderId,
            userId: user?.id ?? null,
            title: "Generating path…",
            description: "We’re analyzing your materials and building a learning path.",
            status: "draft",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
          { job, jobId, jobType, status: job?.status ?? "queued", stage: job?.stage ?? "queued" }
        );

        if (existingById) {
          return upsertById(list, attachJobFields(existingById, { job, jobId, jobType, status: job?.status ?? "queued", stage: job?.stage ?? "queued" }));
        }
        return [placeholder, ...list];
      });
      return;
    }

    if (event === "jobprogress") {
      const nextStage = normalizeStage(String(payload.stage ?? job?.stage ?? "")).toLowerCase();
      const prevStage = lastJobStageRef.current.get(String(jobId)) ?? "";
      if (nextStage && nextStage !== prevStage) {
        lastJobStageRef.current.set(String(jobId), nextStage);
        const pid = pathIdFromEvent ?? extractPathIdFromJob(job);
        if (pid) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.pathNodes(String(pid)),
            exact: true,
          });
        }
      }

      queryClient.setQueryData<Path[]>(queryKeys.paths(), (prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const existing =
          list.find((p) => p?.jobId === jobId) ||
          list.find((p) => p?.id === `job:${jobId}`) ||
          (pathIdFromEvent ? list.find((p) => String(p?.id || "") === String(pathIdFromEvent)) : null) ||
          null;

        const base =
          existing ??
          createPathSkeleton({
            id: `job:${jobId}`,
            userId: user?.id ?? null,
            title: "Generating path…",
            description: "We’re analyzing your materials and building a learning path.",
            status: "draft",
          });

        const next = attachJobFields(base, {
          job,
          status: job?.status ?? "running",
          stage: payload.stage ?? job?.stage,
          progress: typeof payload.progress === "number" ? payload.progress : job?.progress,
          message: payload.message,
          jobId,
          jobType,
        });

        return upsertById(list, next);
      });
      return;
    }

    if (event === "jobfailed") {
      lastJobStageRef.current.delete(String(jobId));
      queryClient.setQueryData<Path[]>(queryKeys.paths(), (prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const existing =
          list.find((p) => p?.jobId === jobId) ||
          list.find((p) => p?.id === `job:${jobId}`) ||
          (pathIdFromEvent ? list.find((p) => String(p?.id || "") === String(pathIdFromEvent)) : null) ||
          null;

        const base =
          existing ??
          createPathSkeleton({
            id: `job:${jobId}`,
            userId: user?.id ?? null,
            title: "Path generation failed",
            description: "",
            status: "draft",
          });

        const next = attachJobFields(base, {
          job,
          status: "failed",
          stage: payload.stage ?? job?.stage,
          progress: typeof payload.progress === "number" ? payload.progress : job?.progress,
          message: payload.error || "Generation failed",
          jobId,
          jobType,
        });

        return upsertById(list, next);
      });
      return;
    }

    if (event === "jobdone") {
      lastJobStageRef.current.delete(String(jobId));
      const pathId = pathIdFromEvent ?? extractPathIdFromJob(job);

      // Optimistically mark placeholder done
      queryClient.setQueryData<Path[]>(queryKeys.paths(), (prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const existing = list.find((p) => p?.jobId === jobId) || list.find((p) => p?.id === `job:${jobId}`) || null;
        if (!existing) return list;

        const next = attachJobFields(existing, {
          job,
          status: "succeeded",
          stage: "done",
          progress: 100,
          message: "Path ready",
          jobId,
          jobType,
        });

        return upsertById(list, next, { replace: true });
      });

      void (async () => {
        try {
          if (pathId) {
            const fresh = await queryClient.fetchQuery({
              queryKey: queryKeys.path(String(pathId)),
              queryFn: () => apiGetPath(String(pathId)),
              staleTime: 60_000,
            });

            if (fresh?.id) {
              queryClient.setQueryData<Path[]>(queryKeys.paths(), (prev) => {
                const list = Array.isArray(prev) ? prev : [];
                const withoutPlaceholder = list.filter((p) => p?.jobId !== jobId);
                return upsertById(withoutPlaceholder, fresh, { replace: true });
              });
              void queryClient.invalidateQueries({
                queryKey: queryKeys.pathNodes(String(fresh.id)),
                exact: true,
              });
              return;
            }
          }
        } catch (err) {
          console.warn("[PathProvider] Failed to fetch path after job done:", err);
        }
        void queryClient.invalidateQueries({ queryKey: queryKeys.paths(), exact: true });
      })();
    }

    if (event === "jobcanceled") {
      lastJobStageRef.current.delete(String(jobId));
      queryClient.setQueryData<Path[]>(queryKeys.paths(), (prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const existing =
          list.find((p) => p?.jobId === jobId) ||
          list.find((p) => p?.id === `job:${jobId}`) ||
          (pathIdFromEvent ? list.find((p) => String(p?.id || "") === String(pathIdFromEvent)) : null) ||
          null;

        const base =
          existing ??
          createPathSkeleton({
            id: pathIdFromEvent ? String(pathIdFromEvent) : `job:${jobId}`,
            userId: user?.id ?? null,
            title: "Path generation canceled",
            description: "",
            status: "draft",
          });

        const next = attachJobFields(base, {
          job,
          status: "canceled",
          stage: payload.stage ?? job?.stage,
          progress: typeof payload.progress === "number" ? payload.progress : job?.progress,
          message: payload.message || "Canceled",
          jobId,
          jobType,
        });

        return upsertById(list, next);
      });
    }

    if (event === "jobrestarted") {
      lastJobStageRef.current.delete(String(jobId));
      queryClient.setQueryData<Path[]>(queryKeys.paths(), (prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const existing =
          list.find((p) => p?.jobId === jobId) ||
          list.find((p) => p?.id === `job:${jobId}`) ||
          (pathIdFromEvent ? list.find((p) => String(p?.id || "") === String(pathIdFromEvent)) : null) ||
          null;

        const base =
          existing ??
          createPathSkeleton({
            id: pathIdFromEvent ? String(pathIdFromEvent) : `job:${jobId}`,
            userId: user?.id ?? null,
            title: "Generating path…",
            description: "We’re analyzing your materials and building a learning path.",
            status: "draft",
          });

        const next = attachJobFields(base, {
          job,
          status: job?.status ?? "queued",
          stage: job?.stage ?? "queued",
          progress: typeof job?.progress === "number" ? job.progress : 0,
          message: payload.message || "Restarting…",
          jobId,
          jobType,
        });

        return upsertById(list, next);
      });
      return;
    }
  }, [lastMessage, queryClient, user?.id]);

  const getById = useCallback(
    (id: string) => paths.find((p) => p?.id === id) ?? null,
    [paths]
  );

  const setActivePathId = useCallback(
    (id: string | null) => {
      const next = id ? String(id) : null;
      setActivePathIdState(next);
      if (isAuthenticated) {
        void patchSessionState({ active_path_id: next }).catch((err) => {
          console.warn("[PathProvider] Failed to patch session state:", err);
        });
      }
    },
    [isAuthenticated]
  );

  const setActivePath = useCallback((path: Path | null) => {
    if (!path) {
      setActivePathIdState(null);
      if (isAuthenticated) {
        void patchSessionState({ active_path_id: null }).catch((err) => {
          console.warn("[PathProvider] Failed to patch session state:", err);
        });
      }
      return;
    }
    const nextId = path?.id ? String(path.id) : null;
    if (!nextId) return;
    setActivePathIdState(nextId);
    queryClient.setQueryData(queryKeys.path(nextId), path);
    queryClient.setQueryData<Path[]>(queryKeys.paths(), (prev) => {
      const list = Array.isArray(prev) ? prev : [];
      return upsertById(list, path);
    });
    if (isAuthenticated) {
      void patchSessionState({ active_path_id: nextId }).catch((err) => {
        console.warn("[PathProvider] Failed to patch session state:", err);
      });
    }
  }, [isAuthenticated, queryClient]);

  const clearActivePath = useCallback(() => {
    setActivePathIdState(null);
    if (isAuthenticated) {
      void patchSessionState({ active_path_id: null }).catch((err) => {
        console.warn("[PathProvider] Failed to patch session state:", err);
      });
    }
  }, [isAuthenticated]);

  const activatePath = useCallback(
    async (id: string | null): Promise<Path | null> => {
      const nextId = id ? String(id) : null;

      setActivePathIdState(nextId);
      if (isAuthenticated) {
        void patchSessionState({ active_path_id: nextId }).catch((err) => {
          console.warn("[PathProvider] Failed to patch session state:", err);
        });
      }
      if (!nextId) return null;

      const cached = getById(nextId);
      if (cached) queryClient.setQueryData(queryKeys.path(nextId), cached);

      try {
        const fresh = await queryClient.fetchQuery({
          queryKey: queryKeys.path(nextId),
          queryFn: () => apiGetPath(nextId),
          staleTime: 60_000,
        });

        if (fresh?.id) {
          queryClient.setQueryData<Path[]>(queryKeys.paths(), (prev) => {
            const list = Array.isArray(prev) ? prev : [];
            return upsertById(list, fresh, { replace: true });
          });
        }
        return fresh;
      } catch (err) {
        console.warn("[PathProvider] Failed to activate path:", err);
        return cached ?? null;
      }
    },
    [getById, isAuthenticated, queryClient]
  );

  const uploadMaterialSetMutation = useMutation({
    mutationFn: async ({ files, prompt }: UploadMaterialSetArgs) => apiUploadMaterialSet(files, { prompt }),
    onSuccess: (res) => {
      const jobId = res?.job_id ?? res?.jobId ?? null;
      const materialSetId = res?.material_set_id ?? res?.materialSetId ?? null;
      const pathId = res?.path_id ?? res?.pathId ?? null;

      if (jobId) {
        queryClient.setQueryData<Path[]>(queryKeys.paths(), (prev) => {
          const list = Array.isArray(prev) ? prev : [];
          const placeholderId = pathId ? String(pathId) : `job:${jobId}`;

          const existing =
            list.find((p) => p?.jobId === jobId) ||
            list.find((p) => p?.id === placeholderId) ||
            null;

          const base =
            existing ??
            createPathSkeleton({
              id: placeholderId,
              userId: user?.id ?? null,
              title: "Generating path…",
              description: "We’re analyzing your materials and building a learning path.",
              status: "draft",
            });

          const next = attachJobFields(
            {
              ...base,
              materialSetId,
              updatedAt: new Date().toISOString(),
            },
            {
              jobId,
              jobType: "learning_build",
              status: "queued",
              stage: "queued",
              progress: 0,
              message: "Uploading materials…",
            }
          );

          return upsertById(list, next);
        });
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.materialFiles(), exact: true });
    },
  });

  const uploadMaterialSet = useCallback(
    async (files: File[], opts?: { prompt?: string }) => {
      const hasFiles = Array.isArray(files) && files.length > 0;
      const prompt = String(opts?.prompt || "").trim();
      if (!hasFiles && !prompt) {
        throw new Error("uploadMaterialSet: provide files or a prompt");
      }
      return uploadMaterialSetMutation.mutateAsync({ files: files || [], prompt });
    },
    [uploadMaterialSetMutation]
  );

  const activePathQuery = useQuery({
    queryKey: queryKeys.path(activePathId ?? ""),
    enabled: isAuthenticated && Boolean(activePathId),
    staleTime: 60_000,
    queryFn: async () => {
      const id = String(activePathId || "");
      if (!id) return null;
      const fresh = await apiGetPath(id);
      if (fresh?.id) {
        queryClient.setQueryData<Path[]>(queryKeys.paths(), (prev) => {
          const list = Array.isArray(prev) ? prev : [];
          return upsertById(list, fresh, { replace: true });
        });
      }
      return fresh;
    },
  });

  const activePath = useMemo(() => {
    if (!activePathId) return null;
    const fromList = (paths || []).find((p) => String(p?.id || "") === String(activePathId));
    return fromList || activePathQuery.data || null;
  }, [activePathId, activePathQuery.data, paths]);

  const reload = useCallback(async () => {
    if (!isAuthenticated) return;
    await queryClient.refetchQueries({ queryKey: queryKeys.paths(), exact: true });
  }, [isAuthenticated, queryClient]);

  const value = useMemo(
    () => ({
      paths,
      loading,
      error,
      activePathId,
      activePath,
      setActivePathId,
      setActivePath,
      clearActivePath,
      activatePath,
      reload,
      getById,
      uploadMaterialSet,
    }),
    [
      paths,
      loading,
      error,
      activePathId,
      activePath,
      setActivePathId,
      setActivePath,
      clearActivePath,
      activatePath,
      reload,
      getById,
      uploadMaterialSet,
    ]
  );

  return <PathContext.Provider value={value}>{children}</PathContext.Provider>;
}

export function usePaths() {
  return useContext(PathContext);
}
