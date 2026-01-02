import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { matchPath, useLocation } from "react-router-dom";
import { useSSEContext } from "@/app/providers/SSEProvider";
import { useUser } from "@/app/providers/UserProvider";
import { getJob as apiGetJob } from "@/shared/api/JobService";
import { clampPct, learningBuildStageOrder, normalizeStage, stageLabel } from "@/shared/lib/learningBuildStages";
import type { BackendJob, BackendJobStageSnapshot } from "@/shared/types/backend";
import type { JobEventPayload, SseMessage } from "@/shared/types/models";

interface ActivityPanelItem {
  id: string;
  title: string;
  content: string;
  progress?: number;
}

interface ActivityPanelContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  width: number;
  setWidth: (width: number) => void;
  activeJobId: string | null;
  activeJob: BackendJob | null;
  activeJobStatus: string;
  activeJobMessage: string;
  setActiveJobId: (jobId: string | null) => void;
  donePathId: string | null;
  items: ActivityPanelItem[];
  openForJob: (jobId: string) => void;
}

const ActivityPanelContext = createContext<ActivityPanelContextValue | null>(null);

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

function extractPathIdFromJob(job: BackendJob | null | undefined) {
  if (!job) return null;
  const obj = safeParseJSON(job.result ?? job.Result);
  const id = obj?.path_id ?? obj?.pathId ?? null;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function isTerminalJobStatus(status?: string | null) {
  const s = String(status || "").toLowerCase();
  return s === "succeeded" || s === "failed" || s === "canceled";
}

function buildLearningBuildItems(job: BackendJob, message?: string | null): ActivityPanelItem[] {
  const jid = String(job?.id || "");
  const status = String(job?.status || "").toLowerCase();
  const rawStage = String(job?.stage || "");
  const stage = normalizeStage(rawStage);
  const progress = clampPct(job?.progress);
  const errMsg = String(job?.error || "").trim();

  const runningTitle = stageLabel(rawStage) || stageLabel(stage) || "Generating path…";
  const title =
    status === "succeeded"
      ? "Path ready"
      : status === "failed"
        ? "Generation failed"
        : status === "canceled"
          ? "Generation canceled"
          : runningTitle;

  const content =
    status === "failed"
      ? errMsg || "Unknown error"
      : status === "canceled"
        ? "Generation paused. You can regenerate or keep chatting."
        : status === "succeeded"
          ? "Done"
          : String(message || "").trim() ||
            "We’re analyzing your materials and building a learning path.";

  const summaryItem: ActivityPanelItem = {
    id: `summary:${jid}`,
    title,
    content,
    progress: typeof progress === "number" ? progress : 0,
  };
  const items: ActivityPanelItem[] = [];

  const obj = safeParseJSON(job?.result ?? job?.Result);
  const stages =
    obj && typeof obj === "object" && !Array.isArray(obj)
      ? ((obj as { stages?: Record<string, BackendJobStageSnapshot> }).stages ?? null)
      : null;

  for (const stageName of learningBuildStageOrder) {
    const ss =
      stages?.[stageName] ??
      stages?.[`stale_${stageName}`] ??
      stages?.[`timeout_${stageName}`] ??
      stages?.[`waiting_child_${stageName}`] ??
      null;
    const ssStatus = String(ss?.status || "").toLowerCase();
    const childStatus = String(ss?.child_job_status || "").toLowerCase();
    const childMessage = String(ss?.child_message ?? "").trim();
    const childProgressRaw = ss?.child_progress;
    const childProgress =
      typeof childProgressRaw === "number" ? childProgressRaw : Number(childProgressRaw);
    const hasChildProgress = Number.isFinite(childProgress);
    const isCurrent = stage && String(stage).toLowerCase() === String(stageName).toLowerCase();

    if (!ss) continue;
    const startedAt = ss?.started_at ?? null;
    const finishedAt = ss?.finished_at ?? null;
    const hasChild = Boolean(ss?.child_job_id ?? "");
    const hasStarted = Boolean(startedAt || finishedAt || hasChild);
    // Progressive disclosure: don't render stages that haven't actually started yet.
    if (!hasStarted && !isCurrent) continue;
    if (ssStatus === "pending" && !(status === "canceled" && isCurrent)) continue;

    let stageContent = "";
    if (ssStatus === "succeeded") stageContent = "Completed";
    else if (ssStatus === "failed") stageContent = ss?.last_error ? String(ss.last_error) : "Failed";
    else if (ssStatus === "stale") stageContent = "Stalled";
    else if (ssStatus === "timeout") stageContent = "Timed out";
    else if (status === "canceled" && isCurrent) stageContent = "Canceled";
    else if (ssStatus === "waiting_child") {
      stageContent = childMessage || (childStatus ? `Running (${childStatus})` : "Running…");
    }
    else if (isCurrent && !isTerminalJobStatus(status)) stageContent = "In progress…";

    const item: ActivityPanelItem = {
      id: `stage:${jid}:${stageName}`,
      title: stageLabel(stageName) || stageName,
      content: stageContent,
    };
    if (ssStatus === "waiting_child" && hasChildProgress) {
      item.progress = clampPct(childProgress);
    }
    items.push(item);
  }

  items.push(summaryItem);
  return items;
}

const WIDTH_KEY = "activity_panel_width";

function asJobPayload(value: SseMessage["data"]): JobEventPayload | null {
  if (!value || typeof value !== "object") return null;
  return value as JobEventPayload;
}

interface ActivityPanelProviderProps {
  children: React.ReactNode;
}

export function ActivityPanelProvider({ children }: ActivityPanelProviderProps) {
  const { lastMessage, connected } = useSSEContext();
  const { user } = useUser();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(() => {
    try {
      const v = Number(window.localStorage.getItem(WIDTH_KEY));
      return Number.isFinite(v) ? Math.min(Math.max(v, 280), 600) : 380;
    } catch {
      return 380;
    }
  });

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<BackendJob | null>(null);
  const [activeJobMessage, setActiveJobMessage] = useState("");
  const [donePathId, setDonePathId] = useState<string | null>(null);
  const [items, setItems] = useState<ActivityPanelItem[]>([]);

  useEffect(() => {
    try {
      window.localStorage.setItem(WIDTH_KEY, String(width));
    } catch (err) {
      void err;
    }
  }, [width]);

  const resetForJob = useCallback((jobId: string | null) => {
    const id = jobId ? String(jobId) : null;
    setActiveJobId(id);
    setActiveJob(null);
    setActiveJobMessage("");
    setDonePathId(null);
    setItems(
      id
        ? [
            {
              id: `init:${id}`,
              title: "Generating path…",
              content: "We’re analyzing your materials and building a learning path.",
              progress: 0,
            },
          ]
        : []
    );
  }, []);

  useEffect(() => {
    const m = matchPath({ path: "/paths/build/:jobId", end: false }, location.pathname);
    const jid = m?.params?.jobId ? String(m.params.jobId) : null;
    if (jid && jid !== String(activeJobId || "")) {
      resetForJob(jid);
    }
  }, [location.pathname, activeJobId, resetForJob]);

  const openForJob = useCallback(
    (jobId: string) => {
      if (!jobId) return;
      const id = String(jobId);
      if (id !== String(activeJobId || "")) resetForJob(id);
      setOpen(true);
    },
    [activeJobId, resetForJob]
  );

  const applyLearningBuildSnapshot = useCallback((job: BackendJob, message?: string | null) => {
    if (!job) return;
    setActiveJob(job);
    const msg = typeof message === "string" && message.trim()
      ? message
      : typeof job?.message === "string" && job.message.trim()
        ? job.message
        : "";
    setActiveJobMessage(msg);

    setItems(buildLearningBuildItems(job, msg));

    const status = String(job?.status || "").toLowerCase();
    if (status === "succeeded") {
      const pid = extractPathIdFromJob(job);
      if (pid) setDonePathId(pid);
    }
  }, []);

  // Converge job state once on mount/selection (SSE has no replay).
  useEffect(() => {
    if (!activeJobId) return;
    let cancelled = false;
    (async () => {
      try {
        const job = await apiGetJob(activeJobId);
        if (!cancelled && job) applyLearningBuildSnapshot(job, job?.message);
      } catch (err) {
        console.warn("[ActivityPanelProvider] Load job snapshot failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeJobId, applyLearningBuildSnapshot]);

  // Converge once on SSE reconnect (missed messages are not replayed).
  useEffect(() => {
    if (!connected) return;
    if (!activeJobId) return;
    let cancelled = false;
    (async () => {
      try {
        const job = await apiGetJob(activeJobId);
        if (!cancelled && job) applyLearningBuildSnapshot(job, job?.message);
      } catch (err) {
        console.warn("[ActivityPanelProvider] Reconnect snapshot failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connected, activeJobId, applyLearningBuildSnapshot]);

  useEffect(() => {
    if (!lastMessage) return;
    if (!user?.id) return;
    if (lastMessage.channel !== user.id) return;
    if (!activeJobId) return;

    const event = String(lastMessage.event || "").toLowerCase();
    const payload = asJobPayload(lastMessage.data);
    if (!payload) return;
    const job = payload.job as BackendJob | undefined;

    const jobType = String(
      payload.job_type ?? job?.job_type ?? ""
    ).toLowerCase();

    const jid = String(payload.job_id ?? job?.id ?? "");

    if (jobType !== "learning_build") return;
    if (jid !== String(activeJobId)) return;

    if (event === "jobcreated") {
      if (job) applyLearningBuildSnapshot(job, "Queued");
      return;
    }

    if (event === "jobprogress") {
      if (job) applyLearningBuildSnapshot(job, payload.message || activeJobMessage);
      return;
    }

    if (event === "jobfailed") {
      if (job) applyLearningBuildSnapshot(job, payload.error || job?.error || "Unknown error");
      setOpen(true);
      return;
    }

    if (event === "jobdone") {
      if (job) applyLearningBuildSnapshot(job, "Done");
      return;
    }

    if (event === "jobcanceled") {
      if (job) applyLearningBuildSnapshot(job, "Canceled");
      setOpen(true);
      return;
    }

    if (event === "jobrestarted") {
      if (job) applyLearningBuildSnapshot(job, "Restarting…");
      return;
    }
  }, [lastMessage, user?.id, activeJobId, activeJobMessage, applyLearningBuildSnapshot]);

  const value = useMemo(
    () => ({
      open,
      setOpen,
      width,
      setWidth,
      activeJobId,
      activeJob,
      activeJobStatus: String(activeJob?.status || "").toLowerCase(),
      activeJobMessage,
      setActiveJobId: resetForJob,
      donePathId,
      items,
      openForJob,
    }),
    [open, width, activeJobId, activeJob, activeJobMessage, donePathId, items, openForJob, resetForJob]
  );

  return (
    <ActivityPanelContext.Provider value={value}>
      {children}
    </ActivityPanelContext.Provider>
  );
}

export function useActivityPanel() {
  const ctx = useContext(ActivityPanelContext);
  if (!ctx) throw new Error("useActivityPanel must be used within ActivityPanelProvider");
  return ctx;
}
