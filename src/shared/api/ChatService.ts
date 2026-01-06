import axiosClient from "./AxiosClient";
import type {
  BackendChatMessage,
  BackendChatSendResponse,
  BackendChatThread,
  BackendChatThreadResponse,
  BackendChatThreadsResponse,
} from "@/shared/types/backend";
import type { ChatMessage, ChatThread } from "@/shared/types/models";

type ChatThreadRecord = BackendChatThread & Partial<ChatThread>;
type ChatMessageRecord = BackendChatMessage & Partial<ChatMessage>;

export function mapChatThread(raw: BackendChatThread | ChatThread | null | undefined): ChatThread | null {
  if (!raw) return null;
  const row = raw as ChatThreadRecord;
  return {
    id: String(row.id),
    userId: (row.user_id ?? row.userId ?? null) as string | null,
    pathId: (row.path_id ?? row.pathId ?? null) as string | null,
    jobId: (row.job_id ?? row.jobId ?? null) as string | null,
    title: row.title ?? "",
    status: row.status ?? "",
    metadata: (row.metadata ?? null) as ChatThread["metadata"],
    nextSeq: typeof row.next_seq === "number" ? row.next_seq : row.nextSeq ?? 0,
    lastMessageAt: (row.last_message_at ?? row.lastMessageAt ?? null) as string | null,
    lastViewedAt: (row.last_viewed_at ?? row.lastViewedAt ?? null) as string | null,
    createdAt: (row.created_at ?? row.createdAt ?? null) as string | null,
    updatedAt: (row.updated_at ?? row.updatedAt ?? null) as string | null,
  };
}

export function mapChatMessage(raw: BackendChatMessage | ChatMessage | null | undefined): ChatMessage | null {
  if (!raw) return null;
  const row = raw as ChatMessageRecord;
  return {
    id: String(row.id),
    threadId: (row.thread_id ?? row.threadId ?? null) as string | null,
    userId: (row.user_id ?? row.userId ?? null) as string | null,
    seq: typeof row.seq === "number" ? row.seq : Number(row.seq) || 0,
    role: row.role ?? "",
    status: row.status ?? "",
    content: row.content ?? "",
    metadata: (row.metadata ?? null) as ChatMessage["metadata"],
    idempotencyKey: row.idempotency_key ?? row.idempotencyKey ?? "",
    createdAt: (row.created_at ?? row.createdAt ?? null) as string | null,
    updatedAt: (row.updated_at ?? row.updatedAt ?? null) as string | null,
  };
}

export async function createChatThread({
  title,
  pathId,
  jobId,
}: {
  title?: string;
  pathId?: string | null;
  jobId?: string | null;
} = {}): Promise<ChatThread | null> {
  const payload: Record<string, string> = {};
  if (typeof title === "string" && title.trim()) payload.title = title.trim();
  if (pathId) payload.path_id = pathId;
  if (jobId) payload.job_id = jobId;
  const resp = await axiosClient.post<BackendChatThreadResponse>("/chat/threads", payload);
  return mapChatThread(resp.data?.thread ?? null);
}

export async function getChatThread(
  threadId: string,
  limit = 50
): Promise<{ thread: ChatThread | null; messages: ChatMessage[] }> {
  if (!threadId) throw new Error("getChatThread: missing threadId");
  const resp = await axiosClient.get<BackendChatThreadResponse>(`/chat/threads/${threadId}`, {
    params: { limit },
  });
  const thread = mapChatThread(resp.data?.thread ?? null);
  const messages = (resp.data?.messages || []).map(mapChatMessage).filter(Boolean) as ChatMessage[];
  messages.sort((a, b) => (a.seq || 0) - (b.seq || 0));
  return { thread, messages };
}

export async function listChatThreads(limit = 50): Promise<ChatThread[]> {
  const resp = await axiosClient.get<BackendChatThreadsResponse>("/chat/threads", {
    params: { limit },
  });
  const threads = (resp.data?.threads || []).map(mapChatThread).filter(Boolean) as ChatThread[];
  threads.sort((a, b) => {
    const ad = new Date(a?.lastMessageAt || a?.updatedAt || a?.createdAt || 0).getTime();
    const bd = new Date(b?.lastMessageAt || b?.updatedAt || b?.createdAt || 0).getTime();
    return bd - ad;
  });
  return threads;
}

export async function listChatMessages(
  threadId: string,
  {
    limit = 50,
    beforeSeq,
  }: {
    limit?: number;
    beforeSeq?: number;
  } = {}
): Promise<ChatMessage[]> {
  if (!threadId) throw new Error("listChatMessages: missing threadId");
  const params: Record<string, number> = { limit };
  if (typeof beforeSeq === "number") params.before_seq = beforeSeq;
  const resp = await axiosClient.get<BackendChatThreadResponse>(`/chat/threads/${threadId}/messages`, {
    params,
  });
  const messages = (resp.data?.messages || []).map(mapChatMessage).filter(Boolean) as ChatMessage[];
  messages.sort((a, b) => (a.seq || 0) - (b.seq || 0));
  return messages;
}

export async function sendChatMessage(
  threadId: string,
  content: string,
  { idempotencyKey }: { idempotencyKey?: string } = {}
): Promise<{
  userMessage: ChatMessage | null;
  assistantMessage: ChatMessage | null;
  job: BackendChatSendResponse["job"] | null;
}> {
  if (!threadId) throw new Error("sendChatMessage: missing threadId");
  const trimmed = String(content || "").trim();
  if (!trimmed) throw new Error("sendChatMessage: empty content");

  const headers: Record<string, string> = {};
  const key = String(idempotencyKey || "").trim();
  if (key) headers["Idempotency-Key"] = key;

  const resp = await axiosClient.post<BackendChatSendResponse>(
    `/chat/threads/${threadId}/messages`,
    { content: trimmed, idempotency_key: key },
    { headers }
  );

  return {
    userMessage: mapChatMessage(resp.data?.user_message ?? null),
    assistantMessage: mapChatMessage(resp.data?.assistant_message ?? null),
    job: resp.data?.job ?? null,
  };
}
