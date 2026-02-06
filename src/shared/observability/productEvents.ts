import { queueEvent } from "@/shared/services/EventQueue";

type EventContext = {
  pathId?: string;
  pathNodeId?: string;
  activityId?: string;
  activityVariant?: string;
  modality?: string;
  conceptIds?: string[];
  data?: Record<string, unknown>;
};

function normalizeString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    const s = value.trim();
    return s || fallback;
  }
  if (value == null) return fallback;
  const s = String(value).trim();
  return s || fallback;
}

function emitEvent(type: string, payload: Record<string, unknown>, ctx?: EventContext): void {
  if (!type) return;
  queueEvent({
    type,
    pathId: ctx?.pathId,
    pathNodeId: ctx?.pathNodeId,
    activityId: ctx?.activityId,
    activityVariant: ctx?.activityVariant,
    modality: ctx?.modality,
    conceptIds: ctx?.conceptIds,
    data: { ...(ctx?.data ?? {}), ...payload },
  });
}

export function trackExperimentExposure(
  experiment: string,
  variant: string,
  source?: string,
  ctx?: EventContext
): void {
  const exp = normalizeString(experiment);
  const varnt = normalizeString(variant);
  if (!exp || !varnt) return;
  emitEvent(
    "experiment_exposure",
    {
      experiment: exp,
      variant: varnt,
      source: normalizeString(source, "unknown"),
    },
    ctx
  );
}

export function trackExperimentGuardrailBreach(
  experiment: string,
  guardrail: string,
  ctx?: EventContext
): void {
  const exp = normalizeString(experiment);
  const gr = normalizeString(guardrail);
  if (!exp || !gr) return;
  emitEvent(
    "experiment_guardrail_breach",
    {
      experiment: exp,
      guardrail: gr,
    },
    ctx
  );
}

export function trackEngagementFunnelStep(
  funnel: string,
  step: string,
  ctx?: EventContext
): void {
  const fn = normalizeString(funnel);
  const st = normalizeString(step);
  if (!fn || !st) return;
  emitEvent(
    "engagement_funnel_step",
    {
      funnel: fn,
      step: st,
    },
    ctx
  );
}

export function trackCostTelemetry(
  category: string,
  amountUsd: number,
  source?: string,
  ctx?: EventContext
): void {
  const cat = normalizeString(category);
  const amt = Number.isFinite(amountUsd) ? amountUsd : 0;
  if (!cat || amt <= 0) return;
  emitEvent(
    "cost_telemetry",
    {
      category: cat,
      amount_usd: amt,
      source: normalizeString(source, "unknown"),
    },
    ctx
  );
}

export function trackSecurityEvent(event: string, ctx?: EventContext): void {
  const ev = normalizeString(event);
  if (!ev) return;
  emitEvent(
    "security_event",
    {
      event: ev,
    },
    ctx
  );
}
