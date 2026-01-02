import type { JsonInput } from "./common";

export type ChatRole = "user" | "assistant" | "system" | string;

export interface ChatThread {
  id: string;
  userId: string | null;
  pathId: string | null;
  jobId: string | null;
  title: string;
  status: string;
  metadata: JsonInput;
  nextSeq: number;
  lastMessageAt: string | null;
  lastViewedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ChatMessage {
  id: string;
  threadId: string | null;
  userId: string | null;
  seq: number;
  role: ChatRole;
  status: string;
  content: string;
  metadata: JsonInput;
  idempotencyKey: string;
  createdAt: string | null;
  updatedAt: string | null;
}
