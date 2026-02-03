import { useEffect, useRef, useState } from "react";
import { getEyeTrackingPermission } from "@/shared/hooks/useEyeTrackingPreference";

export type EyeTrackingStatus =
  | "idle"
  | "starting"
  | "active"
  | "unsupported"
  | "denied"
  | "unavailable"
  | "error";

export type GazePoint = {
  x: number;
  y: number;
  confidence: number;
  ts: number;
  source: "webgazer";
};

type WebGazerLike = {
  setGazeListener: (cb: (data: { x: number; y: number; confidence?: number } | null, ts: number) => void) => WebGazerLike;
  begin: () => Promise<void> | void;
  end: () => void;
  pause?: () => void;
  resume?: () => void;
  showPredictionPoints?: (show: boolean) => void;
};

declare global {
  interface Window {
    webgazer?: WebGazerLike;
  }
}

const CDN_URL = String(import.meta.env.VITE_EYE_TRACKING_CDN || "/eye-tracking/webgazer.js").trim();
let webgazerLoadPromise: Promise<WebGazerLike | null> | null = null;

async function loadWebGazer(): Promise<WebGazerLike | null> {
  if (typeof window === "undefined") return null;
  if (window.webgazer) return window.webgazer;
  if (!CDN_URL) return null;
  if (!webgazerLoadPromise) {
    webgazerLoadPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = CDN_URL;
      script.async = true;
      script.onload = () => resolve(window.webgazer || null);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
  }
  return webgazerLoadPromise;
}

export function useEyeTracking(enabled: boolean) {
  const gazeRef = useRef<GazePoint | null>(null);
  const lastGazeAtRef = useRef<number>(0);
  const manualStreamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<EyeTrackingStatus>(enabled ? "starting" : "idle");

  useEffect(() => {
    let cancelled = false;
    let active = true;

    const stop = () => {
      const wg = window.webgazer;
      if (wg) {
        try {
          wg.pause?.();
          wg.end();
        } catch {
          // ignore
        }
      }
      if (manualStreamRef.current) {
        manualStreamRef.current.getTracks().forEach((track) => track.stop());
        manualStreamRef.current = null;
      }
    };

    if (!enabled) {
      stop();
      setStatus("idle");
      return () => {};
    }

    const permission = getEyeTrackingPermission();
    if (permission === false) {
      stop();
      setStatus("denied");
      return () => {};
    }
    if (permission == null) {
      stop();
      setStatus("unavailable");
      return () => {};
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return () => {};
    }

    setStatus("starting");

    const ensureVideoStream = async (): Promise<boolean> => {
      if (typeof document === "undefined") return false;
      const video = document.getElementById("webgazerVideoFeed") as HTMLVideoElement | null;
      if (!video) return false;
      if (video.srcObject) return true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        manualStreamRef.current = stream;
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        return true;
      } catch {
        return false;
      }
    };

    (async () => {
      try {
        const wg = await loadWebGazer();
        if (!wg) {
          if (!cancelled) setStatus("unavailable");
          return;
        }
        wg.showPredictionPoints?.(false);
        wg.setGazeListener((data, ts) => {
          if (!active || !data) return;
          lastGazeAtRef.current = Date.now();
          gazeRef.current = {
            x: data.x,
            y: data.y,
            confidence: typeof data.confidence === "number" ? data.confidence : 0.6,
            ts: typeof ts === "number" ? ts : Date.now(),
            source: "webgazer",
          };
        });
        await wg.begin();
        await ensureVideoStream();
        if (!cancelled) setStatus("active");
        const startAt = Date.now();
        window.setTimeout(async () => {
          if (cancelled) return;
          if (lastGazeAtRef.current > startAt) return;
          await ensureVideoStream();
        }, 1500);
      } catch (err) {
        if (!cancelled) {
          const msg = String((err as Error)?.message || "").toLowerCase();
          if (msg.includes("denied") || msg.includes("permission")) {
            setStatus("denied");
          } else {
            setStatus("error");
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      active = false;
      stop();
    };
  }, [enabled]);

  return { gazeRef, status };
}
