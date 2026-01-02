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

// TODO: Harden sse beyond a single last message variable. This is fragile.

interface SSEContextValue {
  connected: boolean;
  lastMessage: SseMessage | null;
  subscribeChannel: (channel: string) => Promise<void>;
  unsubscribeChannel: (channel: string) => Promise<void>;
}

const SSEContext = createContext<SSEContextValue>({
  connected: false,
  lastMessage: null,
  subscribeChannel: async () => {},
  unsubscribeChannel: async () => {},
});

interface SSEProviderProps {
  children: ReactNode;
}

export function SSEProvider({ children }: SSEProviderProps) {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<SseMessage | null>(null);
  const subscribedChannelsRef = useRef<Set<string>>(new Set());
  const initRef = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<(() => void) | null>(null);

  const resetState = useCallback(() => {
    setConnected(false);
    setLastMessage(null);
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
  }, []);

  const connect = useCallback(() => {
    const token = getAccessToken();
    if (!token) {
      console.warn("[SSEProvider] No token found, will retry...");
      setConnected(false);
      scheduleRetry(2000);
      return;
    }
    SSEService.connect();
    SSEService.onOpen(() => {
      console.log("[SSEProvider] onopen => connected!");
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      setConnected(true);
    });
    SSEService.onError((err) => {
      console.error("[SSEProvider] onerror =>", err);
      setConnected(false);
      SSEService.close();
      scheduleRetry(1000);
    });
    SSEService.onMessage((evt) => {
      try {
        const parsed = JSON.parse(evt.data) as Partial<SseMessage>;
        console.log("[SSEProvider] message:", evt.data);
        setLastMessage({
          event: String(parsed.event ?? ""),
          channel: String(parsed.channel ?? ""),
          data: parsed.data ?? null,
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









