import axiosClient from "./axiosClient";
import { getAccessToken } from "@/services/StorageService";

class SSEService {
  constructor() {
    this.eventSource = null;
  }
  connect() {
    const token = getAccessToken();
    if (!token) {
      console.warn("[SSEService] No token found, skipping SSE connect");
      return;
    }
    const baseURL = axiosClient.defaults.baseURL || "/api";
    const url = `${baseURL}/sse/stream?token=${encodeURIComponent(token)}`;
    console.debug("[SSEService] Connecting to SSE =>", url);
    this.eventSource = new EventSource(url);
  }
  onOpen(callback) {
    if (!this.eventSource) return;
    this.eventSource.onopen = callback;
  }
  onMessage(callback) {
    if (!this.eventSource) return;
    this.eventSource.onmessage = callback;
  }
  onError(callback) {
    if (!this.eventSource) return;
    this.eventSource.onerror = callback;
  }
  close() {
    if (this.eventSource) {
      console.debug("[SSEService] Closing SSE stream");
      this.eventSource.close();
      this.eventSource = null;
    }
  }
  async subscribe(channel) {
    const trimmed = channel.trim();
    if (!trimmed) {
      console.warn("[SSEService] Subscibe called with empty channel");
      return;
    }
    await axiosClient.post("/sse/subscribe", { channel: trimmed });
    console.debug("[SSEService] Subscribed to channel:", trimmed);
  }
  async unsubscribe(channel) {
    const trimmed = channel.trim();
    if (!trimmed) {
      console.warn("[SSEService] Unsubscribe called with empty channel");
      return;
    }
    await axiosClient.post("/sse/unsubscribe", { channel: trimmed });
    console.debug("[SSEService] Unsubscribed from channel:", trimmed);
  }
}

export default new SSEService();
