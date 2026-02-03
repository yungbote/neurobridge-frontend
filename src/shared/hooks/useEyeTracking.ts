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
  setVideoViewerSize?: (width: number, height: number) => WebGazerLike;
  setCameraConstraints?: (constraints: MediaStreamConstraints) => Promise<WebGazerLike> | WebGazerLike;
  params?: Record<string, unknown>;
};

declare global {
  interface Window {
    webgazer?: WebGazerLike;
  }
}

const CDN_URL = String(import.meta.env.VITE_EYE_TRACKING_CDN || "/eye-tracking/webgazer.js").trim();
const FACE_MESH_BASE_RAW = String(import.meta.env.VITE_EYE_TRACKING_FACE_MESH_BASE || "/mediapipe/face_mesh").trim();
const NO_CACHE =
  String(import.meta.env.VITE_EYE_TRACKING_NO_CACHE || (import.meta.env.DEV ? "1" : "")).trim() === "1";
const DEBUG_POINTS =
  String(import.meta.env.VITE_EYE_TRACKING_DEBUG || "").toLowerCase() === "true" ||
  String(import.meta.env.VITE_EYE_TRACKING_DEBUG || "").toLowerCase() === "1" ||
  String(import.meta.env.VITE_EYE_TRACKING_DEBUG || "").toLowerCase() === "yes";
const FACE_MESH_BASE = FACE_MESH_BASE_RAW
  ? FACE_MESH_BASE_RAW.startsWith("/") || FACE_MESH_BASE_RAW.startsWith("http")
    ? FACE_MESH_BASE_RAW
    : `/${FACE_MESH_BASE_RAW}`
  : "";
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
  const lastViewerSizeRef = useRef<{ w: number; h: number } | null>(null);
  const [status, setStatus] = useState<EyeTrackingStatus>(enabled ? "starting" : "idle");
  const [error, setError] = useState<string | null>(null);

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
      setError(null);
      return () => {};
    }

    const permission = getEyeTrackingPermission();
    if (permission === false) {
      stop();
      setStatus("denied");
      setError(null);
      return () => {};
    }
    if (permission == null) {
      stop();
      setStatus("unavailable");
      setError(null);
      return () => {};
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      setError(null);
      return () => {};
    }

    setStatus("starting");
    setError(null);

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

    const syncViewerToVideo = async (): Promise<void> => {
      const wgAny = window.webgazer as WebGazerLike | undefined;
      if (!wgAny || typeof document === "undefined") return;
      const video = document.getElementById("webgazerVideoFeed") as HTMLVideoElement | null;
      if (!video) return;
      if (!video.videoWidth || !video.videoHeight) {
        await new Promise<void>((resolve) => {
          const handler = () => {
            video.removeEventListener("loadedmetadata", handler);
            resolve();
          };
          video.addEventListener("loadedmetadata", handler);
          window.setTimeout(() => {
            video.removeEventListener("loadedmetadata", handler);
            resolve();
          }, 1000);
        });
      }
      const w = Math.round(video.videoWidth || video.clientWidth || 0);
      const h = Math.round(video.videoHeight || video.clientHeight || 0);
      if (!w || !h) return;
      const prev = lastViewerSizeRef.current;
      if (prev && prev.w === w && prev.h === h) return;
      lastViewerSizeRef.current = { w, h };
      if (typeof wgAny.setVideoViewerSize === "function") {
        wgAny.setVideoViewerSize(w, h);
      }
    };

    (async () => {
      try {
        if (typeof window !== "undefined" && NO_CACHE) {
          (window as unknown as { __NB_EYE_ASSET_BUST?: number }).__NB_EYE_ASSET_BUST = Date.now();
        }
        const wg = await loadWebGazer();
        if (!wg) {
          if (!cancelled) {
            setStatus("unavailable");
            setError("webgazer unavailable");
          }
          return;
        }
        const wgAny = wg as WebGazerLike & { params?: Record<string, unknown> };
        if (FACE_MESH_BASE) {
          wgAny.params = wgAny.params || {};
          wgAny.params.faceMeshSolutionPath = FACE_MESH_BASE;
        }
        wg.showPredictionPoints?.(DEBUG_POINTS);
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
        await syncViewerToVideo();
        if (!cancelled) {
          setStatus("active");
          setError(null);
        }
        const startAt = Date.now();
        window.setTimeout(async () => {
          if (cancelled) return;
          if (lastGazeAtRef.current > startAt) return;
          await ensureVideoStream();
          await syncViewerToVideo();
        }, 1500);
      } catch (err) {
        if (!cancelled) {
          const msg = String((err as Error)?.message || "").toLowerCase();
          if (msg.includes("denied") || msg.includes("permission")) {
            setStatus("denied");
            setError(null);
          } else {
            setStatus("error");
            const text = String((err as Error)?.message || "unknown error");
            setError(text);
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

  return { gazeRef, status, error };
}
