import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getJob as apiGetJob } from "@/shared/api/JobService";
import { Container } from "@/shared/layout/Container";
import { Skeleton, SkeletonText } from "@/shared/ui/skeleton";
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

export function PathBuildPageSkeleton({ embedded = false }: { embedded?: boolean } = {}) {
  const body = (
    <div className="space-y-3">
      <Skeleton className="h-5 w-40 rounded-full" />
      <SkeletonText lines={2} className="max-w-sm" />
    </div>
  );

  if (embedded) return <div aria-busy="true">{body}</div>;

  return (
    <div className="page-surface" aria-busy="true">
      <Container size="sm" className="page-pad">
        {body}
      </Container>
    </div>
  );
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

  if (!error) {
    return <PathBuildPageSkeleton />;
  }

  return (
    <div className="page-surface">
      <Container size="sm" className="page-pad text-sm text-muted-foreground">
        Failed to open build chat.
      </Container>
    </div>
  );
}
