import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { useUser } from "@/app/providers/UserProvider";
import { useSSEContext } from "@/app/providers/SSEProvider";
import { uploadMaterialSet as apiUploadMaterialSet } from "@/shared/api/MaterialService";
import { getPath as apiGetPath, listPaths as apiListPaths } from "@/shared/api/PathService";
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
  reload: () => Promise<void>;
  getById: (id: string) => Path | null;
  uploadMaterialSet: (files: File[]) => Promise<BackendMaterialUploadResponse>;
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

  const out = list.slice();
  out[idx] = replace ? next : { ...out[idx], ...next };
  return out;
}

function stripJobFields(path: Path): Path {
  // eslint-disable-next-line no-unused-vars
  const { jobType, jobStatus, jobStage, jobProgress, jobMessage, ...rest } = path;
  return rest;
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

export function PathProvider({ children }: PathProviderProps) {
  const { isAuthenticated } = useAuth();
  const { user } = useUser();
  const { lastMessage, connected } = useSSEContext();

  const [paths, setPaths] = useState<Path[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const [activePathId, setActivePathIdState] = useState<string | null>(null);
  const [activePathOverride, setActivePathOverride] = useState<Path | null>(null);

  const loadPaths = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      setLoading(true);
      setError(null);

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
      setPaths((prev) => {
        const pending = (prev || []).filter((p) => String(p?.id || "").startsWith("job:"));
        return [...pending, ...normalized];
      });
    } catch (err) {
      console.error("[PathProvider] Failed to load paths:", err);
      setError(err);
      setPaths((prev) => (prev || []).filter((p) => String(p?.id || "").startsWith("job:")));
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setPaths([]);
      setLoading(false);
      setError(null);
      setActivePathIdState(null);
      setActivePathOverride(null);
      return;
    }
    loadPaths();
  }, [isAuthenticated, loadPaths]);

  // Converge from a durable snapshot when SSE reconnects (SSE has no replay).
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!connected) return;
    loadPaths();
  }, [connected, isAuthenticated, loadPaths]);

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

    if (!jobId || jobType !== "learning_build") return;

    if (event === "jobcreated") {
      setPaths((prev) => {
        const exists = (prev || []).some((p) => p?.jobId === jobId);
        if (exists) return prev;

        const placeholderId = pathIdFromEvent ? String(pathIdFromEvent) : `job:${jobId}`;
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

        return [placeholder, ...(prev || [])];
      });
      return;
    }

    if (event === "jobprogress") {
      setPaths((prev) => {
        const existing =
          (prev || []).find((p) => p?.jobId === jobId) ||
          (prev || []).find((p) => p?.id === `job:${jobId}`) ||
          (pathIdFromEvent
            ? (prev || []).find((p) => String(p?.id || "") === String(pathIdFromEvent))
            : null) ||
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

        return upsertById(prev || [], next);
      });
      return;
    }

    if (event === "jobfailed") {
      setPaths((prev) => {
        const existing =
          (prev || []).find((p) => p?.jobId === jobId) ||
          (prev || []).find((p) => p?.id === `job:${jobId}`) ||
          (pathIdFromEvent
            ? (prev || []).find((p) => String(p?.id || "") === String(pathIdFromEvent))
            : null) ||
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

        return upsertById(prev || [], next);
      });
      return;
    }

    if (event === "jobdone") {
      const pathId = pathIdFromEvent ?? extractPathIdFromJob(job);

      // Optimistically mark placeholder done
      setPaths((prev) => {
        const existing =
          (prev || []).find((p) => p?.jobId === jobId) ||
          (prev || []).find((p) => p?.id === `job:${jobId}`) ||
          null;
        if (!existing) return prev;

        const next = attachJobFields(existing, {
          job,
          status: "succeeded",
          stage: "done",
          progress: 100,
          message: "Path ready",
          jobId,
          jobType,
        });

        return upsertById(prev || [], next, { replace: true });
      });

      (async () => {
        try {
          if (pathId) {
            const fresh = await apiGetPath(pathId);
            if (fresh?.id) {
              setPaths((prev) => {
                const withoutPlaceholder = (prev || []).filter((p) => p?.jobId !== jobId);
                return upsertById(withoutPlaceholder, stripJobFields(fresh), { replace: true });
              });
              return;
            }
          }
        } catch (err) {
          console.warn("[PathProvider] Failed to fetch path after job done:", err);
        }
        loadPaths();
      })();
    }

    if (event === "jobcanceled") {
      setPaths((prev) => {
        const existing =
          (prev || []).find((p) => p?.jobId === jobId) ||
          (prev || []).find((p) => p?.id === `job:${jobId}`) ||
          (pathIdFromEvent
            ? (prev || []).find((p) => String(p?.id || "") === String(pathIdFromEvent))
            : null) ||
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

        return upsertById(prev || [], next);
      });
    }

    if (event === "jobrestarted") {
      setPaths((prev) => {
        const existing =
          (prev || []).find((p) => p?.jobId === jobId) ||
          (prev || []).find((p) => p?.id === `job:${jobId}`) ||
          (pathIdFromEvent
            ? (prev || []).find((p) => String(p?.id || "") === String(pathIdFromEvent))
            : null) ||
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

        return upsertById(prev || [], next);
      });
      return;
    }
  }, [lastMessage, user?.id, loadPaths]);

  const getById = useCallback(
    (id: string) => paths.find((p) => p?.id === id) ?? null,
    [paths]
  );

  const setActivePathId = useCallback(
    (id: string | null) => {
      const next = id ? String(id) : null;
      setActivePathIdState(next);
      if (!next || String(activePathOverride?.id || "") !== next) {
        setActivePathOverride(null);
      }
    },
    [activePathOverride]
  );

  const setActivePath = useCallback((path: Path | null) => {
    if (!path) {
      setActivePathIdState(null);
      setActivePathOverride(null);
      return;
    }
    const nextId = path?.id ? String(path.id) : null;
    if (!nextId) return;
    setActivePathIdState(nextId);
    setActivePathOverride(path);
  }, []);

  const clearActivePath = useCallback(() => {
    setActivePathIdState(null);
    setActivePathOverride(null);
  }, []);

  const uploadMaterialSet = useCallback(
    async (files: File[]) => {
      if (!files || files.length === 0) {
        throw new Error("uploadMaterialSet: no files provided");
      }

      const res = await apiUploadMaterialSet(files);

      const jobId = res?.job_id ?? res?.jobId ?? null;
      const materialSetId = res?.material_set_id ?? res?.materialSetId ?? null;
      const pathId = res?.path_id ?? res?.pathId ?? null;

      if (jobId) {
        setPaths((prev) => {
          const placeholderId = pathId ? String(pathId) : `job:${jobId}`;

          const existing =
            (prev || []).find((p) => p?.jobId === jobId) ||
            (prev || []).find((p) => p?.id === placeholderId) ||
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

          return upsertById(prev || [], next);
        });
      }

      return res;
    },
    []
  );

  const activePath = useMemo(() => {
    if (!activePathId) return null;
    const fromList = (paths || []).find((p) => String(p?.id || "") === String(activePathId));
    return fromList || activePathOverride || null;
  }, [activePathId, activePathOverride, paths]);

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
      reload: loadPaths,
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
      loadPaths,
      getById,
      uploadMaterialSet,
    ]
  );

  return <PathContext.Provider value={value}>{children}</PathContext.Provider>;
}

export function usePaths() {
  return useContext(PathContext);
}

