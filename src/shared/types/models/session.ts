import type { JsonInput } from "./common";

export interface SessionState {
  sessionId: string;
  userId: string;

  activePathId: string | null;
  activePathNodeId: string | null;
  activeActivityId: string | null;
  activeChatThreadId: string | null;
  activeJobId: string | null;

  activeRoute: string | null;
  activeView: string | null;
  activeDocBlockId: string | null;
  scrollPercent: number | null;

  metadata: JsonInput;

  lastSeenAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

