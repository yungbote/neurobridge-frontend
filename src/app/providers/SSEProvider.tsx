import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  useRef,
} from "react";
import type { ReactNode } from "react";
import { getAccessToken } from "@/shared/services/StorageService";
import SSEService from "@/shared/api/SSEService";
import { useAuth } from "@/app/providers/AuthProvider";
import type { SseMessage } from "@/shared/types/models";
import { recordSse } from "@/shared/observability/rum";

// TODO: Harden sse beyond a single last message variable. This is fragile.

interface SSEContextValue {
  connected: boolean;
  lastMessage: SseMessage | null;
  messages: SseMessage[];
  subscribeChannel: (channel: string) => Promise<void>;
  unsubscribeChannel: (channel: string) => Promise<void>;
}

const SSEContext = createContext<SSEContextValue>({
  connected: false,
  lastMessage: null,
  messages: [],
  subscribeChannel: async () => {},
  unsubscribeChannel: async () => {},
});

interface SSEProviderProps {
  children: ReactNode;
}

export function SSEProvider({ children }: SSEProviderProps) {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<SseMessage | null>(null);
  const [messages, setMessages] = useState<SseMessage[]>([]);
  const subscribedChannelsRef = useRef<Set<string>>(new Set());
  const initRef = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<(() => void) | null>(null);
  const connectAttemptAtRef = useRef<number | null>(null);
  const lastMessageAtRef = useRef<number | null>(null);
  const lastOpenAtRef = useRef<number | null>(null);

  const resetState = useCallback(() => {
    setConnected(false);
    setLastMessage(null);
    setMessages([]);
    subscribedChannelsRef.current.clear();
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    SSEService.close();
  }, []);

  const scheduleRetry = useCallback((delay = 1000) => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
    }
    retryTimer.current = setTimeout(() => {
      connectRef.current?.();
    }, delay);
    recordSse("retry", { delay_ms: delay });
  }, []);

  const connect = useCallback(() => {
    const token = getAccessToken();
    if (!token) {
      console.warn("[SSEProvider] No token found, will retry...");
      setConnected(false);
      scheduleRetry(2000);
      return;
    }
    connectAttemptAtRef.current = performance.now();
    recordSse("connect_attempt", {});
    SSEService.connect();
    SSEService.onOpen(() => {
      console.log("[SSEProvider] onopen => connected!");
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      setConnected(true);
      const now = performance.now();
      const connectMs =
        connectAttemptAtRef.current !== null
          ? Math.max(0, now - connectAttemptAtRef.current)
          : undefined;
      lastOpenAtRef.current = now;
      lastMessageAtRef.current = now;
      recordSse("open", connectMs !== undefined ? { connect_ms: Math.round(connectMs) } : {});
    });
    SSEService.onError((err) => {
      console.error("[SSEProvider] onerror =>", err);
      setConnected(false);
      const now = performance.now();
      const sinceOpen =
        lastOpenAtRef.current !== null ? Math.max(0, now - lastOpenAtRef.current) : undefined;
      const sinceMessage =
        lastMessageAtRef.current !== null ? Math.max(0, now - lastMessageAtRef.current) : undefined;
      recordSse("error", {
        since_open_ms: sinceOpen !== undefined ? Math.round(sinceOpen) : undefined,
        since_message_ms: sinceMessage !== undefined ? Math.round(sinceMessage) : undefined,
      });
      SSEService.close();
      scheduleRetry(1000);
    });
    SSEService.onMessage((evt) => {
      try {
        lastMessageAtRef.current = performance.now();
        const parsed = JSON.parse(evt.data) as Partial<SseMessage>;
        console.log("[SSEProvider] message:", evt.data);
        const msg: SseMessage = {
          event: String(parsed.event ?? ""),
          channel: String(parsed.channel ?? ""),
          data: parsed.data ?? null,
        };
        setLastMessage(msg);
        setMessages((prev) => {
          const next = [...(Array.isArray(prev) ? prev : []), msg];
          const max = 50;
          return next.length > max ? next.slice(next.length - max) : next;
        });
      } catch (error) {
        console.warn(
          "[SSEProvider] Failed to parse SSE data =>",
          evt.data,
          error
        );
      }
    });
  }, [scheduleRetry]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      console.log("[SSEProvider] mounting, calling connect()");
      connect();
    }
    return () => {
      console.log("[SSEProvider] unmounting, closing SSE");
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
      }
      if (lastOpenAtRef.current !== null) {
        const sinceOpen = Math.max(0, performance.now() - lastOpenAtRef.current);
        recordSse("close", { since_open_ms: Math.round(sinceOpen) });
      } else {
        recordSse("close", {});
      }
      resetState();
    };
  }, [connect, resetState]);

  const subscribeChannel = useCallback(
    async (channel: string) => {
      if (!connected) {
        console.warn(
          `[SSEProvider] Not connected yet, cannot subscribe to ${channel}.`
        );
        return;
      }
      const trimmed = channel.trim();
      if (!trimmed) return;

      if (subscribedChannelsRef.current.has(trimmed)) {
        return;
      }
      try {
        await SSEService.subscribe(trimmed);
        subscribedChannelsRef.current.add(trimmed);
      } catch (err) {
        console.error(`[SSEProvider] Failed to subscribe ${trimmed} =>`, err);
      }
    },
    [connected]
  );

  const unsubscribeChannel = useCallback(async (channel: string) => {
    const trimmed = channel.trim();
    if (!subscribedChannelsRef.current.has(trimmed)) {
      return;
    }
    try {
      await SSEService.unsubscribe(trimmed);
      subscribedChannelsRef.current.delete(trimmed);
    } catch (err) {
      console.error(
        `[SSEProvider] Failed to unsubscribe ${trimmed} =>`,
        err
      );
    }
  }, []);

  const value = {
    connected,
    lastMessage,
    messages,
    subscribeChannel,
    unsubscribeChannel
  };

  return <SSEContext.Provider value={value}>{children}</SSEContext.Provider>;
}

export function useSSEContext() {
  return useContext(SSEContext);
}

interface SSEGateProps {
  children: ReactNode;
}

export function SSEGate({ children }: SSEGateProps) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <>{children}</>;
  }
  return <SSEProvider>{children}</SSEProvider>;
}







