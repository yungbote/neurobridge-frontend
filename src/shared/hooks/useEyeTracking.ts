import { useEffect, useRef, useState } from "react";
import { getEyeTrackingPermission } from "@/shared/hooks/useEyeTrackingPreference";
import { readCalibrationModel, EyeCalibrationModel, EyeCalibrationTransform, EyeCalibrationGrid } from "@/shared/hooks/useEyeCalibration";

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
  setStaticVideo?: (stream: MediaStream) => WebGazerLike;
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function applyAffinePoint(x: number, y: number, transform: EyeCalibrationTransform | null): { x: number; y: number } {
  if (!transform) return { x, y };
  const tx = transform.a * x + transform.b * y + transform.c;
  const ty = transform.d * x + transform.e * y + transform.f;
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) return { x, y };
  return { x: tx, y: ty };
}

function bilerp(
  grid: EyeCalibrationGrid,
  nx: number,
  ny: number,
  field: "dx" | "dy"
): number {
  const size = grid.size;
  if (size < 2) return 0;
  const gx = clamp(nx, 0, 1) * (size - 1);
  const gy = clamp(ny, 0, 1) * (size - 1);
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = gx - x0;
  const ty = gy - y0;
  const idx = (ix: number, iy: number) => iy * size + ix;
  const arr = field === "dx" ? grid.dx : grid.dy;
  const v00 = arr[idx(x0, y0)] ?? 0;
  const v10 = arr[idx(x1, y0)] ?? 0;
  const v01 = arr[idx(x0, y1)] ?? 0;
  const v11 = arr[idx(x1, y1)] ?? 0;
  const v0 = v00 * (1 - tx) + v10 * tx;
  const v1 = v01 * (1 - tx) + v11 * tx;
  return v0 * (1 - ty) + v1 * ty;
}

function applyGridResidual(
  x: number,
  y: number,
  model: EyeCalibrationModel | null
): { x: number; y: number } {
  if (!model?.grid) return { x, y };
  const width = Number.isFinite(model.width) && model.width > 0 ? model.width : window.innerWidth;
  const height = Number.isFinite(model.height) && model.height > 0 ? model.height : window.innerHeight;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return { x, y };
  const nx = clamp(x / width, 0, 1);
  const ny = clamp(y / height, 0, 1);
  const dx = bilerp(model.grid, nx, ny, "dx");
  const dy = bilerp(model.grid, nx, ny, "dy");
  const scaleX = model.width > 0 ? window.innerWidth / model.width : 1;
  const scaleY = model.height > 0 ? window.innerHeight / model.height : 1;
  const nextX = x + dx * scaleX;
  const nextY = y + dy * scaleY;
  return { x: nextX, y: nextY };
}

function applyCalibrationPoint(
  x: number,
  y: number,
  model: EyeCalibrationModel | null
): { x: number; y: number } {
  if (!model) return { x, y };
  let next = applyAffinePoint(x, y, model.transform);
  next = applyGridResidual(next.x, next.y, model);
  const maxX = typeof window !== "undefined" ? window.innerWidth : next.x;
  const maxY = typeof window !== "undefined" ? window.innerHeight : next.y;
  return {
    x: clamp(next.x, 0, Math.max(0, maxX)),
    y: clamp(next.y, 0, Math.max(0, maxY)),
  };
}

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
  const rawGazeRef = useRef<GazePoint | null>(null);
  const gazeRef = useRef<GazePoint | null>(null);
  const lastGazeAtRef = useRef<number>(0);
  const manualStreamRef = useRef<MediaStream | null>(null);
  const lastViewerSizeRef = useRef<{ w: number; h: number } | null>(null);
  const calibrationModelRef = useRef<EyeCalibrationModel | null>(readCalibrationModel());
  const [status, setStatus] = useState<EyeTrackingStatus>(enabled ? "starting" : "idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<EyeCalibrationModel | null>).detail;
      calibrationModelRef.current = detail ?? readCalibrationModel();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("nb_eye_calibration_updated", handler as EventListener);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("nb_eye_calibration_updated", handler as EventListener);
      }
    };
  }, []);

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
        wgAny.params = wgAny.params || {};
        wgAny.params.videoElementId = "webgazerVideoFeed";
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
        try {
          wg.removeMouseEventListeners?.();
        } catch {
          // ignore
        }
        wg.setGazeListener((data, ts) => {
          if (!active || !data) return;
          lastGazeAtRef.current = Date.now();
          const rawX = data.x;
          const rawY = data.y;
          const calibrated = applyCalibrationPoint(rawX, rawY, calibrationModelRef.current);
          const payload = {
            confidence: typeof data.confidence === "number" ? data.confidence : 0.6,
            ts: typeof ts === "number" ? ts : Date.now(),
            source: "webgazer" as const,
          };
          rawGazeRef.current = { x: rawX, y: rawY, ...payload };
          gazeRef.current = { x: calibrated.x, y: calibrated.y, ...payload };
        });
        const streamReady = await ensureVideoStream();
        if (streamReady && manualStreamRef.current && typeof wgAny.setStaticVideo === "function") {
          wgAny.setStaticVideo(manualStreamRef.current);
        }
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

  return { gazeRef, rawGazeRef, status, error };
}
