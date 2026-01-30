import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export interface ChatDockContextPayload {
  nodeId?: string | null;
  blockId?: string | null;
  blockType?: string | null;
}

interface ChatDockContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  width: number;
  setWidth: (width: number) => void;
  activeThreadId: string | null;
  activeContext: ChatDockContextPayload | null;
  setActiveThreadId: (threadId: string | null) => void;
  openThread: (threadId: string, context?: ChatDockContextPayload | null) => void;
  close: () => void;
}

const ChatDockContext = createContext<ChatDockContextValue | null>(null);

const WIDTH_KEY = "chat_dock_width";
const OPEN_KEY = "chat_dock_open";
const THREAD_KEY = "chat_dock_thread";
const CONTEXT_KEY = "chat_dock_context";
const DOCK_MIN_WIDTH = 340;
const DOCK_MAX_WIDTH = 760;
const DOCK_DEFAULT_WIDTH = 420;

export function ChatDockProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(() => {
    try {
      const v = window.localStorage.getItem(OPEN_KEY);
      return v === "1";
    } catch {
      return false;
    }
  });
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => {
    try {
      const v = window.localStorage.getItem(THREAD_KEY);
      return v ? String(v).trim() || null : null;
    } catch {
      return null;
    }
  });
  const [activeContext, setActiveContext] = useState<ChatDockContextPayload | null>(() => {
    try {
      const raw = window.localStorage.getItem(CONTEXT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ChatDockContextPayload | null;
      if (!parsed || typeof parsed !== "object") return null;
      return {
        nodeId: parsed.nodeId ? String(parsed.nodeId) : null,
        blockId: parsed.blockId ? String(parsed.blockId) : null,
        blockType: parsed.blockType ? String(parsed.blockType) : null,
      };
    } catch {
      return null;
    }
  });
  const [width, setWidth] = useState(() => {
    try {
      const v = Number(window.localStorage.getItem(WIDTH_KEY));
      return Number.isFinite(v)
        ? Math.min(Math.max(v, DOCK_MIN_WIDTH), DOCK_MAX_WIDTH)
        : DOCK_DEFAULT_WIDTH;
    } catch {
      return DOCK_DEFAULT_WIDTH;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      // ignore storage errors
    }
  }, [width]);

  useEffect(() => {
    try {
      window.localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {
      // ignore storage errors
    }
  }, [open]);

  useEffect(() => {
    try {
      if (activeThreadId) window.localStorage.setItem(THREAD_KEY, activeThreadId);
      else window.localStorage.removeItem(THREAD_KEY);
    } catch {
      // ignore storage errors
    }
  }, [activeThreadId]);

  useEffect(() => {
    try {
      if (activeContext) window.localStorage.setItem(CONTEXT_KEY, JSON.stringify(activeContext));
      else window.localStorage.removeItem(CONTEXT_KEY);
    } catch {
      // ignore storage errors
    }
  }, [activeContext]);

  const openThread = useCallback((threadId: string, context?: ChatDockContextPayload | null) => {
    const id = String(threadId || "").trim();
    if (!id) return;
    setActiveThreadId(id);
    setActiveContext(context || null);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      open,
      setOpen,
      width,
      setWidth,
      activeThreadId,
      activeContext,
      setActiveThreadId,
      openThread,
      close,
    }),
    [open, width, activeThreadId, activeContext, openThread, close]
  );

  return <ChatDockContext.Provider value={value}>{children}</ChatDockContext.Provider>;
}

export function useChatDock() {
  const ctx = useContext(ChatDockContext);
  if (!ctx) throw new Error("useChatDock must be used within ChatDockProvider");
  return ctx;
}
