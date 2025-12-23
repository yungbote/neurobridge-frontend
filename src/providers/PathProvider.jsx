import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "@/providers/AuthProvider";
import { useUser } from "@/providers/UserProvider";
import { useSSEContext } from "@/providers/SSEProvider";
import { uploadMaterialSet as apiUploadMaterialSet } from "@/api/MaterialService";
import { getJob as apiGetJob } from "@/api/JobService";
import { getPath as apiGetPath, listPaths as apiListPaths } from "@/api/PathService";

const PathContext = createContext({
  paths: [],
  loading: false,
  error: null,
  reload: async () => {},
  getById: () => null,
  uploadMaterialSet: async () => {},
});

function upsertById(list, next, opts = {}) {
  const replace = Boolean(opts.replace);
  if (!next?.id) return list;

  const idx = list.findIndex((p) => p?.id === next.id);
  if (idx === -1) return [next, ...list];

  const out = list.slice();
  out[idx] = replace ? next : { ...out[idx], ...next };
  return out;
}

function stripJobFields(path) {
  if (!path) return path;
  // eslint-disable-next-line no-unused-vars
  const { jobId, jobType, jobStatus, jobStage, jobProgress, jobMessage, ...rest } =
    path;
  return rest;
}

function attachJobFields(
  path,
  { job, stage, progress, message, status, jobId, jobType } = {}
) {
  if (!path) return path;

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

function safeParseJSON(v) {
  if (!v) return null;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return null;
}

function extractPathIdFromJob(job) {
  if (!job) return null;
  const obj = safeParseJSON(job.result ?? job.Result);
  const id = obj?.path_id ?? obj?.pathId ?? null;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export function PathProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const { user } = useUser();
  const { lastMessage } = useSSEContext();

  const jobPollersRef = useRef(new Map());

  const [paths, setPaths] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadPaths = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      setLoading(true);
      setError(null);

      const loaded = await apiListPaths();
      setPaths((prev) => {
        const pending = (prev || []).filter((p) => String(p?.id || "").startsWith("job:"));
        return [...pending, ...(Array.isArray(loaded) ? loaded : [])];
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
      return;
    }
    loadPaths();
  }, [isAuthenticated, loadPaths]);

  useEffect(() => {
    if (!lastMessage) return;
    if (!user?.id) return;
    if (lastMessage.channel !== user.id) return;

    const event = String(lastMessage.event || "").toLowerCase();
    const data = lastMessage.data || {};
    const job = data.job;
    const jobType = String(data.job_type ?? job?.job_type ?? job?.jobType ?? "").toLowerCase();
    const jobId = data.job_id ?? job?.id ?? null;

    if (!jobId || jobType !== "learning_build") return;

    if (event === "jobcreated") {
      setPaths((prev) => {
        const exists = (prev || []).some((p) => p?.jobId === jobId);
        if (exists) return prev;

        const placeholder = attachJobFields(
          {
            id: `job:${jobId}`,
            title: "Generating path…",
            description: "We’re analyzing your materials and building a learning path.",
            status: "draft",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
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
          null;

        const base =
          existing ??
          ({
            id: `job:${jobId}`,
            title: "Generating path…",
            description: "We’re analyzing your materials and building a learning path.",
            status: "draft",
          });

        const next = attachJobFields(base, {
          job,
          status: job?.status ?? "running",
          stage: data.stage ?? job?.stage,
          progress: typeof data.progress === "number" ? data.progress : job?.progress,
          message: data.message,
          jobId,
          jobType,
        });

        return upsertById(prev || [], next);
      });
      return;
    }

    if (event === "jobfailed") {
      // Stop any polling fallback for this job; SSE delivered the terminal state.
      const poll = jobPollersRef.current.get(jobId);
      if (poll?.timer) clearTimeout(poll.timer);
      jobPollersRef.current.delete(jobId);

      setPaths((prev) => {
        const existing =
          (prev || []).find((p) => p?.jobId === jobId) ||
          (prev || []).find((p) => p?.id === `job:${jobId}`) ||
          null;

        const base =
          existing ??
          ({
            id: `job:${jobId}`,
            title: "Path generation failed",
            description: "",
            status: "draft",
          });

        const next = attachJobFields(base, {
          job,
          status: "failed",
          stage: data.stage ?? job?.stage,
          progress: typeof data.progress === "number" ? data.progress : job?.progress,
          message: data.error || "Generation failed",
          jobId,
          jobType,
        });

        return upsertById(prev || [], next);
      });
      return;
    }

    if (event === "jobdone") {
      // Stop any polling fallback for this job; SSE delivered the terminal state.
      const poll = jobPollersRef.current.get(jobId);
      if (poll?.timer) clearTimeout(poll.timer);
      jobPollersRef.current.delete(jobId);

      const pathId = extractPathIdFromJob(job);

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
  }, [lastMessage, user?.id, loadPaths]);

  const stopJobPolling = useCallback((jobId) => {
    if (!jobId) return;
    const poll = jobPollersRef.current.get(jobId);
    if (poll?.timer) clearTimeout(poll.timer);
    jobPollersRef.current.delete(jobId);
  }, []);

  const pollJobOnce = useCallback(
    async (jobId) => {
      const poll = jobPollersRef.current.get(jobId);
      if (!poll) return;

      try {
        const job = await apiGetJob(jobId);
        if (!jobPollersRef.current.has(jobId)) return;

        const status = String(job?.status ?? "").toLowerCase();
        const stage = job?.stage ?? null;
        const progress =
          typeof job?.progress === "number" ? job.progress : undefined;
        const errMsg = job?.error ?? null;

        setPaths((prev) => {
          const existing =
            (prev || []).find((p) => p?.jobId === jobId) ||
            (prev || []).find((p) => p?.id === `job:${jobId}`) ||
            null;
          if (!existing) return prev;

          const next = attachJobFields(existing, {
            job,
            status: status || undefined,
            stage,
            progress,
            message: status === "failed" ? errMsg || "Generation failed" : undefined,
            jobId,
            jobType: "learning_build",
          });

          return upsertById(prev || [], next);
        });

        if (status === "succeeded") {
          stopJobPolling(jobId);

          const pathId = extractPathIdFromJob(job);
          if (pathId) {
            try {
              const fresh = await apiGetPath(pathId);
              if (fresh?.id) {
                setPaths((prev) => {
                  const withoutPlaceholder = (prev || []).filter(
                    (p) => p?.jobId !== jobId
                  );
                  return upsertById(withoutPlaceholder, stripJobFields(fresh), {
                    replace: true,
                  });
                });
                return;
              }
            } catch (err) {
              console.warn(
                "[PathProvider] Failed to fetch path after polled job done:",
                err
              );
            }
          }
          loadPaths();
          return;
        }

        if (status === "failed") {
          stopJobPolling(jobId);
          return;
        }
      } catch (err) {
        console.warn("[PathProvider] Job poll failed:", err);
      }

      const nextPoll = jobPollersRef.current.get(jobId);
      if (!nextPoll) return;
      nextPoll.timer = setTimeout(() => pollJobOnce(jobId), 4000);
      jobPollersRef.current.set(jobId, nextPoll);
    },
    [loadPaths, stopJobPolling]
  );

  const startJobPolling = useCallback(
    (jobId) => {
      if (!jobId) return;
      if (jobPollersRef.current.has(jobId)) return;

      jobPollersRef.current.set(jobId, { timer: null });
      pollJobOnce(jobId);
    },
    [pollJobOnce]
  );

  useEffect(() => {
    const active = new Set();
    for (const p of paths || []) {
      const jobId = p?.jobId;
      const jobType = String(p?.jobType || "").toLowerCase();
      const jobStatus = String(p?.jobStatus || "").toLowerCase();
      if (!jobId || jobType !== "learning_build") continue;

      if (jobStatus !== "succeeded" && jobStatus !== "failed") {
        active.add(jobId);
        startJobPolling(jobId);
      }
    }

    // Stop pollers for jobs no longer tracked in state.
    for (const [jobId, poll] of jobPollersRef.current.entries()) {
      if (active.has(jobId)) continue;
      if (poll?.timer) clearTimeout(poll.timer);
      jobPollersRef.current.delete(jobId);
    }
  }, [paths, startJobPolling]);

  useEffect(() => {
    return () => {
      for (const poll of jobPollersRef.current.values()) {
        if (poll?.timer) clearTimeout(poll.timer);
      }
      jobPollersRef.current.clear();
    };
  }, []);

  const getById = useCallback(
    (id) => paths.find((p) => p?.id === id) ?? null,
    [paths]
  );

  const uploadMaterialSet = useCallback(
    async (files) => {
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
            ({
              id: placeholderId,
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

  const value = useMemo(
    () => ({
      paths,
      loading,
      error,
      reload: loadPaths,
      getById,
      uploadMaterialSet,
    }),
    [paths, loading, error, loadPaths, getById, uploadMaterialSet]
  );

  return <PathContext.Provider value={value}>{children}</PathContext.Provider>;
}

export function usePaths() {
  return useContext(PathContext);
}










