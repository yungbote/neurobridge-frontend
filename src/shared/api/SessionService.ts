import axiosClient from "./AxiosClient";
import type { BackendSessionState, BackendSessionStateResponse } from "@/shared/types/backend";
import type { SessionState } from "@/shared/types/models";

type SessionRecord = BackendSessionState & Partial<SessionState>;

export function mapSessionState(raw: BackendSessionState | SessionState | null | undefined): SessionState | null {
  if (!raw) return null;
  const row = raw as SessionRecord;
  return {
    sessionId: String(row.session_id ?? row.sessionId ?? ""),
    userId: String(row.user_id ?? row.userId ?? ""),
    activePathId: (row.active_path_id ?? row.activePathId ?? null) as string | null,
    activePathNodeId: (row.active_path_node_id ?? row.activePathNodeId ?? null) as string | null,
    activeActivityId: (row.active_activity_id ?? row.activeActivityId ?? null) as string | null,
    activeChatThreadId: (row.active_chat_thread_id ?? row.activeChatThreadId ?? null) as string | null,
    activeJobId: (row.active_job_id ?? row.activeJobId ?? null) as string | null,
    activeRoute: (row.active_route ?? row.activeRoute ?? null) as string | null,
    activeView: (row.active_view ?? row.activeView ?? null) as string | null,
    activeDocBlockId: (row.active_doc_block_id ?? row.activeDocBlockId ?? null) as string | null,
    scrollPercent:
      typeof row.scroll_percent === "number"
        ? row.scroll_percent
        : typeof row.scrollPercent === "number"
          ? row.scrollPercent
          : null,
    metadata: (row.metadata ?? null) as SessionState["metadata"],
    lastSeenAt: (row.last_seen_at ?? row.lastSeenAt ?? null) as string | null,
    createdAt: (row.created_at ?? row.createdAt ?? null) as string | null,
    updatedAt: (row.updated_at ?? row.updatedAt ?? null) as string | null,
  };
}

export type SessionStatePatch = Partial<{
  active_path_id: string | null;
  active_path_node_id: string | null;
  active_activity_id: string | null;
  active_chat_thread_id: string | null;
  active_job_id: string | null;
  active_route: string | null;
  active_view: string | null;
  active_doc_block_id: string | null;
  scroll_percent: number | null;
  metadata: Record<string, unknown> | null;
}>;

export async function getSessionState(): Promise<SessionState | null> {
  const resp = await axiosClient.get<BackendSessionStateResponse>("/session/state");
  return mapSessionState(resp.data?.state ?? null);
}

export async function patchSessionState(patch: SessionStatePatch): Promise<SessionState | null> {
  const resp = await axiosClient.patch<BackendSessionStateResponse>("/session/state", patch || {});
  return mapSessionState(resp.data?.state ?? null);
}

