import { useCallback, useEffect, useMemo, useState } from "react";

export type EyeCalibrationState = "missing" | "stale" | "fresh";

const CALIBRATION_VERSION = 1;
const KEY_TS = "nb_eye_calibrated_at";
const KEY_VERSION = "nb_eye_calibration_v";

function getMaxAgeDays(): number {
  const raw = Number(import.meta.env.VITE_EYE_TRACKING_CALIBRATION_MAX_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : 30;
}

function readCalibration(): { state: EyeCalibrationState; ts: number | null; ageDays: number | null } {
  if (typeof window === "undefined") return { state: "missing", ts: null, ageDays: null };
  const version = window.localStorage.getItem(KEY_VERSION);
  if (!version || Number(version) !== CALIBRATION_VERSION) {
    return { state: "missing", ts: null, ageDays: null };
  }
  const tsRaw = window.localStorage.getItem(KEY_TS);
  const ts = tsRaw ? Number(tsRaw) : 0;
  if (!ts || !Number.isFinite(ts)) return { state: "missing", ts: null, ageDays: null };
  const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  if (!Number.isFinite(ageDays)) return { state: "missing", ts, ageDays: null };
  return { state: ageDays > getMaxAgeDays() ? "stale" : "fresh", ts, ageDays };
}

export function useEyeCalibration() {
  const [state, setState] = useState<EyeCalibrationState>("missing");
  const [ts, setTs] = useState<number | null>(null);
  const [ageDays, setAgeDays] = useState<number | null>(null);

  useEffect(() => {
    const initial = readCalibration();
    setState(initial.state);
    setTs(initial.ts);
    setAgeDays(initial.ageDays);
  }, []);

  const markCalibrated = useCallback(() => {
    if (typeof window === "undefined") return;
    const now = Date.now();
    window.localStorage.setItem(KEY_TS, String(now));
    window.localStorage.setItem(KEY_VERSION, String(CALIBRATION_VERSION));
    setState("fresh");
    setTs(now);
    setAgeDays(0);
  }, []);

  const clearCalibration = useCallback(() => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(KEY_TS);
    window.localStorage.removeItem(KEY_VERSION);
    setState("missing");
    setTs(null);
    setAgeDays(null);
  }, []);

  const needsCalibration = useMemo(() => state !== "fresh", [state]);

  return {
    calibrationState: state,
    calibratedAt: ts,
    calibrationAgeDays: ageDays,
    needsCalibration,
    markCalibrated,
    clearCalibration,
  };
}
