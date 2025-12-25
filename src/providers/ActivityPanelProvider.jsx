import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { matchPath, useLocation } from "react-router-dom";
import { useSSEContext } from "@/providers/SSEProvider";
import { useUser } from "@/providers/UserProvider";
import { getJob as apiGetJob } from "@/api/JobService";
import { clampPct, learningBuildStageOrder, normalizeStage, stageLabel } from "@/lib/learningBuildStages";

const ActivityPanelContext = createContext(null);

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

function isTerminalJobStatus(status) {
  const s = String(status || "").toLowerCase();
  return s === "succeeded" || s === "failed" || s === "canceled";
}

function buildLearningBuildItems(job, message) {
  const jid = String(job?.id || "");
  const status = String(job?.status || "").toLowerCase();
  const stage = normalizeStage(job?.stage);
  const progress = clampPct(job?.progress);
  const errMsg = String(job?.error || "").trim();

  const runningTitle = stageLabel(stage) || "Generating path…";
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

  const items = [
    {
      id: `summary:${jid}`,
      title,
      content,
      progress: typeof progress === "number" ? progress : 0,
    },
  ];

  const obj = safeParseJSON(job?.result ?? job?.Result);
  const stages =
    obj && typeof obj === "object" && obj.stages && typeof obj.stages === "object"
      ? obj.stages
      : null;

  const jobActive = !isTerminalJobStatus(status);

  for (const stageName of learningBuildStageOrder) {
    const ss = stages?.[stageName] ?? null;
    const ssStatus = String(ss?.status || "").toLowerCase();
    const childStatus = String(ss?.child_job_status || "").toLowerCase();
    const isCurrent = stage && String(stage).toLowerCase() === String(stageName).toLowerCase();

    if (!ss) continue;
    const startedAt = ss?.started_at ?? ss?.startedAt ?? null;
    const finishedAt = ss?.finished_at ?? ss?.finishedAt ?? null;
    const hasChild = Boolean(ss?.child_job_id ?? ss?.childJobId ?? "");
    const hasStarted = Boolean(startedAt || finishedAt || hasChild);
    // Progressive disclosure: don't render stages that haven't actually started yet.
    if (!hasStarted && !isCurrent) continue;
    if (ssStatus === "pending" && !(status === "canceled" && isCurrent)) continue;
    if (jobActive && isCurrent) continue;

    let stageContent = "";
    if (ssStatus === "succeeded") stageContent = "Completed";
    else if (ssStatus === "failed") stageContent = ss?.last_error ? String(ss.last_error) : "Failed";
    else if (status === "canceled" && isCurrent) stageContent = "Canceled";
    else if (ssStatus === "waiting_child") stageContent = childStatus ? `Running (${childStatus})` : "Running…";
    else if (isCurrent && !isTerminalJobStatus(status)) stageContent = "In progress…";

    items.push({
      id: `stage:${jid}:${stageName}`,
      title: stageLabel(stageName) || stageName,
      content: stageContent,
    });
  }

  return items;
}

const WIDTH_KEY = "activity_panel_width";

export function ActivityPanelProvider({ children }) {
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

  const [activeJobId, setActiveJobId] = useState(null);
  const [activeJob, setActiveJob] = useState(null);
  const [activeJobMessage, setActiveJobMessage] = useState("");
  const [donePathId, setDonePathId] = useState(null);
  const [items, setItems] = useState([]);

  useEffect(() => {
    try {
      window.localStorage.setItem(WIDTH_KEY, String(width));
    } catch (err) {
      void err;
    }
  }, [width]);

  const resetForJob = useCallback((jobId) => {
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
    (jobId) => {
      if (!jobId) return;
      const id = String(jobId);
      if (id !== String(activeJobId || "")) resetForJob(id);
      setOpen(true);
    },
    [activeJobId, resetForJob]
  );

  const applyLearningBuildSnapshot = useCallback((job, message) => {
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
    const data = lastMessage.data || {};
    const job = data.job;

    const jobType = String(
      data.job_type ?? job?.job_type ?? job?.jobType ?? ""
    ).toLowerCase();

    const jid = String(data.job_id ?? job?.id ?? "");

    if (jobType !== "learning_build") return;
    if (jid !== String(activeJobId)) return;

    if (event === "jobcreated") {
      if (job) applyLearningBuildSnapshot(job, "Queued");
      return;
    }

    if (event === "jobprogress") {
      if (job) applyLearningBuildSnapshot(job, data.message || activeJobMessage);
      return;
    }

    if (event === "jobfailed") {
      if (job) applyLearningBuildSnapshot(job, data.error || job?.error || "Unknown error");
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
