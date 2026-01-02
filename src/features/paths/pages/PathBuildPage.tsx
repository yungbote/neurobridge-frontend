import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getJob as apiGetJob } from "@/shared/api/JobService";
import { Container } from "@/shared/layout/Container";
function safeParseJSON(v: unknown): Record<string, unknown> | null {
  if (!v) return null;
  if (typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
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

export default function PathBuildPage() {
  const { jobId } = useParams<{ jobId?: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    (async () => {
      try {
        const job = await apiGetJob(jobId);
        if (cancelled) return;
        const payload = safeParseJSON(job?.payload ?? job?.Payload) || {};
        const threadIdRaw = payload.thread_id ?? payload.threadId ?? null;
        const threadId =
          typeof threadIdRaw === "string" || typeof threadIdRaw === "number"
            ? String(threadIdRaw)
            : null;
        if (threadId) {
          navigate(`/chat/threads/${threadId}`, { replace: true, state: { jobId } });
          return;
        }
        setError(new Error("No chat thread found for this build job."));
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Failed to open build chat.";
          setError(new Error(message));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jobId, navigate]);

  if (!jobId) return null;

  const message = error ? "Failed to open build chat." : "Opening build…";

  return (
    <div className="page-surface">
      <Container size="sm" className="page-pad text-sm text-muted-foreground">
        {message}
      </Container>
    </div>
  );
}
