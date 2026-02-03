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

const CDN_URL = String(import.meta.env.VITE_EYE_TRACKING_CDN || "").trim();
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
          gazeRef.current = {
            x: data.x,
            y: data.y,
            confidence: typeof data.confidence === "number" ? data.confidence : 0.6,
            ts: typeof ts === "number" ? ts : Date.now(),
            source: "webgazer",
          };
        });
        await wg.begin();
        if (!cancelled) setStatus("active");
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
