import { useCallback, useEffect, useMemo, useState } from "react";

export type EyeCalibrationState = "missing" | "stale" | "fresh";

const CALIBRATION_VERSION = 2;
const KEY_TS = "nb_eye_calibrated_at";
const KEY_VERSION = "nb_eye_calibration_v";
const KEY_QUALITY = "nb_eye_calibration_quality";
const KEY_ERROR = "nb_eye_calibration_error_px";
const KEY_TRANSFORM = "nb_eye_calibration_transform";

export type EyeCalibrationTransform = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

function getMaxAgeDays(): number {
  const raw = Number(import.meta.env.VITE_EYE_TRACKING_CALIBRATION_MAX_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : 30;
}

function readCalibration(): {
  state: EyeCalibrationState;
  ts: number | null;
  ageDays: number | null;
  quality: number | null;
  errorPx: number | null;
} {
  if (typeof window === "undefined") {
    return { state: "missing", ts: null, ageDays: null, quality: null, errorPx: null };
  }
  const version = window.localStorage.getItem(KEY_VERSION);
  if (!version || Number(version) !== CALIBRATION_VERSION) {
    return { state: "missing", ts: null, ageDays: null, quality: null, errorPx: null };
  }
  const tsRaw = window.localStorage.getItem(KEY_TS);
  const ts = tsRaw ? Number(tsRaw) : 0;
  if (!ts || !Number.isFinite(ts)) return { state: "missing", ts: null, ageDays: null, quality: null, errorPx: null };
  const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  if (!Number.isFinite(ageDays)) return { state: "missing", ts, ageDays: null, quality: null, errorPx: null };
  const qualityRaw = window.localStorage.getItem(KEY_QUALITY);
  const errorRaw = window.localStorage.getItem(KEY_ERROR);
  const quality = qualityRaw ? Number(qualityRaw) : null;
  const errorPx = errorRaw ? Number(errorRaw) : null;
  return {
    state: ageDays > getMaxAgeDays() ? "stale" : "fresh",
    ts,
    ageDays,
    quality: Number.isFinite(quality) ? quality : null,
    errorPx: Number.isFinite(errorPx) ? errorPx : null,
  };
}

export function useEyeCalibration() {
  const [state, setState] = useState<EyeCalibrationState>("missing");
  const [ts, setTs] = useState<number | null>(null);
  const [ageDays, setAgeDays] = useState<number | null>(null);
  const [quality, setQuality] = useState<number | null>(null);
  const [errorPx, setErrorPx] = useState<number | null>(null);

  useEffect(() => {
    const initial = readCalibration();
    setState(initial.state);
    setTs(initial.ts);
    setAgeDays(initial.ageDays);
    setQuality(initial.quality);
    setErrorPx(initial.errorPx);
  }, []);

  const markCalibrated = useCallback((metrics?: { quality?: number; errorPx?: number }) => {
    if (typeof window === "undefined") return;
    const now = Date.now();
    window.localStorage.setItem(KEY_TS, String(now));
    window.localStorage.setItem(KEY_VERSION, String(CALIBRATION_VERSION));
    if (typeof metrics?.quality === "number" && Number.isFinite(metrics.quality)) {
      window.localStorage.setItem(KEY_QUALITY, String(metrics.quality));
      setQuality(metrics.quality);
    } else {
      window.localStorage.removeItem(KEY_QUALITY);
      setQuality(null);
    }
    if (typeof metrics?.errorPx === "number" && Number.isFinite(metrics.errorPx)) {
      window.localStorage.setItem(KEY_ERROR, String(metrics.errorPx));
      setErrorPx(metrics.errorPx);
    } else {
      window.localStorage.removeItem(KEY_ERROR);
      setErrorPx(null);
    }
    setState("fresh");
    setTs(now);
    setAgeDays(0);
  }, []);

  const clearCalibration = useCallback(() => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(KEY_TS);
    window.localStorage.removeItem(KEY_VERSION);
    window.localStorage.removeItem(KEY_QUALITY);
    window.localStorage.removeItem(KEY_ERROR);
    window.localStorage.removeItem(KEY_TRANSFORM);
    setState("missing");
    setTs(null);
    setAgeDays(null);
    setQuality(null);
    setErrorPx(null);
  }, []);

  const needsCalibration = useMemo(() => state !== "fresh", [state]);

  return {
    calibrationState: state,
    calibratedAt: ts,
    calibrationAgeDays: ageDays,
    calibrationQuality: quality,
    calibrationErrorPx: errorPx,
    needsCalibration,
    markCalibrated,
    clearCalibration,
  };
}

export function readCalibrationTransform(): EyeCalibrationTransform | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY_TRANSFORM);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as EyeCalibrationTransform;
    if (
      !Number.isFinite(parsed?.a) ||
      !Number.isFinite(parsed?.b) ||
      !Number.isFinite(parsed?.c) ||
      !Number.isFinite(parsed?.d) ||
      !Number.isFinite(parsed?.e) ||
      !Number.isFinite(parsed?.f)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeCalibrationTransform(transform: EyeCalibrationTransform | null) {
  if (typeof window === "undefined") return;
  if (!transform) {
    window.localStorage.removeItem(KEY_TRANSFORM);
    return;
  }
  window.localStorage.setItem(KEY_TRANSFORM, JSON.stringify(transform));
  window.dispatchEvent(new CustomEvent("nb_eye_calibration_updated", { detail: transform }));
}
