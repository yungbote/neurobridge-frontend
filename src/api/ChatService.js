import axiosClient from "./AxiosClient";

export function mapChatThread(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    userId: raw.user_id ?? raw.userId ?? null,
    pathId: raw.path_id ?? raw.pathId ?? null,
    jobId: raw.job_id ?? raw.jobId ?? null,
    title: raw.title ?? "",
    status: raw.status ?? "",
    metadata: raw.metadata ?? null,
    nextSeq: typeof raw.next_seq === "number" ? raw.next_seq : raw.nextSeq ?? 0,
    lastMessageAt: raw.last_message_at ?? raw.lastMessageAt ?? null,
    lastViewedAt: raw.last_viewed_at ?? raw.lastViewedAt ?? null,
    createdAt: raw.created_at ?? raw.createdAt ?? null,
    updatedAt: raw.updated_at ?? raw.updatedAt ?? null,
  };
}

export function mapChatMessage(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    threadId: raw.thread_id ?? raw.threadId ?? null,
    userId: raw.user_id ?? raw.userId ?? null,
    seq: typeof raw.seq === "number" ? raw.seq : Number(raw.seq) || 0,
    role: raw.role ?? "",
    status: raw.status ?? "",
    content: raw.content ?? "",
    metadata: raw.metadata ?? null,
    idempotencyKey: raw.idempotency_key ?? raw.idempotencyKey ?? "",
    createdAt: raw.created_at ?? raw.createdAt ?? null,
    updatedAt: raw.updated_at ?? raw.updatedAt ?? null,
  };
}

export async function createChatThread({ title, pathId, jobId } = {}) {
  const payload = {};
  if (typeof title === "string" && title.trim()) payload.title = title.trim();
  if (pathId) payload.path_id = pathId;
  if (jobId) payload.job_id = jobId;
  const resp = await axiosClient.post("/chat/threads", payload);
  return mapChatThread(resp.data?.thread);
}

export async function getChatThread(threadId, limit = 50) {
  if (!threadId) throw new Error("getChatThread: missing threadId");
  const resp = await axiosClient.get(`/chat/threads/${threadId}`, { params: { limit } });
  const thread = mapChatThread(resp.data?.thread);
  const messages = (resp.data?.messages || []).map(mapChatMessage).filter(Boolean);
  messages.sort((a, b) => (a.seq || 0) - (b.seq || 0));
  return { thread, messages };
}

export async function listChatMessages(threadId, { limit = 50, beforeSeq } = {}) {
  if (!threadId) throw new Error("listChatMessages: missing threadId");
  const params = { limit };
  if (typeof beforeSeq === "number") params.before_seq = beforeSeq;
  const resp = await axiosClient.get(`/chat/threads/${threadId}/messages`, { params });
  const messages = (resp.data?.messages || []).map(mapChatMessage).filter(Boolean);
  messages.sort((a, b) => (a.seq || 0) - (b.seq || 0));
  return messages;
}

export async function sendChatMessage(threadId, content, { idempotencyKey } = {}) {
  if (!threadId) throw new Error("sendChatMessage: missing threadId");
  const trimmed = String(content || "").trim();
  if (!trimmed) throw new Error("sendChatMessage: empty content");

  const headers = {};
  const key = String(idempotencyKey || "").trim();
  if (key) headers["Idempotency-Key"] = key;

  const resp = await axiosClient.post(
    `/chat/threads/${threadId}/messages`,
    { content: trimmed, idempotency_key: key },
    { headers }
  );

  return {
    userMessage: mapChatMessage(resp.data?.user_message),
    assistantMessage: mapChatMessage(resp.data?.assistant_message),
    job: resp.data?.job ?? null,
  };
}
