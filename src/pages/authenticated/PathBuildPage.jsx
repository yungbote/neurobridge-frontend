import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getJob as apiGetJob } from "@/api/JobService";

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

export default function PathBuildPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    (async () => {
      try {
        const job = await apiGetJob(jobId);
        if (cancelled) return;
        const payload = safeParseJSON(job?.payload ?? job?.Payload) || {};
        const threadId = payload.thread_id ?? payload.threadId ?? null;
        if (threadId) {
          navigate(`/chat/threads/${threadId}`, { replace: true, state: { jobId } });
          return;
        }
        setError(new Error("No chat thread found for this build job."));
      } catch (err) {
        if (!cancelled) setError(err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jobId, navigate]);

  if (!jobId) return null;

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 text-sm text-muted-foreground">
        Failed to open build chat.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 text-sm text-muted-foreground">
      Opening build…
    </div>
  );
}

