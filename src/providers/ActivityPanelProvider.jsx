import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { matchPath, useLocation } from "react-router-dom";
import { useSSEContext } from "@/providers/SSEProvider";
import { useUser } from "@/providers/UserProvider";
import { clampPct, stageLabel } from "@/lib/learningBuildStages";

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

const WIDTH_KEY = "activity_panel_width";

export function ActivityPanelProvider({ children }) {
  const { lastMessage } = useSSEContext();
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
  const [donePathId, setDonePathId] = useState(null);
  const [items, setItems] = useState([]);

  const lastStageRef = useRef("");
  const lastBucketRef = useRef(-1);

  useEffect(() => {
    try {
      window.localStorage.setItem(WIDTH_KEY, String(width));
    } catch {}
  }, [width]);

  const resetForJob = useCallback((jobId) => {
    const id = jobId ? String(jobId) : null;
    setActiveJobId(id);
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
    lastStageRef.current = "";
    lastBucketRef.current = -1;
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
      setItems((prev) =>
        [...(prev || []), {
          id: `created:${jid}:${Date.now()}`,
          title: "Queued",
          content: "Your materials are queued for processing.",
          progress: 0,
        }].slice(-200)
      );
      return;
    }

    if (event === "jobprogress") {
      const stage = String(data.stage ?? job?.stage ?? "");
      const progRaw = typeof data.progress === "number" ? data.progress : job?.progress;
      const progress = clampPct(progRaw);

      const bucket = Math.floor(progress / 5);
      if (String(stage) === lastStageRef.current && bucket === lastBucketRef.current) return;
      lastStageRef.current = String(stage);
      lastBucketRef.current = bucket;

      setItems((prev) =>
        [...(prev || []), {
          id: `progress:${jid}:${Date.now()}`,
          title: stageLabel(stage) || "Working…",
          content: data.message || "",
          progress,
        }].slice(-200)
      );
      return;
    }

    if (event === "jobfailed") {
      setItems((prev) =>
        [...(prev || []), {
          id: `failed:${jid}:${Date.now()}`,
          title: "Generation failed",
          content: data.error || job?.error || "Unknown error",
          progress: clampPct(job?.progress),
        }].slice(-200)
      );
      setOpen(true);
      return;
    }

    if (event === "jobdone") {
      const pid = extractPathIdFromJob(job);
      if (pid) setDonePathId(pid);

      setItems((prev) =>
        [...(prev || []), {
          id: `done:${jid}:${Date.now()}`,
          title: "Done",
          content: "Finalizing…",
          progress: 100,
        }].slice(-200)
      );
    }
  }, [lastMessage, user?.id, activeJobId]);

  const value = useMemo(
    () => ({
      open,
      setOpen,
      width,
      setWidth,
      activeJobId,
      setActiveJobId: resetForJob,
      donePathId,
      items,
      openForJob,
    }),
    [open, width, activeJobId, donePathId, items, openForJob, resetForJob]
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









