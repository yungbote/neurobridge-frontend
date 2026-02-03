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
  showFaceFeedbackBox?: (show: boolean) => void;
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
const PREVIEW_MAX_W = Number(import.meta.env.VITE_EYE_TRACKING_PREVIEW_MAX_W) || 320;
const PREVIEW_MAX_H = Number(import.meta.env.VITE_EYE_TRACKING_PREVIEW_MAX_H) || 240;
const CAM_WIDTH = Number(import.meta.env.VITE_EYE_TRACKING_CAM_WIDTH) || 1280;
const CAM_HEIGHT = Number(import.meta.env.VITE_EYE_TRACKING_CAM_HEIGHT) || 720;
const CAM_FPS = Number(import.meta.env.VITE_EYE_TRACKING_CAM_FPS) || 30;
const CAM_FACING = String(import.meta.env.VITE_EYE_TRACKING_CAM_FACING || "user").trim();
let webgazerLoadPromise: Promise<WebGazerLike | null> | null = null;
let webgazerBeginPromise: Promise<WebGazerLike | null> | null = null;
let webgazerUsers = 0;
let webgazerRunning = false;
let webgazerStopTimer: number | null = null;

function ensureWebgazerVideoElement(): HTMLVideoElement | null {
  if (typeof document === "undefined") return null;
  let video = document.getElementById("webgazerVideoFeed") as HTMLVideoElement | null;
  if (!video) {
    video = document.createElement("video");
    video.id = "webgazerVideoFeed";
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.style.position = "fixed";
    video.style.opacity = "0";
    video.style.pointerEvents = "none";
    video.style.width = "1px";
    video.style.height = "1px";
    video.style.left = "-9999px";
    video.style.top = "0";
    document.body.appendChild(video);
  }
  if (!video.width) video.width = CAM_WIDTH;
  if (!video.height) video.height = CAM_HEIGHT;
  return video;
}

async function beginWebgazer(wg: WebGazerLike): Promise<WebGazerLike | null> {
  if (webgazerRunning) return wg;
  if (!webgazerBeginPromise) {
    webgazerBeginPromise = (async () => {
      ensureWebgazerVideoElement();
      await wg.begin();
      webgazerRunning = true;
      return wg;
    })().catch(() => null);
  }
  return webgazerBeginPromise;
}

async function loadWebGazer(): Promise<WebGazerLike | null> {
  if (typeof window === "undefined") return null;
  if (window.webgazer) return window.webgazer;
  if (!CDN_URL) return null;
  if (!webgazerLoadPromise) {
    webgazerLoadPromise = new Promise((resolve) => {
      ensureWebgazerVideoElement();
      const script = document.createElement("script");
      script.src = CDN_URL;
      script.async = true;
      script.onload = () => {
        ensureWebgazerVideoElement();
        resolve(window.webgazer || null);
      };
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
    let observer: MutationObserver | null = null;

    const releaseWebgazer = () => {
      webgazerUsers = Math.max(0, webgazerUsers - 1);
      if (webgazerUsers > 0) return;
      const wg = window.webgazer;
      try {
        wg?.pause?.();
      } catch {
        // ignore
      }
      if (webgazerStopTimer) {
        window.clearTimeout(webgazerStopTimer);
      }
      webgazerStopTimer = window.setTimeout(() => {
        if (webgazerUsers > 0) return;
        const wgStop = window.webgazer;
        if (wgStop) {
          try {
            wgStop.end();
          } catch {
            // ignore
          }
        }
        webgazerRunning = false;
        webgazerBeginPromise = null;
      }, 250);
    };

    const stopManualStream = () => {
      if (manualStreamRef.current) {
        manualStreamRef.current.getTracks().forEach((track) => track.stop());
        manualStreamRef.current = null;
      }
    };

    if (!enabled) {
      stopManualStream();
      setStatus("idle");
      setError(null);
      return () => {};
    }

    const permission = getEyeTrackingPermission();
    if (permission === false) {
      stopManualStream();
      setStatus("denied");
      setError(null);
      return () => {};
    }
    if (permission == null) {
      stopManualStream();
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
    webgazerUsers += 1;
    if (webgazerStopTimer) {
      window.clearTimeout(webgazerStopTimer);
      webgazerStopTimer = null;
    }

    if (typeof document !== "undefined") {
      ensureWebgazerVideoElement();
      observer = new MutationObserver(() => {
        if (!enabled) return;
        ensureWebgazerVideoElement();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    const ensureVideoStream = async (): Promise<boolean> => {
      if (typeof document === "undefined") return false;
      const ensured = ensureWebgazerVideoElement();
      const video = ensured ?? (document.getElementById("webgazerVideoFeed") as HTMLVideoElement | null);
      if (!video) return false;
      if (video.srcObject) return true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: CAM_WIDTH },
            height: { ideal: CAM_HEIGHT },
            frameRate: { ideal: CAM_FPS },
            facingMode: CAM_FACING || "user",
          },
        });
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
      const video = ensureWebgazerVideoElement();
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
        const scale =
          w > 0 && h > 0 ? Math.min(PREVIEW_MAX_W / w, PREVIEW_MAX_H / h, 1) : 1;
        const displayW = Math.max(1, Math.round(w * scale));
        const displayH = Math.max(1, Math.round(h * scale));
        wgAny.setVideoViewerSize(displayW, displayH);
      }
      // Expand feedback box to cover full webcam width so eyes are always within bounds.
      const minDim = Math.min(w, h);
      const maxDim = Math.max(w, h);
      const ratio = minDim > 0 ? maxDim / minDim : 1;
      wgAny.params = wgAny.params || {};
      wgAny.params.faceFeedbackBoxRatio = ratio;
      wgAny.showFaceFeedbackBox?.(true);
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
          releaseWebgazer();
          return;
        }
        const wgAny = wg as WebGazerLike & { params?: Record<string, unknown> };
        if (FACE_MESH_BASE) {
          wgAny.params = wgAny.params || {};
          wgAny.params.faceMeshSolutionPath = FACE_MESH_BASE;
        }
        ensureWebgazerVideoElement();
        if (typeof wgAny.setCameraConstraints === "function") {
          await wgAny.setCameraConstraints({
            video: {
              width: { ideal: CAM_WIDTH },
              height: { ideal: CAM_HEIGHT },
              frameRate: { ideal: CAM_FPS },
              facingMode: CAM_FACING || "user",
            },
          });
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
        await ensureVideoStream();
        const started = await beginWebgazer(wg);
        if (!started) {
          ensureWebgazerVideoElement();
          await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
          await beginWebgazer(wg);
        }
        wg.resume?.();
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
        releaseWebgazer();
      }
    })();

    return () => {
      cancelled = true;
      active = false;
      stopManualStream();
      releaseWebgazer();
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    };
  }, [enabled]);

  return { gazeRef, status, error };
}
