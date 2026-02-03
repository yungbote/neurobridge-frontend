import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";

type CalibrationPoint = { x: number; y: number };
type CalibrationPhase = "baseline" | "adaptive" | "validate";
type GazeSample = { x: number; y: number; confidence: number; ts: number };

type CalibrationResult = {
  quality: number;
  errorPx: number;
  samples: number;
};

type CalibrationPointResult = {
  point: CalibrationPoint;
  predicted: CalibrationPoint | null;
  errorPx: number;
  samples: number;
  phase: CalibrationPhase;
};

const SAMPLE_COUNT = Number(import.meta.env.VITE_EYE_TRACKING_CALIBRATION_SAMPLE_COUNT) || 10;
const SAMPLE_MIN = Number(import.meta.env.VITE_EYE_TRACKING_CALIBRATION_MIN_SAMPLES) || 6;
const SAMPLE_DELAY_MS = Number(import.meta.env.VITE_EYE_TRACKING_CALIBRATION_SAMPLE_DELAY_MS) || 70;
const SAMPLE_MAX_MS = Number(import.meta.env.VITE_EYE_TRACKING_CALIBRATION_MAX_MS) || 4200;
const ADAPTIVE_POINTS = Number(import.meta.env.VITE_EYE_TRACKING_CALIBRATION_ADAPTIVE_POINTS) || 3;
const VALIDATE_POINTS = Number(import.meta.env.VITE_EYE_TRACKING_CALIBRATION_VALIDATE_POINTS) || 5;
const MIN_QUALITY = Number(import.meta.env.VITE_EYE_TRACKING_CALIBRATION_MIN_QUALITY) || 0.45;
const TARGET_ERROR = Number(import.meta.env.VITE_EYE_TRACKING_CALIBRATION_TARGET_ERROR_PX) || 120;
const MIN_CONFIDENCE = Number(import.meta.env.VITE_EYE_TRACKING_MIN_CONFIDENCE) || 0.35;
const MAX_VELOCITY = Number(import.meta.env.VITE_EYE_TRACKING_MAX_VELOCITY_PX_S) || 1400;
const READY_TIMEOUT_MS = Number(import.meta.env.VITE_EYE_TRACKING_CALIBRATION_READY_TIMEOUT_MS) || 3500;
const CAL_MARGIN_PCT = Number(import.meta.env.VITE_EYE_TRACKING_CALIBRATION_MARGIN_PCT) || 0.1;
const CAL_MARGIN_MIN = Number(import.meta.env.VITE_EYE_TRACKING_CALIBRATION_MARGIN_MIN_PX) || 32;
const EDGE_EXTRA_SAMPLES = Number(import.meta.env.VITE_EYE_TRACKING_CALIBRATION_EDGE_EXTRA_SAMPLES) || 4;
const EDGE_DELAY_MS = Number(import.meta.env.VITE_EYE_TRACKING_CALIBRATION_EDGE_DELAY_MS) || 40;
const EDGE_MAX_MS_BONUS = Number(import.meta.env.VITE_EYE_TRACKING_CALIBRATION_EDGE_MAX_MS_BONUS) || 1200;
const POINT_RETRY_MAX = Number(import.meta.env.VITE_EYE_TRACKING_CALIBRATION_POINT_RETRY_MAX) || 2;
const POINT_MAX_ERROR_PX = Number(import.meta.env.VITE_EYE_TRACKING_CALIBRATION_POINT_MAX_ERROR_PX) || 180;
const EDGE_BIAS_PCT = Number(import.meta.env.VITE_EYE_TRACKING_CALIBRATION_EDGE_BIAS_PCT) || 0.12;
const READY_POLL_MS = 80;

function getWebgazerVideoElement(): HTMLVideoElement | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const wg = (window as unknown as { webgazer?: { params?: { videoElementId?: string } } }).webgazer;
  const id = wg?.params?.videoElementId || "webgazerVideoFeed";
  return document.getElementById(id) as HTMLVideoElement | null;
}

function isWebgazerReady(): boolean {
  if (typeof window === "undefined") return false;
  const wg = (window as unknown as { webgazer?: { isReady?: () => boolean } }).webgazer;
  if (!wg || typeof wg.isReady !== "function") return false;
  if (!wg.isReady()) return false;
  const video = getWebgazerVideoElement();
  if (!video) return false;
  const widthReady = (video.videoWidth || video.clientWidth || 0) > 1;
  const heightReady = (video.videoHeight || video.clientHeight || 0) > 1;
  return widthReady && heightReady;
}

async function waitForWebgazerReady(timeoutMs: number): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    if (isWebgazerReady()) return true;
    await new Promise((resolve) => window.setTimeout(resolve, READY_POLL_MS));
  }
  return isWebgazerReady();
}

function computeMargins(width: number, height: number, pct: number) {
  const marginX = Math.max(CAL_MARGIN_MIN, Math.round(width * pct));
  const marginY = Math.max(CAL_MARGIN_MIN, Math.round(height * pct));
  return { marginX, marginY };
}

function buildPoints(width: number, height: number): CalibrationPoint[] {
  const { marginX, marginY } = computeMargins(width, height, CAL_MARGIN_PCT);
  const left = marginX;
  const right = width - marginX;
  const top = marginY;
  const bottom = height - marginY;
  const centerX = Math.round(width / 2);
  const centerY = Math.round(height / 2);
  return [
    { x: left, y: top },
    { x: centerX, y: top },
    { x: right, y: top },
    { x: left, y: centerY },
    { x: centerX, y: centerY },
    { x: right, y: centerY },
    { x: left, y: bottom },
    { x: centerX, y: bottom },
    { x: right, y: bottom },
  ];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function dedupePoints(points: CalibrationPoint[]): CalibrationPoint[] {
  const seen = new Set<string>();
  return points.filter((pt) => {
    const key = `${Math.round(pt.x)}:${Math.round(pt.y)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildAdaptivePoints(points: CalibrationPoint[], width: number, height: number) {
  const { marginX, marginY } = computeMargins(width, height, Math.max(0.06, CAL_MARGIN_PCT * 0.7));
  const offsetX = Math.max(18, Math.round(width * 0.05));
  const offsetY = Math.max(18, Math.round(height * 0.05));
  const adaptive = points.flatMap((pt) => [
    { x: clamp(pt.x - offsetX, marginX, width - marginX), y: pt.y },
    { x: clamp(pt.x + offsetX, marginX, width - marginX), y: pt.y },
    { x: pt.x, y: clamp(pt.y - offsetY, marginY, height - marginY) },
    { x: pt.x, y: clamp(pt.y + offsetY, marginY, height - marginY) },
  ]);
  return dedupePoints(adaptive);
}

function buildValidationPoints(width: number, height: number): CalibrationPoint[] {
  const { marginX, marginY } = computeMargins(width, height, Math.min(0.18, CAL_MARGIN_PCT + 0.04));
  const left = marginX;
  const right = width - marginX;
  const top = marginY;
  const bottom = height - marginY;
  const centerX = Math.round(width / 2);
  const centerY = Math.round(height / 2);
  const points = [
    { x: centerX, y: centerY },
    { x: centerX, y: top },
    { x: centerX, y: bottom },
    { x: left, y: centerY },
    { x: right, y: centerY },
  ];
  return points.slice(0, Math.max(1, VALIDATE_POINTS));
}

function distance(a: CalibrationPoint, b: CalibrationPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function averagePoint(samples: GazeSample[]): CalibrationPoint | null {
  if (!samples.length) return null;
  const sum = samples.reduce(
    (acc, s) => {
      acc.x += s.x;
      acc.y += s.y;
      return acc;
    },
    { x: 0, y: 0 }
  );
  return { x: sum.x / samples.length, y: sum.y / samples.length };
}

function median(values: number[]): number {
  if (!values.length) return Number.POSITIVE_INFINITY;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function trimmedMean(values: number[], trimPct: number): number {
  if (!values.length) return Number.POSITIVE_INFINITY;
  const sorted = [...values].sort((a, b) => a - b);
  const trim = Math.floor(sorted.length * trimPct);
  const start = clamp(trim, 0, sorted.length - 1);
  const end = clamp(sorted.length - trim, start + 1, sorted.length);
  const slice = sorted.slice(start, end);
  const sum = slice.reduce((acc, v) => acc + v, 0);
  return slice.length ? sum / slice.length : sorted[Math.floor(sorted.length / 2)];
}

function edgeScore(point: CalibrationPoint, width: number, height: number) {
  const { marginX, marginY } = computeMargins(width, height, CAL_MARGIN_PCT);
  const edgeX = Math.min(point.x, width - point.x) <= marginX * 1.15;
  const edgeY = Math.min(point.y, height - point.y) <= marginY * 1.15;
  const bottomBias = point.y >= height * (1 - EDGE_BIAS_PCT);
  return edgeX || edgeY || bottomBias;
}

function centerWeight(point: CalibrationPoint, width: number, height: number) {
  const centerX = width / 2;
  const centerY = height / 2;
  const nx = Math.min(1, Math.abs(point.x - centerX) / Math.max(1, centerX));
  const ny = Math.min(1, Math.abs(point.y - centerY) / Math.max(1, centerY));
  const edge = Math.max(nx, ny);
  return 0.6 + 0.4 * (1 - edge);
}

function weightedMean(values: number[], weights: number[]) {
  if (!values.length) return Number.POSITIVE_INFINITY;
  let sum = 0;
  let wsum = 0;
  for (let i = 0; i < values.length; i += 1) {
    const w = weights[i] ?? 1;
    if (!Number.isFinite(values[i]) || !Number.isFinite(w)) continue;
    sum += values[i] * w;
    wsum += w;
  }
  return wsum > 0 ? sum / wsum : Number.POSITIVE_INFINITY;
}

async function collectSamples({
  point,
  record,
  getGaze,
  ensureReady,
  sampleCount,
  sampleDelayMs,
  sampleMaxMs,
  runIdRef,
}: {
  point: CalibrationPoint;
  record: boolean;
  getGaze?: () => GazeSample | null;
  ensureReady?: () => Promise<boolean>;
  sampleCount: number;
  sampleDelayMs: number;
  sampleMaxMs: number;
  runIdRef: { current: number };
}): Promise<CalibrationPointResult | null> {
  const wg = (window as unknown as { webgazer?: { recordScreenPosition?: (x: number, y: number, type?: string) => void } })
    .webgazer;
  if (record && !wg?.recordScreenPosition) return null;
  if (record && ensureReady) {
    const ready = await ensureReady();
    if (!ready) return null;
  }

  const samples: GazeSample[] = [];
  let last: GazeSample | null = null;
  let stableRun = 0;
  const start = performance.now();
  const runId = runIdRef.current;

  while (samples.length < sampleCount && performance.now() - start < sampleMaxMs) {
    if (runIdRef.current !== runId) return null;
    await new Promise((resolve) => window.setTimeout(resolve, sampleDelayMs));
    const gaze = getGaze?.();
    if (!gaze) continue;
    if (!Number.isFinite(gaze.x) || !Number.isFinite(gaze.y)) continue;
    if (gaze.confidence < MIN_CONFIDENCE) {
      stableRun = 0;
      last = gaze;
      continue;
    }
    const dt = last ? Math.max(1, gaze.ts - last.ts) : 16;
    const velocity = last ? Math.hypot(gaze.x - last.x, gaze.y - last.y) / (dt / 1000) : 0;
    last = gaze;
    if (velocity > MAX_VELOCITY) {
      stableRun = 0;
      continue;
    }
    stableRun += 1;
    if (stableRun < 2) continue;
    stableRun = 0;
    samples.push(gaze);
    if (record && wg?.recordScreenPosition && (!ensureReady || isWebgazerReady())) {
      wg.recordScreenPosition(point.x, point.y, "click");
    }
  }

  const predicted = averagePoint(samples);
  const errorPx = predicted ? distance(predicted, point) : Number.POSITIVE_INFINITY;

  return {
    point,
    predicted,
    errorPx,
    samples: samples.length,
    phase: record ? "baseline" : "validate",
  };
}

export function EyeCalibrationOverlay({
  open,
  onClose,
  onComplete,
  getGaze,
}: {
  open: boolean;
  onClose: () => void;
  onComplete: (result: CalibrationResult) => void;
  getGaze?: () => GazeSample | null;
}) {
  const [points, setPoints] = useState<CalibrationPoint[]>([]);
  const [phase, setPhase] = useState<CalibrationPhase>("baseline");
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [results, setResults] = useState<CalibrationPointResult[]>([]);
  const runIdRef = useRef(0);
  const retryCountsRef = useRef<Map<string, number>>(new Map());

  const readGaze = useCallback((): GazeSample | null => {
    if (getGaze) {
      const sample = getGaze();
      if (sample) return sample;
      // If a direct stream is empty, allow a safe fallback only when WebGazer is ready.
      if (!isWebgazerReady()) return null;
    }
    const wg = (window as unknown as { webgazer?: { getCurrentPrediction?: () => { x: number; y: number } | null; isReady?: () => boolean } })
      .webgazer;
    if (!wg?.getCurrentPrediction) return null;
    if (!isWebgazerReady()) return null;
    try {
      const prediction = wg.getCurrentPrediction();
      if (!prediction || !Number.isFinite(prediction.x) || !Number.isFinite(prediction.y)) return null;
      return { x: prediction.x, y: prediction.y, confidence: 0.4, ts: Date.now() };
    } catch {
      return null;
    }
  }, [getGaze]);

  useEffect(() => {
    if (!open) return;
    runIdRef.current += 1;
    setStep(0);
    setPhase("baseline");
    setBusy(false);
    setError(null);
    setWarning(null);
    setResults([]);
    retryCountsRef.current.clear();
    const update = () => {
      setPoints(buildPoints(window.innerWidth, window.innerHeight));
    };
    update();
    window.addEventListener("resize", update);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const wg = (window as unknown as { webgazer?: { clearData?: () => void } }).webgazer;
    wg?.clearData?.();
    return () => {
      window.removeEventListener("resize", update);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const current = points[step];
  const total = points.length || 0;

  const handleClick = useCallback(async () => {
    if (!current || busy) return;
    setBusy(true);
    setError(null);
    setWarning(null);
    const record = phase !== "validate";
    const width = window.innerWidth;
    const height = window.innerHeight;
    const isEdge = edgeScore(current, width, height);
    const localSampleCount = SAMPLE_COUNT + (isEdge ? EDGE_EXTRA_SAMPLES : 0);
    const localDelay = SAMPLE_DELAY_MS + (isEdge ? EDGE_DELAY_MS : 0);
    const localMaxMs = SAMPLE_MAX_MS + (isEdge ? EDGE_MAX_MS_BONUS : 0);
    const retryKey = `${Math.round(current.x)}:${Math.round(current.y)}:${phase}`;
    const retries = retryCountsRef.current.get(retryKey) ?? 0;
    const result = await collectSamples({
      point: current,
      record,
      getGaze: readGaze,
      ensureReady: () => waitForWebgazerReady(READY_TIMEOUT_MS),
      sampleCount: localSampleCount,
      sampleDelayMs: localDelay,
      sampleMaxMs: localMaxMs,
      runIdRef,
    });
    if (!result) {
      setBusy(false);
      setError("Eye tracking not available.");
      return;
    }
    if (result.samples === 0) {
      setBusy(false);
      setError("Eye tracking not ready. Make sure the camera is on and try again.");
      return;
    }
    if (result.samples < SAMPLE_MIN) {
      setBusy(false);
      setError("Keep your gaze steady and try again.");
      return;
    }
    if (Number.isFinite(result.errorPx) && result.errorPx > POINT_MAX_ERROR_PX && retries < POINT_RETRY_MAX) {
      retryCountsRef.current.set(retryKey, retries + 1);
      setBusy(false);
      setWarning("That point was unstable. Try again and keep your gaze steady.");
      return;
    }

    const nextResults = [...results, { ...result, phase }];
    setResults(nextResults);

    if (step + 1 < total) {
      setStep((prev) => prev + 1);
      setBusy(false);
      return;
    }

    if (phase === "baseline") {
      const baseline = nextResults.filter((r) => r.phase === "baseline" && Number.isFinite(r.errorPx));
      const worst = baseline
        .slice()
        .sort((a, b) => b.errorPx - a.errorPx)
        .slice(0, Math.max(0, ADAPTIVE_POINTS));
      const adaptivePoints = buildAdaptivePoints(
        worst.map((r) => r.point),
        window.innerWidth,
        window.innerHeight
      );
      if (adaptivePoints.length > 0) {
        setPhase("adaptive");
        setPoints(adaptivePoints);
        setStep(0);
        setBusy(false);
        return;
      }
      setPhase("validate");
      setPoints(buildValidationPoints(window.innerWidth, window.innerHeight));
      setStep(0);
      setBusy(false);
      return;
    }

    if (phase === "adaptive") {
      setPhase("validate");
      setPoints(buildValidationPoints(window.innerWidth, window.innerHeight));
      setStep(0);
      setBusy(false);
      return;
    }

    const validation = nextResults.filter((r) => r.phase === "validate" && Number.isFinite(r.errorPx));
    const errors = validation.map((r) => r.errorPx).filter((v) => Number.isFinite(v));
    const weights = validation.map((r) => centerWeight(r.point, window.innerWidth, window.innerHeight));
    const diag = Math.hypot(window.innerWidth || 0, window.innerHeight || 0);
    const dynamicTarget = diag > 0 ? clamp(diag * 0.12, 120, 260) : TARGET_ERROR;
    const weighted = errors.length > 0 ? weightedMean(errors, weights.slice(0, errors.length)) : Number.POSITIVE_INFINITY;
    const robustError = errors.length > 2 ? trimmedMean(errors, 0.2) : median(errors);
    const blendedError = Number.isFinite(weighted) ? (robustError + weighted) / 2 : robustError;
    const quality = Number.isFinite(blendedError) ? clamp(1 - blendedError / dynamicTarget, 0, 1) : 0;
    if (quality < MIN_QUALITY) {
      setWarning(
        `Calibration quality is low (${Math.round(quality * 100)}%, ~${Math.round(
          blendedError
        )}px error). Try again from a steady position with good lighting.`
      );
      setBusy(false);
      return;
    }
    setBusy(false);
    onComplete({ quality, errorPx: blendedError, samples: nextResults.length });
    onClose();
  }, [busy, current, getGaze, onClose, onComplete, phase, readGaze, results, step, total]);

  const handleRetry = useCallback(() => {
    runIdRef.current += 1;
    setPhase("baseline");
    setPoints(buildPoints(window.innerWidth, window.innerHeight));
    setStep(0);
    setResults([]);
    setError(null);
    setWarning(null);
  }, []);

  const content = useMemo(() => {
    if (!open) return null;
    const phaseLabel =
      phase === "baseline" ? "Baseline" : phase === "adaptive" ? "Refine" : "Validate";
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/90 backdrop-blur-sm">
        <div className="pointer-events-none absolute inset-0" />
        <div className="pointer-events-auto absolute left-1/2 top-8 w-[92%] max-w-lg -translate-x-1/2 rounded-2xl border border-border/60 bg-background/95 p-4 shadow-xl">
          <div className="text-sm font-semibold text-foreground">Eye tracking calibration</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {phaseLabel} phase: look at the dot and click it. Keep your gaze steady until it moves.
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            {total > 0 ? `Point ${Math.min(step + 1, total)} of ${total}` : "Preparing…"}
          </div>
          {error ? <div className="mt-2 text-xs text-rose-500">{error}</div> : null}
          {warning ? <div className="mt-2 text-xs text-amber-500">{warning}</div> : null}
          <div className="mt-3 flex items-center justify-between gap-2">
            {warning ? (
              <Button size="sm" variant="outline" onClick={handleRetry} disabled={busy}>
                Retry calibration
              </Button>
            ) : (
              <div />
            )}
            <Button size="sm" variant="outline" onClick={onClose} disabled={busy}>
              Skip
            </Button>
          </div>
        </div>

        {current ? (
          <button
            type="button"
            onClick={handleClick}
            disabled={busy}
            className={cn(
              "absolute h-7 w-7 rounded-full border-2 border-primary/80 bg-primary/20 shadow-lg",
              "transition-transform duration-150",
              busy ? "opacity-60" : "opacity-100"
            )}
            style={{
              left: `${current.x}px`,
              top: `${current.y}px`,
              transform: "translate(-50%, -50%)",
            }}
            aria-label="Calibration target"
          />
        ) : null}
      </div>
    );
  }, [busy, current, error, handleClick, handleRetry, onClose, open, phase, step, total, warning]);

  if (!open) return null;
  return createPortal(content, document.body);
}
