import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

type CalibrationPoint = { x: number; y: number };

const SAMPLE_COUNT = 6;
const SAMPLE_DELAY_MS = 60;

function buildPoints(width: number, height: number): CalibrationPoint[] {
  const marginX = Math.max(24, Math.round(width * 0.08));
  const marginY = Math.max(24, Math.round(height * 0.08));
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

async function recordSamples(x: number, y: number) {
  const wg = (window as unknown as { webgazer?: { recordScreenPosition?: (x: number, y: number, type?: string) => void } })
    .webgazer;
  if (!wg?.recordScreenPosition) return false;
  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    wg.recordScreenPosition(x, y, "click");
    // Small delay improves sample diversity.
    await new Promise((resolve) => window.setTimeout(resolve, SAMPLE_DELAY_MS));
  }
  return true;
}

export function EyeCalibrationOverlay({
  open,
  onClose,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [points, setPoints] = useState<CalibrationPoint[]>([]);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setBusy(false);
    setError(null);
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
    const ok = await recordSamples(current.x, current.y);
    if (!ok) {
      setBusy(false);
      setError("Eye tracking not available.");
      return;
    }
    setBusy(false);
    if (step + 1 >= total) {
      onComplete();
      onClose();
    } else {
      setStep((prev) => prev + 1);
    }
  }, [busy, current, onClose, onComplete, step, total]);

  const content = useMemo(() => {
    if (!open) return null;
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/90 backdrop-blur-sm">
        <div className="pointer-events-none absolute inset-0" />
        <div className="pointer-events-auto absolute left-1/2 top-8 w-[92%] max-w-lg -translate-x-1/2 rounded-2xl border border-border/60 bg-background/95 p-4 shadow-xl">
          <div className="text-sm font-semibold text-foreground">Eye tracking calibration</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Look at the dot and click it. Repeat for each position.
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            {total > 0 ? `Point ${Math.min(step + 1, total)} of ${total}` : "Preparing…"}
          </div>
          {error ? <div className="mt-2 text-xs text-rose-500">{error}</div> : null}
          <div className="mt-3 flex items-center justify-end gap-2">
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
  }, [busy, current, error, handleClick, onClose, open, step, total]);

  if (!open) return null;
  return createPortal(content, document.body);
}
