import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { getAccessToken } from "@/services/StorageService";
import SSEService from "@/api/SSEService";


const SSEContext = createContext({
  connected: false,
  lastMessage: null,
  subscribeChannel: async () => {},
  unsubscribeChannel: async () => {}
});

export function SSEProvider({ children }) {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const subscribedChannelsRef = useRef(new Set());
  const initRef = useRef(false);
  const retryTimer = useRef(null);
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
      connect();
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
        const parsed = JSON.parse(evt.data);
        console.log("[SSEProvider] message:", evt.data);
        setLastMessage({
          event: parsed.event,
          channel: parsed.channel,
          data: parsed.data
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
    if (!initRef.current) {
      initRef.current = true;
      connect();
    }
    return () => {
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
      }
      resetState();
    };
  }, [connect, resetState]);

  subscribeChannel = useCallback(
    async (channel) => {
      if (!connected) {
        console.warn(`[SSEProvider] Not connected yet, cannot subscribe to ${channel}`);
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
    }, [connected]);

  const unsubscribeChannel = useCallback(async (channel) => {
    const trimmed = channel.trim();
    if (!subscribedChannelsRef.current.has(trimmed)) {
      return
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

  const value = { connected, lastMessage, subscribeChannel, unsubscribeChannel };

  return <SSEContext.Provider value={value}>{children}</SSEContext.Provider>;
}

export function useSSEContext() {
  return useContext(SSEContext);
}
