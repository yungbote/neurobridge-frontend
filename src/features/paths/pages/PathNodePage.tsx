import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/ui/sheet";
import { Separator } from "@/shared/ui/separator";
import { Textarea } from "@/shared/ui/textarea";
import { cn } from "@/shared/lib/utils";
import { Skeleton, SkeletonText } from "@/shared/ui/skeleton";

import { createChatThread, getChatThread, listChatMessages, sendChatMessage } from "@/shared/api/ChatService";
import { queueEvent } from "@/shared/services/EventQueue";
import { queueSessionPatch } from "@/shared/services/SessionStateTracker";
import { getConceptGraph } from "@/shared/api/PathService";
import {
  enqueuePathNodeDocPatch,
  generateDrillForNode,
  getPathNodeDoc,
  listDrillsForNode,
  listPathNodeDocRevisions,
} from "@/shared/api/PathNodeService";
import { getPathRuntime } from "@/shared/api/RuntimeService";
import { GazeQueue } from "@/shared/services/GazeQueue";
import { NodeContentRenderer } from "@/features/paths/components/NodeContentRenderer";
import { Flashcard, NodeDocRenderer, QuickCheck } from "@/features/paths/components/NodeDocRenderer";
import { Container } from "@/shared/layout/Container";
import { queryKeys } from "@/shared/query/queryKeys";
import { CodeBlock, InlineCode } from "@/shared/components/CodeBlock";
import { useSSEContext } from "@/app/providers/SSEProvider";
import { useUser } from "@/app/providers/UserProvider";
import { usePaths } from "@/app/providers/PathProvider";
import { useChatDock } from "@/app/providers/ChatDockProvider";
import { useLessons } from "@/app/providers/LessonProvider";
import { useI18n } from "@/app/providers/I18nProvider";
import { useEyeTracking } from "@/shared/hooks/useEyeTracking";
import { useEyeTrackingPreference } from "@/shared/hooks/useEyeTrackingPreference";
import { useEyeCalibration } from "@/shared/hooks/useEyeCalibration";
import { EyeCalibrationOverlay } from "@/shared/components/EyeCalibrationOverlay";
import {
  asRecord,
  messageKindFromMetadata,
  normalizeProposalText,
  parseNodeDocEditProposal,
  stringFromMetadata,
  type NodeDocEditProposal,
} from "@/shared/lib/nodeDocEdit";
import type { DrillPayloadV1 } from "@/shared/types/drillPayloadV1";
import type { BackendJob } from "@/shared/types/backend";
import type {
  DrillSpec,
  JsonInput,
  NodeDocRevision,
  Path,
  PathNode,
} from "@/shared/types/models";
import type { JobEventPayload, RuntimePromptPayload } from "@/shared/types/models";

type DocBlock = {
  id?: string;
  type?: string;
  [key: string]: unknown;
};

type LineRect = {
  id: string;
  index: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
  height: number;
  width: number;
};

type LineState = LineRect & {
  blockId: string;
  centerY: number;
};

type ProgressState = "idle" | "progressing" | "scanning" | "searching";

type ProgressEntry = {
  id: string;
  index: number;
  at: number;
  confidence: number;
  ratio: number;
  source: "behavioral" | "gaze" | "unknown";
  engagedMs?: number;
  direction?: "forward" | "back";
  jump?: number;
};

type BlockFeedback = "" | "like" | "dislike";

const VISIBLE_RATIO_MIN = 0.1;
const CURRENT_RATIO_MIN = 0.25;
const MAX_VISIBLE_BLOCKS = 20;
const SESSION_SYNC_MIN_INTERVAL_MS = 350;
const SESSION_SYNC_IDLE_MS = 180;
const SESSION_SYNC_MAX_LATENCY_MS = 1400;
const READ_VISIBLE_RATIO_MIN = 0.45;
const READ_CREDIT_THRESHOLD = 0.7;
const READ_TICK_MS = 200;
const READ_LINE_RATIO = 0.4;
const READ_MAX_SCREENS_PER_SEC = 2.2;
const READ_MIN_WEIGHT = 0.08;
const PROGRESS_TICK_MS = 240;
const PROGRESS_ENGAGE_BASE_MS = 700;
const PROGRESS_ENGAGE_PER_SEC_MS = 200;
const PROGRESS_ENGAGE_MIN_MS = 800;
const PROGRESS_ENGAGE_MAX_MS = 2400;
const PROGRESS_ENGAGE_CONF_MIN = 0.6;
const PROGRESS_ENGAGE_RATIO_MIN = 0.5;
const PROGRESS_MAX_SCREENS_PER_SEC = 0.5;
const PROGRESS_SCAN_SCREENS_PER_SEC = 1.2;
const PROGRESS_MAX_FORWARD_JUMP = 4;
const PROGRESS_WINDOW_MS = 120_000;
const PROGRESS_MIN_FORWARD = 2;
const PROGRESS_MIN_FORWARD_RATIO = 0.7;
const PROGRESS_MIN_REGRESSION = 2;
const PROGRESS_ACTIVE_CHANGE_WINDOW_MS = 5000;
const PROGRESS_ACTIVE_CHANGE_MIN = 4;
const rawGazeTickMs = Number(import.meta.env.VITE_EYE_TRACKING_TICK_MS);
const GAZE_TICK_MS = Number.isFinite(rawGazeTickMs) && rawGazeTickMs > 0 ? rawGazeTickMs : 120;
const rawGazeConfidence = Number(import.meta.env.VITE_EYE_TRACKING_MIN_CONFIDENCE);
const GAZE_MIN_CONFIDENCE =
  Number.isFinite(rawGazeConfidence) && rawGazeConfidence > 0 ? rawGazeConfidence : 0.4;
const rawGazeMaxVelocity = Number(import.meta.env.VITE_EYE_TRACKING_MAX_VELOCITY_PX_S);
const GAZE_MAX_VELOCITY_PX_S =
  Number.isFinite(rawGazeMaxVelocity) && rawGazeMaxVelocity > 0 ? rawGazeMaxVelocity : 1200;
const rawLineFixationMs = Number(import.meta.env.VITE_EYE_TRACKING_LINE_MIN_FIXATION_MS);
const LINE_MIN_FIXATION_MS =
  Number.isFinite(rawLineFixationMs) && rawLineFixationMs > 0 ? rawLineFixationMs : 550;
const rawLineDistanceFactor = Number(import.meta.env.VITE_EYE_TRACKING_LINE_DISTANCE_FACTOR);
const LINE_DISTANCE_FACTOR =
  Number.isFinite(rawLineDistanceFactor) && rawLineDistanceFactor > 0 ? rawLineDistanceFactor : 1.1;
const rawLineXPadding = Number(import.meta.env.VITE_EYE_TRACKING_LINE_X_PADDING);
const LINE_X_PADDING =
  Number.isFinite(rawLineXPadding) && rawLineXPadding >= 0 ? rawLineXPadding : 24;
const rawLessonDebugOverlay = String(import.meta.env.VITE_LESSON_DEBUG_OVERLAY || "false").toLowerCase();
const LESSON_DEBUG_OVERLAY = !["false", "0", "no", ""].includes(rawLessonDebugOverlay);
const rawGazeBlockTtl = Number(import.meta.env.VITE_EYE_TRACKING_BLOCK_TTL_MS);
const GAZE_BLOCK_TTL_MS =
  Number.isFinite(rawGazeBlockTtl) && rawGazeBlockTtl > 0 ? rawGazeBlockTtl : 4000;
const rawSnapEnabled = String(import.meta.env.VITE_EYE_TRACKING_SNAP_ENABLED || "true").toLowerCase();
const GAZE_SNAP_ENABLED = !["false", "0", "no"].includes(rawSnapEnabled);
const rawSnapLineDist = Number(import.meta.env.VITE_EYE_TRACKING_SNAP_LINE_MAX_DIST_PX);
const GAZE_SNAP_LINE_MAX_DIST =
  Number.isFinite(rawSnapLineDist) && rawSnapLineDist >= 0 ? rawSnapLineDist : 18;
const rawSnapBlockDist = Number(import.meta.env.VITE_EYE_TRACKING_SNAP_BLOCK_MAX_DIST_PX);
const GAZE_SNAP_BLOCK_MAX_DIST =
  Number.isFinite(rawSnapBlockDist) && rawSnapBlockDist >= 0 ? rawSnapBlockDist : 80;
const rawLineStateEnabled = String(import.meta.env.VITE_EYE_TRACKING_LINE_STATE || "true").toLowerCase();
const LINE_STATE_ENABLED = !["false", "0", "no"].includes(rawLineStateEnabled);
const rawLineStateMaxJump = Number(import.meta.env.VITE_EYE_TRACKING_LINE_STATE_MAX_JUMP);
const LINE_STATE_MAX_JUMP = Number.isFinite(rawLineStateMaxJump) && rawLineStateMaxJump > 0 ? rawLineStateMaxJump : 4;
const rawLineStateMinConfidence = Number(import.meta.env.VITE_EYE_TRACKING_LINE_STATE_MIN_CONFIDENCE);
const LINE_STATE_MIN_CONFIDENCE =
  Number.isFinite(rawLineStateMinConfidence) && rawLineStateMinConfidence > 0
    ? rawLineStateMinConfidence
    : 0.32;
const rawLineStateGazeSigma = Number(import.meta.env.VITE_EYE_TRACKING_LINE_STATE_GAZE_SIGMA_MULT);
const LINE_STATE_GAZE_SIGMA_MULT =
  Number.isFinite(rawLineStateGazeSigma) && rawLineStateGazeSigma > 0 ? rawLineStateGazeSigma : 1.15;
const rawLineStateBehaviorSigma = Number(import.meta.env.VITE_EYE_TRACKING_LINE_STATE_BEHAVIOR_SIGMA_MULT);
const LINE_STATE_BEHAVIOR_SIGMA_MULT =
  Number.isFinite(rawLineStateBehaviorSigma) && rawLineStateBehaviorSigma > 0
    ? rawLineStateBehaviorSigma
    : 2.2;
const rawLineStateCache = Number(import.meta.env.VITE_EYE_TRACKING_LINE_STATE_CACHE_MS);
const LINE_STATE_CACHE_MS = Number.isFinite(rawLineStateCache) && rawLineStateCache >= 0 ? rawLineStateCache : 120;
const rawLineSnapStrict = String(import.meta.env.VITE_EYE_TRACKING_LINE_SNAP_STRICT || "false").toLowerCase();
const LINE_SNAP_STRICT = !["false", "0", "no"].includes(rawLineSnapStrict);
const GAZE_BIAS_MAX = 80;
const GAZE_BIAS_ALPHA = 0.12;

export function PathNodePageSkeleton({ embedded = false }: { embedded?: boolean } = {}) {
  const body = (
    <div className="mx-auto w-full max-w-5xl">
      {/* Header skeleton - responsive */}
      <div className="mb-6 sm:mb-8 space-y-2.5 sm:space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 sm:h-9 w-20 sm:w-24 rounded-full" />
          <Skeleton className="h-3.5 sm:h-4 w-32 sm:w-44 rounded-full" />
        </div>
        <Skeleton className="h-8 sm:h-10 w-[85%] sm:w-10/12 rounded-full" />
        <div className="flex flex-wrap gap-1.5 pt-1">
          {Array.from({ length: 6 }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Skeleton key={i} className="h-5 sm:h-6 w-16 sm:w-20 rounded-full" />
          ))}
        </div>
      </div>

      {/* Content skeleton - responsive */}
      <div className="rounded-xl sm:rounded-2xl border border-border/60 bg-card/70 shadow-sm backdrop-blur">
        <div className="px-4 py-6 sm:px-6 sm:py-8 md:px-8 md:py-10">
          <div className="space-y-4 sm:space-y-6">
            <Skeleton className="h-5 sm:h-6 w-36 sm:w-44 rounded-full" />
            <SkeletonText lines={4} className="max-w-[72ch]" />
            <Skeleton className="h-[160px] sm:h-[200px] md:h-[220px] w-full rounded-xl sm:rounded-2xl" />
            <SkeletonText lines={3} className="max-w-[72ch]" />
          </div>
        </div>
      </div>
    </div>
  );

  if (embedded) {
    return <div aria-busy="true">{body}</div>;
  }

  return (
    <div className="page-surface" aria-busy="true">
      <Container size="2xl" className="page-pad">
        {body}
      </Container>
    </div>
  );
}

const markdownCodeComponents = {
  code({
    inline,
    className,
    children,
  }: {
    inline?: boolean;
    className?: string;
    children?: React.ReactNode;
  }) {
    const raw = String(children || "");
    const m = /language-([a-zA-Z0-9_-]+)/.exec(className || "");
    const lang = m?.[1] || "";
    if (inline) return <InlineCode>{raw}</InlineCode>;
    return <CodeBlock language={lang}>{raw.replace(/\n$/, "")}</CodeBlock>;
  },
};

function safeParseJSON(v: unknown): unknown {
  if (!v) return null;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function extractBlockText(block: DocBlock): string {
  if (!block || typeof block !== "object") return "";
  const fields = [
    "title",
    "heading",
    "subtitle",
    "text",
    "body_md",
    "prompt_md",
    "answer_md",
    "front_md",
    "back_md",
    "content",
    "caption",
  ];
  const parts: string[] = [];
  for (const key of fields) {
    const val = (block as Record<string, unknown>)[key];
    if (typeof val === "string" && val.trim()) {
      parts.push(val);
    }
  }
  if (parts.length > 0) return parts.join(" ");
  try {
    return JSON.stringify(block);
  } catch {
    return "";
  }
}

function estimateReadSeconds(block: DocBlock): number {
  const raw = extractBlockText(block);
  const words = raw.trim().split(/\s+/).filter(Boolean).length;
  const base = words > 0 ? words / 3 : 1.2; // ~180 wpm
  const kind = String(block?.type ?? "").toLowerCase();
  let factor = 1;
  if (kind === "heading" || kind === "title") factor = 0.6;
  if (kind === "quick_check" || kind === "flashcard") factor = 0.75;
  return clamp(base * factor, 0.8, 12);
}

function resolvePayload(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

function getErrorMessage(err: unknown, fallback: string) {
  if (!err) return fallback;
  const apiErr = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
  if (typeof apiErr === "string" && apiErr.trim()) return apiErr;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function extractConceptKeys(node: PathNode | null | undefined) {
  const md = (safeParseJSON(node?.metadata) ?? node?.metadata) as Record<string, unknown> | null;
  const keys = (md?.concept_keys ?? md?.conceptKeys ?? []) as unknown[];
  if (!Array.isArray(keys)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  keys
    .map((k) => String(k || "").trim())
    .filter(Boolean)
    .forEach((k) => {
      if (seen.has(k)) return;
      seen.add(k);
      out.push(k);
    });
  return out;
}

function humanizeConceptKey(key: string) {
  const s = String(key || "").trim().replace(/_/g, " ");
  return s || key;
}

interface DrillProps {
  drill: DrillPayloadV1 | null;
}

function FlashcardsDrill({ drill }: DrillProps) {
  const { t } = useI18n();
  const cards = Array.isArray(drill?.cards) ? drill.cards : [];
  const [idx, setIdx] = useState(0);
  const [showBack, setShowBack] = useState(false);

  useEffect(() => {
    setIdx(0);
    setShowBack(false);
  }, [drill]);

  if (cards.length === 0) {
    return <div className="text-sm text-muted-foreground">{t("pathNode.drills.flashcards.empty")}</div>;
  }

  const card = cards[Math.min(Math.max(idx, 0), cards.length - 1)] || {};
  const front = String(card.front_md ?? "");
  const back = String(card.back_md ?? "");

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header row - responsive */}
      <div className="flex items-center justify-between text-[11px] xs:text-xs text-muted-foreground">
        <div className="font-medium">
          {t("pathNode.drills.flashcards.count", { current: idx + 1, total: cards.length })}
        </div>
        <button
          type="button"
          className={cn(
            "underline underline-offset-4 hover:text-foreground",
            // Touch-friendly sizing
            "min-h-[44px] px-2 py-2",
            "touch-manipulation -webkit-tap-highlight-color-transparent",
            "active:opacity-70"
          )}
          onClick={() => setShowBack((v) => !v)}
        >
          {showBack ? t("pathNode.drills.flashcards.showFront") : t("pathNode.drills.flashcards.showBack")}
        </button>
      </div>

      {/* Card content - responsive */}
      <div
        className={cn(
          "rounded-lg sm:rounded-xl border border-border bg-muted/30",
          "p-3 sm:p-4",
          "min-h-[160px] sm:min-h-[180px] flex items-center"
        )}
      >
        <div className="w-full text-sm sm:text-[15px] leading-relaxed text-foreground/90">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownCodeComponents}>
            {showBack ? back : front}
          </ReactMarkdown>
        </div>
      </div>

      {/* Navigation buttons - responsive */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <Button
          variant="outline"
          onClick={() => {
            setIdx((v) => Math.max(0, v - 1));
            setShowBack(false);
          }}
          disabled={idx <= 0}
          className={cn(
            "flex-1 sm:flex-none",
            "h-11 sm:h-10",
            "touch-manipulation -webkit-tap-highlight-color-transparent",
            "active:scale-[0.97]"
          )}
        >
          {t("common.previous")}
        </Button>
        <Button
          onClick={() => {
            setIdx((v) => Math.min(cards.length - 1, v + 1));
            setShowBack(false);
          }}
          disabled={idx >= cards.length - 1}
          className={cn(
            "flex-1 sm:flex-none",
            "h-11 sm:h-10",
            "touch-manipulation -webkit-tap-highlight-color-transparent",
            "active:scale-[0.97]"
          )}
        >
          {t("common.next")}
        </Button>
      </div>
    </div>
  );
}

function QuizDrill({
  drill,
  pathId,
  pathNodeId,
  defaultConceptKeys,
  conceptIdByKey,
}: DrillProps & {
  pathId: string;
  pathNodeId: string;
  defaultConceptKeys: string[];
  conceptIdByKey: Map<string, string>;
}) {
  const { t } = useI18n();
  const questions = Array.isArray(drill?.questions) ? drill.questions : [];
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const quizSessionIdRef = useRef<string>("");
  const questionShownAtRef = useRef<number>(Date.now());
  const attemptByQuestionIdRef = useRef<Record<string, number>>({});
  const firstAttemptStatsRef = useRef<{ correct: number; total: number; latencySum: number }>({
    correct: 0,
    total: 0,
    latencySum: 0,
  });
  const sentCompletedRef = useRef<boolean>(false);

  useEffect(() => {
    setIdx(0);
    setSelected(null);
    setRevealed(false);
    questionShownAtRef.current = Date.now();
    quizSessionIdRef.current = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    attemptByQuestionIdRef.current = {};
    firstAttemptStatsRef.current = { correct: 0, total: 0, latencySum: 0 };
    sentCompletedRef.current = false;

    if (questions.length > 0 && pathId && pathNodeId) {
      queueEvent({
        type: "quiz_started",
        pathId,
        pathNodeId,
        data: {
          source: "node_drill",
          quiz_session_id: quizSessionIdRef.current,
          question_count: questions.length,
        },
      });
    }
  }, [drill]);

  if (questions.length === 0) {
    return <div className="text-sm text-muted-foreground">{t("pathNode.drills.quiz.empty")}</div>;
  }

  const q = questions[Math.min(Math.max(idx, 0), questions.length - 1)] || {};
  const rawOptions = Array.isArray(q.options) ? q.options : [];
  const options = rawOptions
    .map((opt, i) => {
      if (typeof opt === "string") return { id: String(i), text: opt };
      if (opt && typeof opt === "object") {
        const id = String(opt.id ?? i);
        const text = String(opt.text ?? "");
        return { id, text };
      }
      return null;
    })
    .filter((opt): opt is { id: string; text: string } => Boolean(opt));
  const legacyIndex = (q as { correct_index?: number }).correct_index;
  const answerId =
    typeof q.answer_id === "string" && q.answer_id.trim()
      ? q.answer_id.trim()
      : typeof legacyIndex === "number"
        ? String(legacyIndex)
        : null;

  const conceptIdsForKeys = (keys: string[]) => {
    const ids = (Array.isArray(keys) ? keys : [])
      .map((k) => conceptIdByKey.get(String(k || "").trim()) || "")
      .filter((v): v is string => Boolean(v));
    return Array.from(new Set(ids));
  };

  const select = (id: string) => {
    if (revealed) return;
    setSelected(id);
    setRevealed(true);

    const qid = String(q.id ?? "").trim() || `q_${idx + 1}`;
    const attemptN = (attemptByQuestionIdRef.current[qid] ?? 0) + 1;
    attemptByQuestionIdRef.current[qid] = attemptN;

    const latencyMs = Math.max(0, Date.now() - (questionShownAtRef.current || Date.now()));
    const isCorrect = Boolean(answerId != null && id === answerId);

    // Prefer question-level concept keys (if the generator provides them); fallback to node concept keys.
    const qConceptKeys = Array.isArray((q as { concept_keys?: unknown }).concept_keys)
      ? ((q as { concept_keys?: unknown }).concept_keys as unknown[]).map((k) => String(k || "").trim()).filter(Boolean)
      : [];
    const conceptKeys = qConceptKeys.length > 0 ? qConceptKeys : defaultConceptKeys;

    queueEvent({
      type: "question_answered",
      pathId,
      pathNodeId,
      conceptIds: conceptIdsForKeys(conceptKeys),
      data: {
        source: "node_drill",
        quiz_session_id: quizSessionIdRef.current,
        question_id: qid,
        question_index: idx,
        question_count: questions.length,
        attempt_n: attemptN,
        selected_id: id,
        answer_id: answerId,
        is_correct: isCorrect,
        latency_ms: latencyMs,
      },
    });

    // Track completion stats on first attempt per question.
    if (attemptN === 1) {
      firstAttemptStatsRef.current.total += 1;
      firstAttemptStatsRef.current.latencySum += latencyMs;
      if (isCorrect) firstAttemptStatsRef.current.correct += 1;
    }
    if (!sentCompletedRef.current && firstAttemptStatsRef.current.total >= questions.length) {
      sentCompletedRef.current = true;
      const total = firstAttemptStatsRef.current.total || questions.length;
      const correct = firstAttemptStatsRef.current.correct;
      const avgLatencyMs = total > 0 ? Math.round(firstAttemptStatsRef.current.latencySum / total) : 0;
      queueEvent({
        type: "quiz_completed",
        pathId,
        pathNodeId,
        data: {
          source: "node_drill",
          quiz_session_id: quizSessionIdRef.current,
          question_count: questions.length,
          correct,
          total,
          score: total > 0 ? correct / total : 0,
          avg_latency_ms: avgLatencyMs,
        },
      });
    }
  };

  const next = () => {
    setIdx((v) => Math.min(questions.length - 1, v + 1));
    setSelected(null);
    setRevealed(false);
    questionShownAtRef.current = Date.now();
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header row - responsive */}
      <div className="flex items-center justify-between text-[11px] xs:text-xs text-muted-foreground">
        <div className="font-medium">
          {t("pathNode.drills.quiz.count", { current: idx + 1, total: questions.length })}
        </div>
      </div>

      {/* Question prompt - responsive */}
      <div className="rounded-lg sm:rounded-xl border border-border bg-muted/30 p-3 sm:p-4">
        <div className="text-sm sm:text-[15px] leading-relaxed text-foreground/90">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownCodeComponents}>
            {String(q.prompt_md ?? "")}
          </ReactMarkdown>
        </div>
      </div>

      {/* Options - responsive */}
      <div className="space-y-2">
        {options.map((opt, i) => {
          const isCorrect = revealed && answerId != null && opt.id === answerId;
          const isWrong = revealed && selected != null && selected === opt.id && opt.id !== answerId;
          return (
            <button
              key={opt.id ?? i}
              type="button"
              onClick={() => select(opt.id)}
              className={cn(
                "w-full text-start rounded-lg border",
                // Responsive typography
                "text-sm sm:text-[15px]",
                // Touch-friendly sizing (min 48px height)
                "min-h-[48px] px-3 sm:px-4 py-3",
                // Transitions
                "nb-motion-fast motion-reduce:transition-none",
                // Base and hover states
                "border-border hover:bg-muted/40 active:bg-muted/60 active:scale-[0.995]",
                // Touch optimizations
                "touch-manipulation -webkit-tap-highlight-color-transparent",
                isCorrect && "border-success/50 bg-success/10",
                isWrong && "border-destructive/50 bg-destructive/10"
              )}
            >
              {String(opt.text ?? "")}
            </button>
          );
        })}
      </div>

      {/* Explanation - responsive */}
      {revealed ? (
        <div className="rounded-lg sm:rounded-xl border border-border bg-background p-3 sm:p-4">
          <div className="text-[11px] xs:text-xs font-medium text-muted-foreground">{t("pathNode.drills.quiz.explanation")}</div>
          <div className="mt-1.5 sm:mt-2 text-sm sm:text-[15px] leading-relaxed text-foreground/90">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownCodeComponents}>
              {String(q.explanation_md ?? "")}
            </ReactMarkdown>
          </div>
        </div>
      ) : null}

      {/* Navigation buttons - responsive */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <Button
          variant="outline"
          onClick={() => {
            setIdx((v) => Math.max(0, v - 1));
            setSelected(null);
            setRevealed(false);
          }}
          disabled={idx <= 0}
          className={cn(
            "flex-1 sm:flex-none",
            "h-11 sm:h-10",
            "touch-manipulation -webkit-tap-highlight-color-transparent",
            "active:scale-[0.97]"
          )}
        >
          {t("common.previous")}
        </Button>
        <Button
          onClick={next}
          disabled={idx >= questions.length - 1}
          className={cn(
            "flex-1 sm:flex-none",
            "h-11 sm:h-10",
            "touch-manipulation -webkit-tap-highlight-color-transparent",
            "active:scale-[0.97]"
          )}
        >
          {t("common.next")}
        </Button>
      </div>
    </div>
  );
}

export default function PathNodePage() {
  const { id: nodeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { messages, connected } = useSSEContext();
  const { user } = useUser();
  const { activatePath } = usePaths();
  const { activateLesson } = useLessons();
  const { openThread, activeThreadId } = useChatDock();

  const [loading, setLoading] = useState(false);
  const [node, setNode] = useState<PathNode | null>(null);
  const [doc, setDoc] = useState<JsonInput>(null);
  const [path, setPath] = useState<Path | null>(null);
  const [drills, setDrills] = useState<DrillSpec[]>([]);
  const [err, setErr] = useState<unknown | null>(null);
  const [runtimePrompt, setRuntimePrompt] = useState<RuntimePromptPayload | null>(null);
  const [completedInteractiveBlocks, setCompletedInteractiveBlocks] = useState<Record<string, boolean>>({});

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTitle, setDrawerTitle] = useState("");
  const [drawerKind, setDrawerKind] = useState<string>("");
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState("");
  const [drawerDrill, setDrawerDrill] = useState<DrillPayloadV1 | null>(null);

  const [pendingBlocks, setPendingBlocks] = useState<Record<string, string | true>>({});
  const pendingJobsRef = useRef<Record<string, string>>({});
  const [blockFeedback, setBlockFeedback] = useState<Record<string, BlockFeedback>>({});
  const [undoableBlocks, setUndoableBlocks] = useState<Record<string, boolean>>({});
  const [pendingEdit, setPendingEdit] = useState<NodeDocEditProposal | null>(null);
  const [pendingEditBusy, setPendingEditBusy] = useState(false);
  const pendingEditThreadIdRef = useRef<string | null>(null);
  const pendingEditSeqRef = useRef<number>(0);
  const pendingEditPollRef = useRef<number | null>(null);

  const [regenDialogOpen, setRegenDialogOpen] = useState(false);
  const [regenBlock, setRegenBlock] = useState<DocBlock | null>(null);
  const [regenInstruction, setRegenInstruction] = useState("");
  const [regenPolicy, setRegenPolicy] = useState<"reuse_only" | "allow_new">("reuse_only");
  const [regenError, setRegenError] = useState("");
  const [regenSubmitting, setRegenSubmitting] = useState(false);

  const [chatDialogOpen, setChatDialogOpen] = useState(false);
  const [chatBlock, setChatBlock] = useState<DocBlock | null>(null);
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatSubmitting, setChatSubmitting] = useState(false);
  const [chatError, setChatError] = useState("");

  const openedAtRef = useRef<number>(Date.now());
  const maxScrollPercentRef = useRef<number>(0);
  const currentScrollPercentRef = useRef<number>(0);
  const visibleBlocksRef = useRef<Map<string, number>>(new Map());
  const blockMetricsRef = useRef<
    Map<
      string,
      {
        ratio: number;
        topDelta: number;
        height: number;
        visibleHeight: number;
        rootHeight: number;
        top: number;
        bottom: number;
        left: number;
        right: number;
        visibleStartPct: number;
        visibleEndPct: number;
        hiddenTopPct: number;
        hiddenBottomPct: number;
        anchorPct: number;
        seenAt: number;
      }
    >
  >(new Map());
  const blockBoundsRef = useRef<Map<string, { top: number; bottom: number; left: number; right: number; seenAt: number }>>(
    new Map()
  );
  const blockLineRectsRef = useRef<Map<string, LineRect[]>>(new Map());
  const lineDwellRef = useRef<Map<string, { ms: number; lastAt: number; blockId: string; index: number }>>(new Map());
  const lineCreditsRef = useRef<Map<string, number>>(new Map());
  const blockLineCreditsRef = useRef<Map<string, number>>(new Map());
  const lineStateRef = useRef<{
    lines: LineState[];
    probs: number[];
    updatedAt: number;
    bestIndex: number;
    bestProb: number;
    mode: "reading" | "scanning" | "idle";
    usedGaze: boolean;
  } | null>(null);
  const currentBlockIdRef = useRef<string>("");
  const currentBlockConfidenceRef = useRef<number>(0);
  const lastSwitchAtRef = useRef<number>(0);
  const scoreEMARef = useRef<Map<string, number>>(new Map());
  const lastCurrentAtRef = useRef<Map<string, number>>(new Map());
  const scrollDirRef = useRef<"up" | "down" | "none">("none");
  const lastScrollTopRef = useRef<number>(0);
  const lastScrollAtRef = useRef<number>(0);
  const scrollVelocityRef = useRef<number>(0);
  const readCreditsRef = useRef<Map<string, number>>(new Map());
  const readBlocksRef = useRef<Set<string>>(new Set());
  const engagedBlocksRef = useRef<Set<string>>(new Set());
  const readTargetSecondsRef = useRef<Map<string, number>>(new Map());
  const lastReadTickRef = useRef<number>(0);
  const progressRef = useRef<{
    state: ProgressState;
    confidence: number;
    engaged: ProgressEntry | null;
    engagedSeq: ProgressEntry[];
    completedSeq: ProgressEntry[];
    regressionSeq: ProgressEntry[];
    forwardCount: number;
    regressionCount: number;
    lastProgressAt: number;
    lastEngageAt: number;
    lastCompleteAt: number;
    lastActiveId: string;
    lastActiveAt: number;
    activeChanges: number[];
  }>({
    state: "idle",
    confidence: 0,
    engaged: null,
    engagedSeq: [],
    completedSeq: [],
    regressionSeq: [],
    forwardCount: 0,
    regressionCount: 0,
    progressingSince: 0,
    lastProgressAt: 0,
    lastEngageAt: 0,
    lastCompleteAt: 0,
    lastActiveId: "",
    lastActiveAt: 0,
    activeChanges: [],
  });
  const progressSignatureRef = useRef<string>("");
  const debugCandidatesRef = useRef<
    Array<{
      id: string;
      score: number;
      ratio: number;
      topDelta: number;
      centerY: number;
      anchor: number;
    }>
  >([]);
  const [debugOverlay, setDebugOverlay] = useState(LESSON_DEBUG_OVERLAY);
  const [debugOverlayData, setDebugOverlayData] = useState<{
    activeId: string | null;
    activeMetric: {
      ratio: number;
      topDelta: number;
      height: number;
      rootHeight: number;
      visibleStartPct: number;
      visibleEndPct: number;
      hiddenTopPct: number;
      hiddenBottomPct: number;
      anchorPct: number;
    } | null;
    visible: Array<{
      id: string;
      ratio: number;
      topDelta: number;
      visibleStartPct: number;
      visibleEndPct: number;
      hiddenTopPct: number;
      hiddenBottomPct: number;
      anchorPct: number;
    }>;
    scrollPercent: number;
    progress: {
      state: ProgressState;
      confidence: number;
      engagedId: string | null;
      completedId: string | null;
      forwardCount: number;
      regressionCount: number;
      engagedSeq: string[];
      completedSeq: string[];
      progressingSinceSec: number;
    };
  }>({
    activeId: null,
    activeMetric: null,
    visible: [],
    scrollPercent: 0,
    progress: {
      state: "idle",
      confidence: 0,
      engagedId: null,
      completedId: null,
      forwardCount: 0,
      regressionCount: 0,
      engagedSeq: [],
      completedSeq: [],
      progressingSinceSec: 0,
    },
  });
  const debugOverlayRef = useRef<HTMLDivElement | null>(null);
  const sessionSyncTimerRef = useRef<number | null>(null);
  const sessionIdleTimerRef = useRef<number | null>(null);
  const sessionForceTimerRef = useRef<number | null>(null);
  const sessionDirtyRef = useRef<boolean>(false);
  const lastSessionSyncAtRef = useRef<number>(0);
  const lastSessionChangeAtRef = useRef<number>(0);
  const lastSessionPayloadRef = useRef<string>("");
  const nodeConceptIdsRef = useRef<string[]>([]);
  const nodeIdRef = useRef<string>("");
  const pathIdRef = useRef<string>("");
  const docContainerRef = useRef<HTMLDivElement | null>(null);
  const gazeQueueRef = useRef<GazeQueue | null>(null);
  const gazeEnabledRef = useRef<boolean>(false);
  const gazeLastHitAtRef = useRef<number>(0);
  const gazeLastBlockRef = useRef<string>("");
  const gazeSmoothRef = useRef<{ x: number; y: number; ts: number } | null>(null);
  const gazeLastPointRef = useRef<{ x: number; y: number; ts: number } | null>(null);
  const gazeVelocityRef = useRef<number>(0);
  const gazeBiasRef = useRef<{ x: number; y: number } | null>(null);
  const gazeDebugRef = useRef<HTMLDivElement | null>(null);

  const resolveScrollContainer = useCallback(() => {
    let el = docContainerRef.current;
    while (el && el !== document.body) {
      const style = window.getComputedStyle(el);
      const overflowY = style.overflowY;
      const scrollable =
        (overflowY === "auto" || overflowY === "scroll") && el.scrollHeight - el.clientHeight > 4;
      if (scrollable) return el;
      el = el.parentElement;
    }
    return null;
  }, []);

  const getBlockElement = useCallback((id: string) => {
    const blockId = String(id || "").trim();
    if (!blockId) return null;
    const container = docContainerRef.current ?? document;
    const escaped =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(blockId)
        : blockId.replace(/"/g, '\\"');
    return container.querySelector<HTMLElement>(`[data-doc-block-id="${escaped}"]`);
  }, []);

  const computeLineRects = useCallback((blockId: string, el: HTMLElement | null) => {
    if (!el || typeof document === "undefined") return [];
    const linesByTop = new Map<number, { top: number; bottom: number; left: number; right: number }>();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const text = node.textContent ?? "";
        return text.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    let node = walker.nextNode();
    while (node) {
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = Array.from(range.getClientRects());
      rects.forEach((rect) => {
        if (rect.width < 2 || rect.height < 2) return;
        const key = Math.round(rect.top / 3) * 3;
        const existing = linesByTop.get(key);
        if (!existing) {
          linesByTop.set(key, {
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
          });
          return;
        }
        existing.top = Math.min(existing.top, rect.top);
        existing.bottom = Math.max(existing.bottom, rect.bottom);
        existing.left = Math.min(existing.left, rect.left);
        existing.right = Math.max(existing.right, rect.right);
        linesByTop.set(key, existing);
      });
      node = walker.nextNode();
    }
    if (linesByTop.size === 0) {
      const rect = el.getBoundingClientRect();
      linesByTop.set(Math.round(rect.top / 3) * 3, {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
      });
    }
    const lines = Array.from(linesByTop.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([_, rect], idx) => ({
        id: `${blockId}:line:${idx + 1}`,
        index: idx,
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        height: Math.max(1, rect.bottom - rect.top),
        width: Math.max(1, rect.right - rect.left),
      }));
    return lines;
  }, []);

  const findGazeBlock = useCallback((x: number, y: number) => {
    const now = Date.now();
    if (blockBoundsRef.current.size === 0) {
      const container = docContainerRef.current ?? document;
      const blocks = Array.from(container.querySelectorAll<HTMLElement>("[data-doc-block-id]"));
      blocks.forEach((el) => {
        const id = String(el.dataset.docBlockId || "").trim();
        if (!id) return;
        const rect = el.getBoundingClientRect();
        blockBoundsRef.current.set(id, {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          seenAt: now,
        });
      });
    }
    let bestInside: { id: string; ratio: number } | null = null;
    let bestNear: { id: string; distance: number } | null = null;
    blockBoundsRef.current.forEach((bounds, id) => {
      if (!id) return;
      if (GAZE_BLOCK_TTL_MS > 0 && now - (bounds.seenAt || 0) > GAZE_BLOCK_TTL_MS) return;
      const inside = x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
      const ratio = blockMetricsRef.current.get(id)?.ratio ?? 0;
      if (inside) {
        if (!bestInside || ratio > bestInside.ratio) {
          bestInside = { id, ratio };
        }
        return;
      }
      const centerX = (bounds.left + bounds.right) * 0.5;
      const centerY = (bounds.top + bounds.bottom) * 0.5;
      const dist = Math.abs(centerY - y) + Math.abs(centerX - x) * 0.15;
      if (!bestNear || dist < bestNear.distance) {
        bestNear = { id, distance: dist };
      }
    });
    return bestInside?.id || bestNear?.id || "";
  }, []);

  const getBlockLines = useCallback(
    (blockId: string) => {
      if (!blockId) return [];
      let lines = blockLineRectsRef.current.get(blockId);
      if (!lines || lines.length === 0) {
        const el = getBlockElement(blockId);
        lines = computeLineRects(blockId, el);
        if (lines.length > 0) {
          blockLineRectsRef.current.set(blockId, lines);
        }
      }
      return lines ?? [];
    },
    [computeLineRects, getBlockElement]
  );

  const findGazeLine = useCallback(
    (blockId: string, x: number, y: number) => {
      const lines = getBlockLines(blockId);
      if (!lines || lines.length === 0) return null;
      let best: { line: LineRect; dist: number; inside: boolean } | null = null;
      for (const line of lines) {
        const centerY = (line.top + line.bottom) * 0.5;
        const yTol = Math.max(line.height * LINE_DISTANCE_FACTOR, 4);
        const withinY = Math.abs(y - centerY) <= yTol;
        const left = line.left - LINE_X_PADDING;
        const right = line.right + LINE_X_PADDING;
        const withinX = x >= left && x <= right;
        const inside = withinX && withinY;
        const yDist = withinY ? 0 : Math.abs(y - centerY) - yTol;
        const xDist = withinX ? 0 : Math.min(Math.abs(x - left), Math.abs(x - right));
        const dist = Math.max(0, yDist) + xDist * 0.25;
        if (!best || dist < best.dist) {
          best = { line, dist, inside };
        }
        if (inside) break;
      }
      if (!best) return null;
      return { ...best.line, dist: best.dist, inside: best.inside };
    },
    [getBlockLines]
  );

  const getSnappedGaze = useCallback(
    (x: number, y: number, options?: { force?: boolean }) => {
      const force = Boolean(options?.force);
      if (!GAZE_SNAP_ENABLED) {
        return { x, y, snap: "none" as const, blockId: "", line: null as LineRect | null };
      }
      const blockId = findGazeBlock(x, y);
      if (!blockId) return { x, y, snap: "none" as const, blockId: "", line: null as LineRect | null };
      const line = findGazeLine(blockId, x, y);
      if (line && (force || line.inside || line.dist <= GAZE_SNAP_LINE_MAX_DIST)) {
        const lineCenterX = (line.left + line.right) * 0.5;
        const lineCenterY = (line.top + line.bottom) * 0.5;
        return { x: lineCenterX, y: lineCenterY, snap: "line" as const, blockId, line };
      }
      const bounds = blockBoundsRef.current.get(blockId);
      if (bounds) {
        const inside = x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
        const centerX = (bounds.left + bounds.right) * 0.5;
        const centerY = (bounds.top + bounds.bottom) * 0.5;
        const dist = Math.hypot(x - centerX, y - centerY);
        if (force || inside || dist <= GAZE_SNAP_BLOCK_MAX_DIST) {
          return { x: centerX, y: centerY, snap: "block" as const, blockId, line: null };
        }
      }
      return { x, y, snap: "none" as const, blockId, line: null as LineRect | null };
    },
    [findGazeBlock, findGazeLine]
  );

  const buildVisibleLineState = useCallback(
    (rootTop: number, rootBottom: number) => {
      const lines: LineState[] = [];
      const margin = 32;
      for (const [blockId, metric] of blockMetricsRef.current.entries()) {
        if ((metric?.ratio ?? 0) < READ_VISIBLE_RATIO_MIN) continue;
        const blockLines = getBlockLines(blockId);
        if (!blockLines || blockLines.length === 0) continue;
        for (const line of blockLines) {
          if (line.bottom < rootTop - margin || line.top > rootBottom + margin) continue;
          const centerY = (line.top + line.bottom) * 0.5;
          lines.push({
            ...line,
            blockId,
            centerY,
          });
        }
      }
      lines.sort((a, b) => a.centerY - b.centerY);
      return lines;
    },
    [getBlockLines]
  );

  const findNearestVisibleLine = useCallback(
    (y: number, rootTop: number, rootBottom: number) => {
      const lines = buildVisibleLineState(rootTop, rootBottom);
      if (lines.length === 0) return null;
      let best: LineState | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const line of lines) {
        const dist = Math.abs(line.centerY - y);
        if (dist < bestDist) {
          bestDist = dist;
          best = line;
        }
      }
      return best;
    },
    [buildVisibleLineState]
  );

  const updateLineState = useCallback(
    ({
      nowMs,
      rootTop,
      rootBottom,
      rootHeight,
      behaviorY,
      gazePoint,
      dtMs,
    }: {
      nowMs: number;
      rootTop: number;
      rootBottom: number;
      rootHeight: number;
      behaviorY: number;
      gazePoint: { x: number; y: number; confidence: number; velocity: number; ts: number } | null;
      dtMs: number;
    }) => {
      if (!LINE_STATE_ENABLED) return null;
      const prev = lineStateRef.current;
      if (prev && nowMs - prev.updatedAt <= LINE_STATE_CACHE_MS) {
        if (prev.lines.length > 0) {
          return {
            line: prev.lines[prev.bestIndex] ?? null,
            confidence: prev.bestProb,
            mode: prev.mode,
            usedGaze: prev.usedGaze,
          };
        }
      }

      const lines = buildVisibleLineState(rootTop, rootBottom);
      if (lines.length === 0) {
        lineStateRef.current = null;
        return null;
      }

      const heights = lines.map((l) => l.height).filter((v) => v > 0);
      const medianHeight = heights.length ? heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)] : 18;
      const avgLineHeight = Math.max(12, medianHeight || 18);

      const nextProbs = new Array(lines.length).fill(0);
      const prevProbs = new Array(lines.length).fill(0);
      if (prev && prev.lines.length > 0 && prev.probs.length === prev.lines.length) {
        const prevIndexById = new Map(prev.lines.map((line, idx) => [line.id, idx]));
        let total = 0;
        lines.forEach((line, idx) => {
          const prevIdx = prevIndexById.get(line.id);
          if (prevIdx == null) return;
          const p = prev.probs[prevIdx] ?? 0;
          if (p > 0) {
            prevProbs[idx] = p;
            total += p;
          }
        });
        if (total <= 0) {
          prevProbs.fill(1 / lines.length);
        } else if (Math.abs(total - 1) > 0.01) {
          for (let i = 0; i < prevProbs.length; i += 1) prevProbs[i] /= total;
        }
      } else {
        prevProbs.fill(1 / lines.length);
      }

      const speedScreens = rootHeight > 0 ? scrollVelocityRef.current / rootHeight : 0;
      const scrollSign = scrollDirRef.current === "down" ? 1 : scrollDirRef.current === "up" ? -1 : 0;
      const expectedDelta = scrollSign * Math.min(LINE_STATE_MAX_JUMP, Math.round((scrollVelocityRef.current / avgLineHeight) * (dtMs / 1000)));
      const transitionSigma = Math.max(1, Math.abs(expectedDelta) + 0.75);
      const window = Math.max(2, LINE_STATE_MAX_JUMP);

      const predicted = new Array(lines.length).fill(0);
      for (let i = 0; i < prevProbs.length; i += 1) {
        const p = prevProbs[i];
        if (p <= 0) continue;
        for (let d = -window; d <= window; d += 1) {
          const j = i + d;
          if (j < 0 || j >= lines.length) continue;
          const bias = d - expectedDelta;
          const weight = Math.exp(-(bias * bias) / (2 * transitionSigma * transitionSigma));
          predicted[j] += p * weight;
        }
      }
      let predTotal = predicted.reduce((acc, v) => acc + v, 0);
      if (predTotal <= 0) {
        predicted.fill(1 / lines.length);
      } else {
        for (let i = 0; i < predicted.length; i += 1) predicted[i] /= predTotal;
      }

      const gazeOk =
        gazePoint &&
        gazePoint.confidence >= GAZE_MIN_CONFIDENCE &&
        gazePoint.velocity <= GAZE_MAX_VELOCITY_PX_S &&
        nowMs - (gazePoint.ts ?? nowMs) <= 800 &&
        gazePoint.y >= rootTop &&
        gazePoint.y <= rootBottom;
      const gazeWeight = gazeOk
        ? clamp(
            (gazePoint.confidence - GAZE_MIN_CONFIDENCE) / Math.max(1 - GAZE_MIN_CONFIDENCE, 0.01),
            0.2,
            1
          )
        : 0;
      const behaviorWeight = gazeOk ? 1 - gazeWeight : 1;
      const gazeSigma = Math.max(avgLineHeight * LINE_STATE_GAZE_SIGMA_MULT, 10);
      const behaviorSigma = Math.max(avgLineHeight * LINE_STATE_BEHAVIOR_SIGMA_MULT, rootHeight * 0.12);

      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        let likelihood = 1;
        if (gazeOk && gazePoint) {
          const dist = Math.abs(line.centerY - gazePoint.y);
          const l = Math.exp(-(dist * dist) / (2 * gazeSigma * gazeSigma));
          likelihood *= Math.pow(l, gazeWeight);
        }
        const distBehavior = Math.abs(line.centerY - behaviorY);
        const lb = Math.exp(-(distBehavior * distBehavior) / (2 * behaviorSigma * behaviorSigma));
        likelihood *= Math.pow(lb, behaviorWeight);
        const ratio = blockMetricsRef.current.get(line.blockId)?.ratio ?? 0.5;
        likelihood *= clamp(ratio, 0.2, 1);
        nextProbs[i] = predicted[i] * likelihood + 1e-6;
      }

      let total = nextProbs.reduce((acc, v) => acc + v, 0);
      if (total <= 0) {
        nextProbs.fill(1 / lines.length);
        total = 1;
      } else {
        for (let i = 0; i < nextProbs.length; i += 1) nextProbs[i] /= total;
      }

      let bestIndex = 0;
      let bestProb = nextProbs[0] ?? 0;
      for (let i = 1; i < nextProbs.length; i += 1) {
        if (nextProbs[i] > bestProb) {
          bestProb = nextProbs[i];
          bestIndex = i;
        }
      }

      let mode: "reading" | "scanning" | "idle" = "reading";
      if (speedScreens > 1.2) mode = "scanning";
      if (!gazeOk && speedScreens < 0.05) mode = "idle";

      lineStateRef.current = {
        lines,
        probs: nextProbs,
        updatedAt: nowMs,
        bestIndex,
        bestProb,
        mode,
        usedGaze: Boolean(gazeOk),
      };

      return {
        line: lines[bestIndex] ?? null,
        confidence: bestProb,
        mode,
        usedGaze: Boolean(gazeOk),
      };
    },
    [buildVisibleLineState]
  );

  const getSmoothedGaze = useCallback((nowMs: number) => {
    const gaze = gazeRef.current;
    if (!gaze) return null;
    const prev = gazeSmoothRef.current;
    const smoothWeight = 0.65;
    const smoothX = prev ? prev.x * smoothWeight + gaze.x * (1 - smoothWeight) : gaze.x;
    const smoothY = prev ? prev.y * smoothWeight + gaze.y * (1 - smoothWeight) : gaze.y;
    gazeSmoothRef.current = { x: smoothX, y: smoothY, ts: nowMs };
    const last = gazeLastPointRef.current;
    if (last) {
      const dt = Math.max(16, nowMs - last.ts);
      const dist = Math.hypot(smoothX - last.x, smoothY - last.y);
      gazeVelocityRef.current = (dist / dt) * 1000;
    } else {
      gazeVelocityRef.current = 0;
    }
    gazeLastPointRef.current = { x: smoothX, y: smoothY, ts: nowMs };
    return {
      x: smoothX,
      y: smoothY,
      confidence: gaze.confidence,
      velocity: gazeVelocityRef.current,
      ts: typeof gaze.ts === "number" ? gaze.ts : nowMs,
      source: gaze.source,
    };
  }, []);

  const applyGazeBias = useCallback((x: number, y: number) => {
    const bias = gazeBiasRef.current;
    if (!bias) return { x, y };
    return { x: x - bias.x, y: y - bias.y };
  }, []);

  const updateGazeBias = useCallback((errX: number, errY: number) => {
    const prev = gazeBiasRef.current ?? { x: 0, y: 0 };
    const next = {
      x: clamp(prev.x + errX * GAZE_BIAS_ALPHA, -GAZE_BIAS_MAX, GAZE_BIAS_MAX),
      y: clamp(prev.y + errY * GAZE_BIAS_ALPHA, -GAZE_BIAS_MAX, GAZE_BIAS_MAX),
    };
    gazeBiasRef.current = next;
  }, []);

  const recordLineDwell = useCallback(
    (blockId: string, line: LineRect, dtMs: number) => {
      if (!blockId || !line) return blockLineCreditsRef.current.get(blockId) ?? 0;
      const safeDt = Math.max(0, Math.min(dtMs, 1000));
      if (safeDt <= 0) return blockLineCreditsRef.current.get(blockId) ?? 0;
      const now = Date.now();
      const key = line.id;
      const entry = lineDwellRef.current.get(key) ?? {
        ms: 0,
        lastAt: now,
        blockId,
        index: line.index,
      };
      entry.ms += safeDt;
      entry.lastAt = now;
      lineDwellRef.current.set(key, entry);

      const prevLineCredit = lineCreditsRef.current.get(key) ?? 0;
      const nextLineCredit = clamp(entry.ms / LINE_MIN_FIXATION_MS, 0, 1);
      if (nextLineCredit > prevLineCredit) {
        lineCreditsRef.current.set(key, nextLineCredit);
        const lines = getBlockLines(blockId);
        const lineCount = Math.max(1, lines.length || 1);
        const delta = nextLineCredit - prevLineCredit;
        const prevBlock = blockLineCreditsRef.current.get(blockId) ?? 0;
        const nextBlock = clamp(prevBlock + delta / lineCount, 0, 1);
        blockLineCreditsRef.current.set(blockId, nextBlock);
        return nextBlock;
      }
      return blockLineCreditsRef.current.get(blockId) ?? 0;
    },
    [getBlockLines]
  );

  const scrollToBlockId = useCallback(
    (blockId: string) => {
      const id = String(blockId || "").trim();
      if (!id) return;
      const scrollRoot = resolveScrollContainer();
      const escaped =
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? CSS.escape(id)
          : id.replace(/\"/g, '\\\"');
      const el = (scrollRoot ?? document).querySelector<HTMLElement>(`[data-doc-block-id="${escaped}"]`);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (scrollRoot && scrollRoot !== window) {
        const rootRect = scrollRoot.getBoundingClientRect();
        const top = rect.top - rootRect.top + (scrollRoot.scrollTop || 0) - 80;
        scrollRoot.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      } else {
        const top = rect.top + (window.scrollY || 0) - 120;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      }
    },
    [resolveScrollContainer]
  );

  const feedbackStorageKey = useMemo(() => {
    if (!nodeId) return "";
    return `nodeDocFeedback:${nodeId}`;
  }, [nodeId]);

  useEffect(() => {
    setBlockFeedback({});
  }, [nodeId]);

  useEffect(() => {
    setPendingBlocks({});
    pendingJobsRef.current = {};
  }, [nodeId]);

  const loadDoc = useCallback(async (): Promise<JsonInput | null> => {
    if (!nodeId) return null;
    try {
      return await getPathNodeDoc(nodeId);
    } catch {
      return null;
    }
  }, [nodeId]);

  useEffect(() => {
    if (!nodeId) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);

    (async () => {
      try {
        const n = await activateLesson(nodeId);
        if (cancelled) return;
        setNode(n);

        if (n?.pathId) {
          const p = await activatePath(n.pathId);
          if (!cancelled) setPath(p);
        }

        const d = await loadDoc();
        if (!cancelled) setDoc(d);

        const ds = await listDrillsForNode(nodeId);
        if (!cancelled) setDrills(ds);
      } catch (e) {
        if (!cancelled) setErr(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nodeId, activateLesson, activatePath, loadDoc]);

  const conceptKeys = useMemo(() => extractConceptKeys(node), [node]);
  const docBlocks = useMemo(() => {
    const parsed = safeParseJSON(doc);
    const blocks = (parsed as { blocks?: unknown })?.blocks;
    if (!Array.isArray(blocks)) return [];
    return blocks as DocBlock[];
  }, [doc]);

  useEffect(() => {
    readTargetSecondsRef.current = new Map();
    readCreditsRef.current.clear();
    readBlocksRef.current.clear();
    engagedBlocksRef.current.clear();
    lineDwellRef.current.clear();
    lineCreditsRef.current.clear();
    blockLineCreditsRef.current.clear();
    lineStateRef.current = null;
    lastReadTickRef.current = 0;
    progressRef.current = {
      state: "idle",
      confidence: 0,
      engaged: null,
      engagedSeq: [],
      completedSeq: [],
      regressionSeq: [],
      forwardCount: 0,
      regressionCount: 0,
      lastProgressAt: 0,
      lastEngageAt: 0,
      lastCompleteAt: 0,
      lastActiveId: "",
      lastActiveAt: 0,
      activeChanges: [],
    };
    progressSignatureRef.current = "";
    for (const block of docBlocks) {
      const id = String(block?.id ?? "").trim();
      if (!id) continue;
      readTargetSecondsRef.current.set(id, estimateReadSeconds(block));
    }
    blockLineRectsRef.current.clear();
    gazeSmoothRef.current = null;
    gazeLastPointRef.current = null;
    gazeVelocityRef.current = 0;
    gazeBiasRef.current = null;
  }, [docBlocks, nodeId]);

  useEffect(() => {
    const onResize = () => {
      blockLineRectsRef.current.clear();
      lineDwellRef.current.clear();
      lineCreditsRef.current.clear();
      blockLineCreditsRef.current.clear();
      lineStateRef.current = null;
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);
  const blockById = useMemo(() => {
    const map = new Map<string, DocBlock>();
    docBlocks.forEach((b) => {
      const id = String(b?.id ?? "").trim();
      if (id) map.set(id, b);
    });
    return map;
  }, [docBlocks]);
  const blockOrder = useMemo(() => {
    const map = new Map<string, number>();
    docBlocks.forEach((b, idx) => {
      const id = String(b?.id ?? "").trim();
      if (id) map.set(id, idx);
    });
    return map;
  }, [docBlocks]);

  const pathId = node?.pathId || path?.id || "";
  useEffect(() => {
    pathIdRef.current = pathId;
  }, [pathId]);

  useEffect(() => {
    nodeIdRef.current = nodeId ? String(nodeId) : "";
  }, [nodeId]);

  useEffect(() => {
    gazeLastHitAtRef.current = 0;
    gazeLastBlockRef.current = "";
    gazeSmoothRef.current = null;
    gazeLastPointRef.current = null;
    gazeVelocityRef.current = 0;
    gazeBiasRef.current = null;
  }, [nodeId]);

  const conceptGraphQuery = useQuery({
    queryKey: queryKeys.conceptGraph(pathId || "unknown"),
    enabled: Boolean(pathId),
    staleTime: 10 * 60_000,
    queryFn: () => getConceptGraph(pathId),
  });

  const { enabled: eyeTrackingEnabled } = useEyeTrackingPreference();
  const { gazeRef, rawGazeRef, status: eyeTrackingStatus, error: eyeTrackingError } =
    useEyeTracking(eyeTrackingEnabled);
  const { calibrationState, needsCalibration, markCalibrated } = useEyeCalibration();
  const [showCalibration, setShowCalibration] = useState(false);
  const [eyeQuality, setEyeQuality] = useState<"good" | "ok" | "poor" | "stale" | "off">("off");
  const gazeStreamEnabled = useMemo(() => {
    const raw = String(import.meta.env.VITE_EYE_TRACKING_STREAM_ENABLED ?? "true").toLowerCase();
    return raw !== "false" && raw !== "0" && raw !== "off";
  }, []);
  const gazeDebugEnabled = useMemo(() => {
    const raw = String(import.meta.env.VITE_EYE_TRACKING_DEBUG ?? "").toLowerCase();
    return raw === "true" || raw === "1" || raw === "yes";
  }, []);

  useEffect(() => {
    gazeEnabledRef.current = Boolean(gazeStreamEnabled && eyeTrackingEnabled && eyeTrackingStatus === "active");
  }, [eyeTrackingEnabled, eyeTrackingStatus, gazeStreamEnabled]);

  useEffect(() => {
    if (!eyeTrackingEnabled || eyeTrackingStatus !== "active") {
      setEyeQuality("off");
      return () => {};
    }
    let timer: number | null = null;
    const tick = () => {
      const gaze = gazeRef.current;
      if (!gaze) {
        setEyeQuality("stale");
        return;
      }
      const now = Date.now();
      const ageMs = now - (typeof gaze.ts === "number" ? gaze.ts : now);
      if (ageMs > 1200) {
        setEyeQuality("stale");
        return;
      }
      const confidence = gaze.confidence ?? 0;
      const velocity = gazeVelocityRef.current || 0;
      const confScore = clamp(
        (confidence - GAZE_MIN_CONFIDENCE) / Math.max(1 - GAZE_MIN_CONFIDENCE, 0.01),
        0,
        1
      );
      const velScore = clamp(1 - velocity / Math.max(GAZE_MAX_VELOCITY_PX_S, 1), 0, 1);
      const score = 0.65 * confScore + 0.35 * velScore;
      if (score >= 0.7) setEyeQuality("good");
      else if (score >= 0.4) setEyeQuality("ok");
      else setEyeQuality("poor");
    };
    timer = window.setInterval(tick, 400);
    tick();
    return () => {
      if (timer != null) window.clearInterval(timer);
    };
  }, [eyeTrackingEnabled, eyeTrackingStatus, gazeRef]);

  useEffect(() => {
    if (!gazeQueueRef.current) {
      gazeQueueRef.current = new GazeQueue({
        flushIntervalMs: 1000,
        maxBatch: 200,
        maxQueueSize: 2000,
        enabled: () => gazeEnabledRef.current,
        context: () => ({
          pathId: pathIdRef.current || "",
          nodeId: nodeIdRef.current || "",
        }),
      });
    }
    gazeQueueRef.current.start();
    return () => {
      gazeQueueRef.current?.stop(true);
    };
  }, []);

  useEffect(() => {
    const onHide = () => {
      if (document.hidden) {
        void gazeQueueRef.current?.flush();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  const runtimeStateQuery = useQuery({
    queryKey: queryKeys.pathRuntime(pathId || "unknown"),
    enabled: Boolean(pathId),
    staleTime: 10_000,
    queryFn: () => getPathRuntime(pathId),
  });

  const runtimePromptBlock = useMemo(() => {
    const id = String(runtimePrompt?.block_id ?? "").trim();
    if (!id) return null;
    return blockById.get(id) ?? null;
  }, [blockById, runtimePrompt?.block_id]);
  const interactiveMode = runtimeStateQuery.data ? "runtime" : "inline";

  const conceptNameByKey = useMemo(() => {
    const map = new Map<string, string>();
    const concepts = conceptGraphQuery.data?.concepts ?? [];
    concepts.forEach((c) => {
      const key = String(c?.key ?? "").trim();
      const name = String(c?.name ?? "").trim();
      if (key && name) map.set(key, name);
    });
    return map;
  }, [conceptGraphQuery.data]);

  const conceptIdByKey = useMemo(() => {
    const map = new Map<string, string>();
    const concepts = conceptGraphQuery.data?.concepts ?? [];
    concepts.forEach((c) => {
      const key = String(c?.key ?? "").trim().toLowerCase();
      const id = String(c?.canonicalConceptId ?? c?.id ?? "").trim();
      if (key && id) map.set(key, id);
    });
    return map;
  }, [conceptGraphQuery.data]);

  useEffect(() => {
    const data = runtimeStateQuery.data as Record<string, unknown> | undefined;
    if (!data) return;
    const pathRun = data.path_run as Record<string, unknown> | null | undefined;
    const nodeRun = data.node_run as Record<string, unknown> | null | undefined;
    const prMeta = asRecord(pathRun?.metadata);
    const prRuntime = asRecord(prMeta?.runtime);
    const prompt = asRecord(prRuntime?.runtime_prompt);
    const status = String(prompt?.status ?? "").toLowerCase();
    if (prompt && String(prompt?.id ?? "").trim() && status === "pending") {
      setRuntimePrompt((prev) => {
        const next = {
          path_id: String((prompt?.path_id ?? pathId) || ""),
          node_id: String(prompt?.node_id ?? ""),
          block_id: String(prompt?.block_id ?? ""),
          type: String(prompt?.type ?? ""),
          reason: String(prompt?.reason ?? ""),
          prompt_id: String(prompt?.id ?? ""),
          created_at: String(prompt?.created_at ?? ""),
        };
        if (prev?.prompt_id && prev.prompt_id === next.prompt_id) {
          return prev;
        }
        return next;
      });
    } else {
      setRuntimePrompt((prev) => {
        if (prev?.prompt_id) return prev;
        return null;
      });
    }

    const nrMeta = asRecord(nodeRun?.metadata);
    const nrRuntime = asRecord(nrMeta?.runtime);
    const completed = Array.isArray(nrRuntime?.completed_blocks) ? nrRuntime?.completed_blocks : [];
    const map: Record<string, boolean> = {};
    completed.forEach((id: unknown) => {
      const s = String(id || "").trim();
      if (s) map[s] = true;
    });
    setCompletedInteractiveBlocks(map);
  }, [pathId, runtimeStateQuery.data]);

  const nodeConceptIds = useMemo(() => {
    const ids = conceptKeys
      .map((k) => conceptIdByKey.get(String(k || "").trim().toLowerCase()) || "")
      .filter((v): v is string => Boolean(v));
    return Array.from(new Set(ids));
  }, [conceptKeys, conceptIdByKey]);

  useEffect(() => {
    nodeConceptIdsRef.current = nodeConceptIds;
  }, [nodeConceptIds]);

  const buildVisibleSnapshot = useCallback(() => {
    const scrollRoot = resolveScrollContainer();
    const rootRect = scrollRoot?.getBoundingClientRect();
    const rootTop = rootRect?.top ?? 0;
    const rootHeight = Math.max(rootRect?.height ?? window.innerHeight, 1);
    const rootBottom = rootTop + rootHeight;
    const readingLine = rootHeight * 0.35;
    const gazeRaw = gazeRef.current;
    const gazeSmooth = gazeSmoothRef.current;
    const gazePoint =
      gazeSmooth && gazeRaw
        ? { x: gazeSmooth.x, y: gazeSmooth.y, confidence: gazeRaw.confidence }
        : gazeRaw;
    const corrected = gazePoint ? applyGazeBias(gazePoint.x, gazePoint.y) : null;
    const gazeOk =
      eyeTrackingEnabled &&
      eyeTrackingStatus === "active" &&
      corrected &&
      gazePoint &&
      gazePoint.confidence >= GAZE_MIN_CONFIDENCE &&
      corrected.y >= rootTop &&
      corrected.y <= rootBottom;
    const focusLine = gazeOk && corrected ? corrected.y - rootTop : readingLine;

    const getElementForId = (id: string) => {
      if (!id) return null;
      const escaped =
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? CSS.escape(id)
          : id.replace(/"/g, '\\"');
      return (scrollRoot ?? document).querySelector<HTMLElement>(`[data-doc-block-id="${escaped}"]`);
    };

    const entries: Array<{
      id: string;
      ratio: number;
      top_delta: number;
      visible_start_pct: number;
      visible_end_pct: number;
      hidden_top_pct: number;
      hidden_bottom_pct: number;
      anchor_pct: number;
    }> = [];
    const elements = Array.from(
      (scrollRoot ?? document).querySelectorAll<HTMLElement>("[data-doc-block-id]")
    );
    if (elements.length > 0) {
      visibleBlocksRef.current.clear();
      for (const el of elements) {
        const id = String(el.dataset.docBlockId || "").trim();
        if (!id) continue;
        const rect = el.getBoundingClientRect();
        const height = rect.height || 1;
        const visibleStart = Math.max(rect.top, rootTop);
        const visibleEnd = Math.min(rect.bottom, rootBottom);
        const visibleHeight = Math.max(0, visibleEnd - visibleStart);
        const ratio = Math.max(0, Math.min(1, visibleHeight / height));
        const visibleStartPct = clamp((visibleStart - rect.top) / height, 0, 1);
        const visibleEndPct = clamp((visibleEnd - rect.top) / height, 0, 1);
        const hiddenTopPct = clamp((rootTop - rect.top) / height, 0, 1);
        const hiddenBottomPct = clamp((rect.bottom - rootBottom) / height, 0, 1);
        const anchorPct = clamp((visibleStartPct + visibleEndPct) * 0.5, 0, 1);
        if (ratio >= VISIBLE_RATIO_MIN) {
          const rounded = Math.round(ratio * 1000) / 1000;
          entries.push({
            id,
            ratio: rounded,
            top_delta: rect.top - rootTop,
            visible_start_pct: Math.round(visibleStartPct * 1000) / 1000,
            visible_end_pct: Math.round(visibleEndPct * 1000) / 1000,
            hidden_top_pct: Math.round(hiddenTopPct * 1000) / 1000,
            hidden_bottom_pct: Math.round(hiddenBottomPct * 1000) / 1000,
            anchor_pct: Math.round(anchorPct * 1000) / 1000,
          });
          visibleBlocksRef.current.set(id, ratio);
          blockMetricsRef.current.set(id, {
            ratio,
            topDelta: rect.top - rootTop,
            height,
            visibleHeight,
            rootHeight,
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            visibleStartPct,
            visibleEndPct,
            hiddenTopPct,
            hiddenBottomPct,
            anchorPct,
            seenAt: Date.now(),
          });
          blockBoundsRef.current.set(id, {
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            seenAt: Date.now(),
          });
        }
      }
    } else {
      visibleBlocksRef.current.forEach((ratio, id) => {
        if (ratio < VISIBLE_RATIO_MIN) return;
        const rounded = Math.round(ratio * 1000) / 1000;
        entries.push({
          id,
          ratio: rounded,
          top_delta: 0,
          visible_start_pct: 0,
          visible_end_pct: 1,
          hidden_top_pct: 0,
          hidden_bottom_pct: 0,
          anchor_pct: 0.5,
        });
      });
    }

    entries.sort((a, b) => b.ratio - a.ratio);
    const visible = entries.slice(0, MAX_VISIBLE_BLOCKS);
    if (visible.length === 0) {
      currentBlockIdRef.current = "";
      currentBlockConfidenceRef.current = 0;
      return { visible, current: null };
    }

    const now = Date.now();
    const direction = scrollDirRef.current;
    const candidates: Array<{
      id: string;
      ratio: number;
      topDelta: number;
      height: number;
      centerY: number;
      bottomY: number;
      score: number;
      anchor: number;
      visibleStartPct: number;
      visibleEndPct: number;
    }> = [];

    for (const entry of visible) {
      const metric = blockMetricsRef.current.get(entry.id);
      let topDelta = metric?.topDelta ?? 0;
      let height = metric?.height ?? 0;
      let visibleStartPct = metric?.visibleStartPct ?? 0;
      let visibleEndPct = metric?.visibleEndPct ?? 1;
      let anchorPct = metric?.anchorPct ?? 0.5;
      let rootH = metric?.rootHeight ?? rootHeight;
      if (!metric) {
        const el = getElementForId(entry.id);
        if (el) {
          const rect = el.getBoundingClientRect();
          topDelta = rect.top - rootTop;
          height = rect.height;
          rootH = rootHeight;
          const visibleStart = Math.max(rect.top, rootTop);
          const visibleEnd = Math.min(rect.bottom, rootTop + rootHeight);
          visibleStartPct = clamp((visibleStart - rect.top) / Math.max(height, 1), 0, 1);
          visibleEndPct = clamp((visibleEnd - rect.top) / Math.max(height, 1), 0, 1);
          anchorPct = clamp((visibleStartPct + visibleEndPct) * 0.5, 0, 1);
        }
      }
      if (!height || height < 1) height = rootHeight * 0.1;
      if (!rootH || rootH < 1) rootH = rootHeight;
      const centerY = topDelta + height * 0.5;
      const bottomY = topDelta + height;

      const topProx = 1 - Math.min(Math.abs(topDelta) / Math.max(rootH, 1), 1);
      const readingProx = 1 - Math.min(Math.abs(centerY - focusLine) / Math.max(rootH, 1), 1);
      const dirTarget = direction === "down" ? 0.35 : direction === "up" ? 0.65 : 0.5;
      const dirProx = 1 - Math.min(Math.abs(anchorPct - dirTarget) / 0.65, 1);
      const edgeBias =
        direction === "down" && visibleStartPct > 0.6
          ? -0.06
          : direction === "up" && visibleEndPct < 0.4
            ? -0.06
            : 0;

      const lastCurrent = lastCurrentAtRef.current.get(entry.id) ?? 0;
      const dwellBonus =
        entry.id === currentBlockIdRef.current ? 0.15 : now - lastCurrent < 2500 ? 0.08 : 0;

      const rawScore =
        0.4 * entry.ratio + 0.28 * readingProx + 0.17 * topProx + 0.08 * dirProx + edgeBias + dwellBonus;
      const prev = scoreEMARef.current.get(entry.id);
      const ema = prev == null ? rawScore : 0.65 * prev + 0.35 * rawScore;
      scoreEMARef.current.set(entry.id, ema);

      candidates.push({
        id: entry.id,
        ratio: entry.ratio,
        topDelta,
        height,
        centerY,
        bottomY,
        score: ema,
        anchor: Math.round(anchorPct * 1000) / 1000,
        visibleStartPct,
        visibleEndPct,
      });
    }

    if (candidates.length === 0) {
      currentBlockIdRef.current = "";
      currentBlockConfidenceRef.current = 0;
      return { visible, current: null };
    }

    candidates.sort((a, b) => b.score - a.score);
    debugCandidatesRef.current = candidates.slice(0, 5).map((c) => ({
      id: c.id,
      score: Math.round(c.score * 1000) / 1000,
      ratio: Math.round(c.ratio * 1000) / 1000,
      topDelta: Math.round(c.topDelta),
      centerY: Math.round(c.centerY),
      anchor: c.anchor,
    }));
    const best = candidates[0];
    const currentId = currentBlockIdRef.current;
    const current = currentId ? candidates.find((c) => c.id === currentId) : null;

    if (!best || best.ratio < CURRENT_RATIO_MIN) {
      currentBlockIdRef.current = "";
      currentBlockConfidenceRef.current = 0;
      return { visible, current: null };
    }

    let selected = best;
    const nowSwitchWindow = now - lastSwitchAtRef.current;
    if (current && current.id !== best.id && current.ratio >= CURRENT_RATIO_MIN) {
      const delta = best.score - current.score;
      const enoughGap = delta > 0.06;
      const pastMinInterval = nowSwitchWindow > 250;
      let directionGate = true;
      if (direction === "down") {
        directionGate = best.topDelta <= focusLine * 1.05;
      } else if (direction === "up") {
        directionGate = best.bottomY >= focusLine * 0.95;
      }
      if (!(pastMinInterval && enoughGap && directionGate)) {
        selected = current;
      }
    }

    if (selected.id !== currentBlockIdRef.current) {
      currentBlockIdRef.current = selected.id;
      lastSwitchAtRef.current = now;
      lastCurrentAtRef.current.set(selected.id, now);
    }

    const proximity = Math.max(
      0,
      1 - Math.min(Math.abs(selected.centerY - focusLine) / Math.max(rootHeight, 1), 1)
    );
    const confidence = Math.min(1, Math.max(0, 0.55 * selected.ratio + 0.45 * proximity));
    currentBlockConfidenceRef.current = confidence;

    return {
      visible,
      current: {
        id: selected.id,
        confidence: Math.round(confidence * 1000) / 1000,
      },
    };
  }, [applyGazeBias, eyeTrackingEnabled, eyeTrackingStatus, gazeRef, resolveScrollContainer]);

  const buildReadingSnapshot = useCallback(() => {
    const credits = Array.from(readCreditsRef.current.entries());
    credits.sort((a, b) => b[1] - a[1]);
    const topCredits: Record<string, number> = {};
    for (const [id, credit] of credits.slice(0, 12)) {
      topCredits[id] = Math.round(credit * 1000) / 1000;
    }
    const lineCredits = Array.from(lineCreditsRef.current.entries());
    lineCredits.sort((a, b) => b[1] - a[1]);
    const topLineCredits: Record<string, number> = {};
    for (const [id, credit] of lineCredits.slice(0, 12)) {
      topLineCredits[id] = Math.round(credit * 1000) / 1000;
    }
    const blockLineCredits = Array.from(blockLineCreditsRef.current.entries());
    blockLineCredits.sort((a, b) => b[1] - a[1]);
    const topBlockLineCredits: Record<string, number> = {};
    for (const [id, credit] of blockLineCredits.slice(0, 12)) {
      topBlockLineCredits[id] = Math.round(credit * 1000) / 1000;
    }
    const allRead = Array.from(readBlocksRef.current);
    const trimmedRead = allRead.length > 80 ? allRead.slice(-80) : allRead;
    return {
      read_blocks: trimmedRead,
      read_block_count: readBlocksRef.current.size,
      read_credit_top: topCredits,
      line_read_count: lineCreditsRef.current.size,
      line_credit_top: topLineCredits,
      block_line_credit_top: topBlockLineCredits,
      eye_tracking: {
        enabled: eyeTrackingEnabled,
        status: eyeTrackingStatus,
        quality: eyeQuality,
      },
    };
  }, [eyeTrackingEnabled, eyeTrackingStatus, eyeQuality]);

  const computeEngageMinMs = useCallback((blockId: string) => {
    const id = String(blockId || "").trim();
    const target = id ? readTargetSecondsRef.current.get(id) ?? 4 : 4;
    const dynamic = target * PROGRESS_ENGAGE_PER_SEC_MS;
    return clamp(PROGRESS_ENGAGE_BASE_MS + dynamic, PROGRESS_ENGAGE_MIN_MS, PROGRESS_ENGAGE_MAX_MS);
  }, []);

  const buildProgressSnapshot = useCallback(() => {
    const progress = progressRef.current;
    if (!progress) return null;
    const engaged = progress.engaged
      ? {
          id: progress.engaged.id,
          index: progress.engaged.index,
          confidence: Math.round(progress.engaged.confidence * 1000) / 1000,
          ratio: Math.round(progress.engaged.ratio * 1000) / 1000,
          source: progress.engaged.source,
          engaged_ms: progress.engaged.engagedMs ?? 0,
          engaged_at: new Date(progress.engaged.at).toISOString(),
        }
      : null;
    const engagedSeq = progress.engagedSeq.slice(-12).map((entry) => ({
      id: entry.id,
      index: entry.index,
      confidence: Math.round(entry.confidence * 1000) / 1000,
      ratio: Math.round(entry.ratio * 1000) / 1000,
      source: entry.source,
      engaged_ms: entry.engagedMs ?? 0,
      engaged_at: new Date(entry.at).toISOString(),
    }));
    const completedSeq = progress.completedSeq.slice(-12).map((entry) => ({
      id: entry.id,
      index: entry.index,
      confidence: Math.round(entry.confidence * 1000) / 1000,
      ratio: Math.round(entry.ratio * 1000) / 1000,
      source: entry.source,
      direction: entry.direction,
      jump: entry.jump ?? 0,
      completed_at: new Date(entry.at).toISOString(),
    }));
    return {
      state: progress.state,
      confidence: Math.round(progress.confidence * 1000) / 1000,
      engaged_block: engaged,
      engaged_seq: engagedSeq,
      completed_seq: completedSeq,
      forward_count: progress.forwardCount,
      regression_count: progress.regressionCount,
      last_progress_at:
        progress.lastProgressAt > 0 ? new Date(progress.lastProgressAt).toISOString() : undefined,
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "`" && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        setDebugOverlay((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showDebugOverlay = LESSON_DEBUG_OVERLAY || debugOverlay;

  useEffect(() => {
    if (!showDebugOverlay) return;
    let timer: number | null = null;
    const tick = () => {
      const activeId = currentBlockIdRef.current || null;
      const activeMetric = activeId ? blockMetricsRef.current.get(activeId) : null;
      const visible = Array.from(visibleBlocksRef.current.entries())
        .map(([id, ratio]) => {
          const metric = blockMetricsRef.current.get(id);
          return {
            id,
            ratio: Math.round((ratio ?? 0) * 1000) / 1000,
            topDelta: Math.round(metric?.topDelta ?? 0),
            visibleStartPct: Math.round((metric?.visibleStartPct ?? 0) * 1000) / 1000,
            visibleEndPct: Math.round((metric?.visibleEndPct ?? 1) * 1000) / 1000,
            hiddenTopPct: Math.round((metric?.hiddenTopPct ?? 0) * 1000) / 1000,
            hiddenBottomPct: Math.round((metric?.hiddenBottomPct ?? 0) * 1000) / 1000,
            anchorPct: Math.round((metric?.anchorPct ?? 0.5) * 1000) / 1000,
          };
        })
        .sort((a, b) => b.ratio - a.ratio)
        .slice(0, 16);
      const progress = progressRef.current;
      const engagedId = progress.engaged?.id ?? null;
      const completedId = progress.completedSeq.length
        ? progress.completedSeq[progress.completedSeq.length - 1]?.id ?? null
        : null;
      const progressingSinceSec = progress.progressingSince
        ? Math.round((Date.now() - progress.progressingSince) / 100) / 10
        : 0;

      setDebugOverlayData({
        activeId,
        activeMetric: activeMetric
          ? {
              ratio: Math.round((activeMetric.ratio ?? 0) * 1000) / 1000,
              topDelta: Math.round(activeMetric.topDelta ?? 0),
              height: Math.round(activeMetric.height ?? 0),
              rootHeight: Math.round(activeMetric.rootHeight ?? 0),
              visibleStartPct: Math.round((activeMetric.visibleStartPct ?? 0) * 1000) / 1000,
              visibleEndPct: Math.round((activeMetric.visibleEndPct ?? 1) * 1000) / 1000,
              hiddenTopPct: Math.round((activeMetric.hiddenTopPct ?? 0) * 1000) / 1000,
              hiddenBottomPct: Math.round((activeMetric.hiddenBottomPct ?? 0) * 1000) / 1000,
              anchorPct: Math.round((activeMetric.anchorPct ?? 0.5) * 1000) / 1000,
            }
          : null,
        visible,
        scrollPercent: Math.round((currentScrollPercentRef.current ?? 0) * 10) / 10,
        progress: {
          state: progress.state,
          confidence: Math.round(progress.confidence * 1000) / 1000,
          engagedId,
          completedId,
          forwardCount: progress.forwardCount,
          regressionCount: progress.regressionCount,
          engagedSeq: progress.engagedSeq.slice(-6).map((entry) => entry.id),
          completedSeq: progress.completedSeq.slice(-6).map((entry) => entry.id),
          progressingSinceSec,
        },
      });
    };
    tick();
    timer = window.setInterval(tick, 200);
    return () => {
      if (timer != null) window.clearInterval(timer);
    };
  }, [showDebugOverlay]);

  const flushSessionSync = useCallback(
    (opts?: { clear?: boolean; immediate?: boolean }) => {
      if (!user?.id) return;
      if (sessionSyncTimerRef.current != null) {
        clearTimeout(sessionSyncTimerRef.current);
        sessionSyncTimerRef.current = null;
      }
      if (sessionIdleTimerRef.current != null) {
        clearTimeout(sessionIdleTimerRef.current);
        sessionIdleTimerRef.current = null;
      }
      if (sessionForceTimerRef.current != null) {
        clearTimeout(sessionForceTimerRef.current);
        sessionForceTimerRef.current = null;
      }

      const clear = Boolean(opts?.clear);
      const snapshot = clear ? { visible: [], current: null } : buildVisibleSnapshot();
      const scroll = clear ? null : currentScrollPercentRef.current;
      const metadata = {
        visible_blocks: snapshot.visible,
        current_block: snapshot.current,
        visible_block_count: snapshot.visible.length,
        reading: clear ? null : buildReadingSnapshot(),
        progress: clear ? null : buildProgressSnapshot(),
        viewport: {
          w: typeof window !== "undefined" ? window.innerWidth : 0,
          h: typeof window !== "undefined" ? window.innerHeight : 0,
        },
      };
      const signature = JSON.stringify({
        active_doc_block_id: clear ? null : snapshot.current?.id ?? null,
        scroll_percent: clear ? null : scroll,
        metadata,
      });
      if (!clear && signature === lastSessionPayloadRef.current) {
        sessionDirtyRef.current = false;
        return;
      }
      lastSessionPayloadRef.current = signature;
      lastSessionSyncAtRef.current = Date.now();
      sessionDirtyRef.current = false;
      queueSessionPatch(
        {
          active_doc_block_id: clear ? null : snapshot.current?.id ?? null,
          scroll_percent: clear ? null : scroll,
        },
        metadata,
        { immediate: Boolean(opts?.immediate) }
      );
    },
    [buildProgressSnapshot, buildReadingSnapshot, buildVisibleSnapshot, user?.id]
  );

  const scheduleSessionSync = useCallback(
    (opts?: { immediate?: boolean }) => {
      if (opts?.immediate) {
        flushSessionSync({ immediate: true });
        return;
      }
      sessionDirtyRef.current = true;
      lastSessionChangeAtRef.current = Date.now();

      if (sessionSyncTimerRef.current == null) {
        const now = Date.now();
        const elapsed = now - lastSessionSyncAtRef.current;
        const delay = Math.max(0, SESSION_SYNC_MIN_INTERVAL_MS - elapsed);
        sessionSyncTimerRef.current = window.setTimeout(() => {
          sessionSyncTimerRef.current = null;
          if (sessionDirtyRef.current) flushSessionSync();
        }, delay);
      }

      if (sessionIdleTimerRef.current != null) {
        clearTimeout(sessionIdleTimerRef.current);
      }
      sessionIdleTimerRef.current = window.setTimeout(() => {
        sessionIdleTimerRef.current = null;
        if (sessionDirtyRef.current) flushSessionSync({ immediate: true });
      }, SESSION_SYNC_IDLE_MS);

      if (sessionForceTimerRef.current == null) {
        sessionForceTimerRef.current = window.setTimeout(() => {
          sessionForceTimerRef.current = null;
          if (sessionDirtyRef.current) flushSessionSync({ immediate: true });
        }, SESSION_SYNC_MAX_LATENCY_MS);
      }
    },
    [flushSessionSync]
  );

  const markBlockRead = useCallback(
    (blockId: string, source: "behavioral" | "gaze", credit: number) => {
      const id = String(blockId || "").trim();
      if (!id || readBlocksRef.current.has(id)) return;
      readBlocksRef.current.add(id);
      readCreditsRef.current.set(id, Math.max(credit, 1));
      const progress = progressRef.current;
      const progressState = progress?.state ?? "";
      const progressConfidence = progress
        ? Math.round(progress.confidence * 1000) / 1000
        : undefined;
      queueEvent({
        type: "block_read",
        pathId: pathIdRef.current || "",
        pathNodeId: nodeId || "",
        data: {
          block_id: id,
          read_credit: Math.min(1, Math.max(credit, 0)),
          source,
          progress_state: progressState,
          progress_confidence: progressConfidence,
        },
      });
      scheduleSessionSync({ immediate: true });
    },
    [nodeId, scheduleSessionSync]
  );

  // Record exposure as aggregated scroll depth + dwell time (production-safe: one event per node view).
  useEffect(() => {
    if (!nodeId) return;
    openedAtRef.current = Date.now();
    maxScrollPercentRef.current = 0;
    currentScrollPercentRef.current = 0;

    const scrollContainer = resolveScrollContainer();
    const onScroll = () => {
      const docEl = document.documentElement;
      const scrollTop =
        scrollContainer?.scrollTop ??
        (typeof docEl.scrollTop === "number" ? docEl.scrollTop : window.scrollY || 0);
      const scrollHeight =
        scrollContainer?.scrollHeight ?? (typeof docEl.scrollHeight === "number" ? docEl.scrollHeight : 0);
      const clientHeight =
        scrollContainer?.clientHeight ??
        (typeof docEl.clientHeight === "number" ? docEl.clientHeight : Math.max(window.innerHeight, 1));
      const denom = Math.max(1, scrollHeight - clientHeight);
      const pct = Math.max(0, Math.min(100, Math.round((scrollTop / denom) * 100)));
      const delta = scrollTop - (lastScrollTopRef.current || 0);
      const now = Date.now();
      const elapsed = now - (lastScrollAtRef.current || now);
      if (elapsed > 0) {
        scrollVelocityRef.current = Math.abs(delta) / elapsed * 1000;
      }
      lastScrollAtRef.current = now;
      if (Math.abs(delta) > 2) {
        scrollDirRef.current = delta > 0 ? "down" : "up";
      }
      lastScrollTopRef.current = scrollTop;
      if (pct > maxScrollPercentRef.current) maxScrollPercentRef.current = pct;
      currentScrollPercentRef.current = pct;
      scheduleSessionSync();
    };

    if (scrollContainer) {
      scrollContainer.addEventListener("scroll", onScroll, { passive: true });
    } else {
      window.addEventListener("scroll", onScroll, { passive: true });
    }
    onScroll();

    return () => {
      if (scrollContainer) {
        scrollContainer.removeEventListener("scroll", onScroll);
      } else {
        window.removeEventListener("scroll", onScroll);
      }
      const dwellMs = Math.max(0, Date.now() - (openedAtRef.current || Date.now()));
      const maxPercent = Math.max(0, Math.min(100, Math.round(maxScrollPercentRef.current || 0)));
      queueEvent({
        type: "scroll_depth",
        pathId: pathIdRef.current || "",
        pathNodeId: nodeId,
        conceptIds: nodeConceptIdsRef.current,
        data: {
          source: "node_doc",
          percent: maxPercent,
          max_percent: maxPercent,
          dwell_ms: dwellMs,
        },
      });
    };
  }, [nodeId, resolveScrollContainer, scheduleSessionSync]);

  useEffect(() => {
    if (!nodeId || docBlocks.length === 0) return;
    let timer: number | null = null;
    lastReadTickRef.current = performance.now();

    const tick = () => {
      const now = performance.now();
      const last = lastReadTickRef.current || now;
      const dt = now - last;
      lastReadTickRef.current = now;
      if (dt <= 0 || document.hidden) return;

      const scrollRoot = resolveScrollContainer();
      const rootRect = scrollRoot?.getBoundingClientRect();
      const rootTop = rootRect?.top ?? 0;
      const rootHeight = Math.max(rootRect?.height ?? window.innerHeight, 1);
      const speedScreens = rootHeight > 0 ? scrollVelocityRef.current / rootHeight : 0;
      const speedFactor = clamp(1 - speedScreens / READ_MAX_SCREENS_PER_SEC, 0, 1);
      if (speedFactor <= 0.05) return;

      const dtMs = Math.min(dt, 1000);
      const dtSec = dtMs / 1000;
      let updated = false;

      let focusY = rootTop + rootHeight * READ_LINE_RATIO;
      let source: "behavioral" | "gaze" = "behavioral";
      let gazeBlockId = "";
      let restrictToGaze = false;
      let gazeConfidenceFactor = 1;
      const nowMs = Date.now();

      if (eyeTrackingEnabled && eyeTrackingStatus === "active") {
        const gazePoint = getSmoothedGaze(nowMs);
        const corrected = gazePoint ? applyGazeBias(gazePoint.x, gazePoint.y) : null;
        const fresh = gazePoint ? nowMs - (gazePoint.ts ?? nowMs) <= 800 : false;
        const stable = gazePoint ? gazePoint.velocity <= GAZE_MAX_VELOCITY_PX_S : false;
        const inViewport =
          corrected != null ? corrected.y >= rootTop && corrected.y <= rootTop + rootHeight : false;
        const gazeOk =
          Boolean(gazePoint && corrected && gazePoint.confidence >= GAZE_MIN_CONFIDENCE && stable && fresh && inViewport);
        const gazeSample =
          gazeOk && gazePoint && corrected
            ? {
                x: corrected.x,
                y: corrected.y,
                confidence: gazePoint.confidence,
                velocity: gazePoint.velocity,
                ts: gazePoint.ts ?? nowMs,
              }
            : null;

        const behaviorY = rootTop + rootHeight * READ_LINE_RATIO;
        const lineState = updateLineState({
          nowMs,
          rootTop,
          rootBottom: rootTop + rootHeight,
          rootHeight,
          behaviorY,
          gazePoint: gazeSample,
          dtMs,
        });

        const lineStateOk = Boolean(lineState?.line && lineState.confidence >= LINE_STATE_MIN_CONFIDENCE);
        const strictFallbackLine = LINE_SNAP_STRICT
          ? findNearestVisibleLine(gazeSample?.y ?? behaviorY, rootTop, rootTop + rootHeight)
          : null;
        const activeLine = lineState?.line ?? strictFallbackLine;

        if (activeLine && (lineStateOk || LINE_SNAP_STRICT)) {
          focusY = activeLine.centerY;
          gazeBlockId = activeLine.blockId;
          if (gazeSample) {
            gazeConfidenceFactor = clamp(
              (gazeSample.confidence - GAZE_MIN_CONFIDENCE) / Math.max(1 - GAZE_MIN_CONFIDENCE, 0.01),
              0.2,
              1
            );
          }
          if (lineState?.usedGaze && gazeSample) {
            source = "gaze";
            restrictToGaze = true;
            const lineCenterX = (activeLine.left + activeLine.right) * 0.5;
            const lineCenterY = activeLine.centerY;
            updateGazeBias(gazeSample.x - lineCenterX, gazeSample.y - lineCenterY);
            recordLineDwell(gazeBlockId, activeLine, dtMs);
          }
        } else if (gazeOk && corrected && gazePoint) {
          const snapped = getSnappedGaze(corrected.x, corrected.y);
          const snapPoint = snapped.snap !== "none" ? { x: snapped.x, y: snapped.y } : corrected;
          focusY = snapPoint.y;
          gazeConfidenceFactor = clamp(
            (gazePoint.confidence - GAZE_MIN_CONFIDENCE) / Math.max(1 - GAZE_MIN_CONFIDENCE, 0.01),
            0.2,
            1
          );
          gazeBlockId = snapped.blockId || findGazeBlock(snapPoint.x, snapPoint.y);
          const gazeLine = snapped.line ?? (gazeBlockId ? findGazeLine(gazeBlockId, snapPoint.x, snapPoint.y) : null);
          if (gazeLine && gazeLine.inside) {
            source = "gaze";
            restrictToGaze = true;
            const lineCenterX = (gazeLine.left + gazeLine.right) * 0.5;
            const lineCenterY = (gazeLine.top + gazeLine.bottom) * 0.5;
            updateGazeBias(corrected.x - lineCenterX, corrected.y - lineCenterY);
            recordLineDwell(gazeBlockId, gazeLine, dtMs);
          }
        }
      }

      for (const [id, metric] of blockMetricsRef.current.entries()) {
        if (restrictToGaze && id !== gazeBlockId) continue;
        const ratio = metric.ratio ?? 0;
        if (ratio < READ_VISIBLE_RATIO_MIN) continue;
        const height = metric.height || 1;
        const centerY = rootTop + (metric.topDelta || 0) + height * 0.5;
        const distance = Math.abs(centerY - focusY);
        const focusFactor = 1 - Math.min(distance / Math.max(rootHeight, 1), 1);
        const weight = ratio * focusFactor * speedFactor * gazeConfidenceFactor;
        if (weight < READ_MIN_WEIGHT) continue;
        const required = readTargetSecondsRef.current.get(id) ?? 4;
        const prev = readCreditsRef.current.get(id) ?? 0;
        let next = clamp(prev + (dtSec / required) * weight, 0, 1);
        const lineCredit = blockLineCreditsRef.current.get(id) ?? 0;
        if (lineCredit > next) next = lineCredit;
        if (next !== prev) {
          readCreditsRef.current.set(id, next);
          updated = true;
        }
        if (next >= READ_CREDIT_THRESHOLD && !readBlocksRef.current.has(id)) {
          markBlockRead(id, source, next);
        }
      }

      if (updated) {
        scheduleSessionSync();
      }
    };

    timer = window.setInterval(tick, READ_TICK_MS);
    return () => {
      if (timer != null) window.clearInterval(timer);
    };
  }, [
    applyGazeBias,
    docBlocks.length,
    eyeTrackingEnabled,
    eyeTrackingStatus,
    findGazeBlock,
    findGazeLine,
    getSnappedGaze,
    gazeRef,
    getSmoothedGaze,
    findNearestVisibleLine,
    markBlockRead,
    nodeId,
    recordLineDwell,
    resolveScrollContainer,
    scheduleSessionSync,
    updateLineState,
    updateGazeBias,
  ]);

  useEffect(() => {
    if (!nodeId || docBlocks.length === 0) return;
    let timer: number | null = null;

    const tick = () => {
      if (document.hidden) return;
      const now = Date.now();
      const progress = progressRef.current;
      const activeId = String(currentBlockIdRef.current || "").trim();
      const activeConfidence = currentBlockConfidenceRef.current || 0;
      const metric = activeId ? blockMetricsRef.current.get(activeId) : null;
      const ratio = metric?.ratio ?? 0;
      const rootHeight = Math.max(metric?.rootHeight ?? window.innerHeight, 1);
      const speedScreens = rootHeight > 0 ? scrollVelocityRef.current / rootHeight : 0;

      if (activeId && activeId !== progress.lastActiveId) {
        progress.lastActiveId = activeId;
        progress.activeChanges.push(now);
      }
      if (activeId) {
        progress.lastActiveAt = now;
      }
      progress.activeChanges = progress.activeChanges.filter(
        (ts) => now - ts <= PROGRESS_ACTIVE_CHANGE_WINDOW_MS
      );

      const activeDuration = activeId ? now - lastSwitchAtRef.current : 0;
      const minEngageMs = activeId ? computeEngageMinMs(activeId) : PROGRESS_ENGAGE_MIN_MS;
      const engagedOk =
        Boolean(activeId) &&
        activeDuration >= minEngageMs &&
        activeConfidence >= PROGRESS_ENGAGE_CONF_MIN &&
        ratio >= PROGRESS_ENGAGE_RATIO_MIN &&
        speedScreens <= PROGRESS_MAX_SCREENS_PER_SEC;

      let scanBoost = false;
      let pendingViewed:
        | {
            id: string;
            dwellMs: number;
            ratio: number;
            activeConfidence: number;
          }
        | null = null;

      if (engagedOk && activeId) {
        const prevEngaged = progress.engaged;
        if (!prevEngaged || prevEngaged.id !== activeId) {
          const index = blockOrder.get(activeId) ?? -1;
          const source: "behavioral" | "gaze" | "unknown" =
            eyeTrackingEnabled && gazeLastBlockRef.current === activeId ? "gaze" : "behavioral";
          const entry: ProgressEntry = {
            id: activeId,
            index,
            at: now,
            confidence: activeConfidence,
            ratio,
            source,
            engagedMs: activeDuration,
          };
          progress.engaged = entry;
          progress.engagedSeq.push(entry);
          if (progress.engagedSeq.length > 40) {
            progress.engagedSeq = progress.engagedSeq.slice(-40);
          }
          progress.lastEngageAt = now;

          if (!engagedBlocksRef.current.has(activeId)) {
            pendingViewed = {
              id: activeId,
              dwellMs: activeDuration,
              ratio,
              activeConfidence,
            };
          }

          if (prevEngaged && prevEngaged.id !== activeId) {
            const prevIndex = prevEngaged.index;
            const currIndex = index;
            if (prevIndex >= 0 && currIndex >= 0 && prevIndex != currIndex) {
              const jump = currIndex - prevIndex;
              if (jump > 0) {
                const largeJump = jump > PROGRESS_MAX_FORWARD_JUMP;
                if (largeJump) scanBoost = true;
                const completion: ProgressEntry = {
                  ...prevEngaged,
                  at: now,
                  direction: "forward",
                  jump,
                  confidence: largeJump ? prevEngaged.confidence * 0.6 : prevEngaged.confidence,
                };
                progress.completedSeq.push(completion);
                if (progress.completedSeq.length > 60) {
                  progress.completedSeq = progress.completedSeq.slice(-60);
                }
                progress.lastCompleteAt = now;
                progress.lastProgressAt = now;
              } else {
                const regression: ProgressEntry = {
                  ...prevEngaged,
                  at: now,
                  direction: "back",
                  jump,
                };
                progress.regressionSeq.push(regression);
                if (progress.regressionSeq.length > 60) {
                  progress.regressionSeq = progress.regressionSeq.slice(-60);
                }
                progress.lastProgressAt = now;
              }
            }
          }
        } else if (progress.engaged) {
          progress.engaged.engagedMs = Math.max(progress.engaged.engagedMs ?? 0, activeDuration);
        }
      }

      progress.completedSeq = progress.completedSeq.filter((entry) => now - entry.at <= PROGRESS_WINDOW_MS);
      progress.regressionSeq = progress.regressionSeq.filter((entry) => now - entry.at <= PROGRESS_WINDOW_MS);

      const forwardCount = progress.completedSeq.length;
      const regressionCount = progress.regressionSeq.length;
      progress.forwardCount = forwardCount;
      progress.regressionCount = regressionCount;

      const totalTransitions = forwardCount + regressionCount;
      const forwardRatio = totalTransitions > 0 ? forwardCount / totalTransitions : 0;

      const rapidChanges = progress.activeChanges.length >= PROGRESS_ACTIVE_CHANGE_MIN;
      const scanning =
        scanBoost || speedScreens >= PROGRESS_SCAN_SCREENS_PER_SEC || rapidChanges;

      let state: ProgressState = "idle";
      if (forwardCount >= PROGRESS_MIN_FORWARD && forwardRatio >= PROGRESS_MIN_FORWARD_RATIO) {
        state = "progressing";
      } else if (regressionCount >= PROGRESS_MIN_REGRESSION && forwardRatio < 0.5) {
        state = "searching";
      } else if (scanning) {
        state = "scanning";
      }

      let confidence = clamp(
        0.15 + 0.55 * forwardRatio + 0.3 * Math.min(forwardCount / 4, 1),
        0,
        1
      );
      if (engagedOk && activeConfidence > 0) {
        confidence = clamp(confidence * (0.7 + 0.3 * activeConfidence), 0, 1);
      }
      if (state === "scanning") confidence = Math.min(confidence, 0.35);
      if (state === "searching") confidence = Math.min(confidence, 0.4);
      if (state === "idle") confidence = Math.min(confidence, 0.25);

      progress.state = state;
      progress.confidence = confidence;
      if (state === "progressing") {
        if (!progress.progressingSince) {
          progress.progressingSince = now;
        }
      } else {
        progress.progressingSince = 0;
      }

      if (pendingViewed && !engagedBlocksRef.current.has(pendingViewed.id)) {
        const progressState = state;
        const progressConfidence = Math.round(confidence * 1000) / 1000;
        engagedBlocksRef.current.add(pendingViewed.id);
        queueEvent({
          type: "block_viewed",
          pathId: pathIdRef.current || "",
          pathNodeId: nodeId || "",
          data: {
            block_id: pendingViewed.id,
            dwell_ms: pendingViewed.dwellMs,
            confidence: Math.round(pendingViewed.activeConfidence * 1000) / 1000,
            ratio: Math.round(pendingViewed.ratio * 1000) / 1000,
            progress_state: progressState,
            progress_confidence: progressConfidence,
          },
        });
      }

      const signature = JSON.stringify({
        state,
        conf: Math.round(confidence * 1000) / 1000,
        engaged: progress.engaged?.id ?? "",
        completed: progress.completedSeq.length
          ? progress.completedSeq[progress.completedSeq.length - 1]?.id ?? ""
          : "",
        forward: forwardCount,
        regression: regressionCount,
      });
      if (signature !== progressSignatureRef.current) {
        progressSignatureRef.current = signature;
        scheduleSessionSync();
      }
    };

    timer = window.setInterval(tick, PROGRESS_TICK_MS);
    return () => {
      if (timer != null) window.clearInterval(timer);
    };
  }, [blockOrder, computeEngageMinMs, docBlocks.length, eyeTrackingEnabled, nodeId, scheduleSessionSync]);

  useEffect(() => {
    if (!nodeId) return;
    let timer: number | null = null;
    const tick = () => {
      if (!gazeStreamEnabled || !gazeEnabledRef.current) return;
      if (document.hidden) return;
      const now = Date.now();
      const gazePoint = getSmoothedGaze(now);
      if (!gazePoint || gazePoint.confidence < GAZE_MIN_CONFIDENCE) return;
      const corrected = applyGazeBias(gazePoint.x, gazePoint.y);
      const scrollRoot = resolveScrollContainer();
      const rootRect = scrollRoot?.getBoundingClientRect();
      const rootTop = rootRect?.top ?? 0;
      const rootHeight = Math.max(rootRect?.height ?? window.innerHeight, 1);
      const behaviorY = rootTop + rootHeight * READ_LINE_RATIO;
      const lineState = updateLineState({
        nowMs: now,
        rootTop,
        rootBottom: rootTop + rootHeight,
        rootHeight,
        behaviorY,
        gazePoint: {
          x: corrected.x,
          y: corrected.y,
          confidence: gazePoint.confidence,
          velocity: gazePoint.velocity,
          ts: gazePoint.ts ?? now,
        },
        dtMs: GAZE_TICK_MS,
      });
      const lineStateOk = Boolean(lineState?.line && lineState.confidence >= LINE_STATE_MIN_CONFIDENCE);
      const strictFallbackLine = LINE_SNAP_STRICT
        ? findNearestVisibleLine(corrected.y, rootTop, rootTop + rootHeight)
        : null;
      const snapped = getSnappedGaze(corrected.x, corrected.y);
      const snapPoint = snapped.snap !== "none" ? { x: snapped.x, y: snapped.y } : corrected;
      const line = (lineStateOk ? lineState?.line ?? null : null) ?? strictFallbackLine ?? snapped.line ?? null;
      const blockId = line?.blockId || snapped.blockId || findGazeBlock(snapPoint.x, snapPoint.y);
      if (!blockId) return;
      const fallbackLine = line ?? findGazeLine(blockId, snapPoint.x, snapPoint.y);
      const lineCenterX = fallbackLine ? (fallbackLine.left + fallbackLine.right) * 0.5 : snapPoint.x;
      const lineCenterY = fallbackLine ? (fallbackLine.top + fallbackLine.bottom) * 0.5 : snapPoint.y;
      const snapLabel = lineStateOk ? "line_state" : strictFallbackLine ? "line_strict" : snapped.snap;
      const dt = gazeLastHitAtRef.current > 0 ? now - gazeLastHitAtRef.current : 0;
      gazeLastHitAtRef.current = now;
      gazeLastBlockRef.current = blockId;
      gazeQueueRef.current?.enqueue({
        block_id: blockId,
        line_id: fallbackLine?.id,
        line_index: fallbackLine?.index,
        x: lineCenterX,
        y: lineCenterY,
        confidence: gazePoint.confidence,
        ts: new Date(now).toISOString(),
        dt_ms: dt > 0 ? dt : undefined,
        read_credit: readCreditsRef.current.get(blockId) ?? 0,
        source: gazePoint.source,
        screen_w: window.innerWidth,
        screen_h: window.innerHeight,
        extra: {
          velocity_px_s: gazePoint.velocity,
          raw_x: gazePoint.x,
          raw_y: gazePoint.y,
          bias_x: gazeBiasRef.current?.x ?? 0,
          bias_y: gazeBiasRef.current?.y ?? 0,
          snap: snapLabel,
          snap_x: lineCenterX,
          snap_y: lineCenterY,
          line_state_confidence: lineStateOk ? lineState?.confidence ?? 0 : 0,
          line_state_mode: lineState?.mode ?? "reading",
        },
      });
    };
    timer = window.setInterval(tick, Math.max(60, GAZE_TICK_MS));
    return () => {
      if (timer != null) window.clearInterval(timer);
    };
  }, [
    applyGazeBias,
    findGazeBlock,
    findGazeLine,
    findNearestVisibleLine,
    getSnappedGaze,
    getSmoothedGaze,
    gazeRef,
    gazeStreamEnabled,
    nodeId,
    resolveScrollContainer,
    updateLineState,
  ]);

  useEffect(() => {
    if (!gazeDebugEnabled) return;
    let raf = 0;
    const el = gazeDebugRef.current;
    if (!el) return;
    const tick = () => {
      const gaze = gazeRef.current;
      const smooth = gazeSmoothRef.current;
      const point = smooth && gaze ? { x: smooth.x, y: smooth.y, confidence: gaze.confidence } : gaze;
      if (point) {
        const confidence = typeof point.confidence === "number" ? point.confidence : 0;
        const clamped = Math.max(0, Math.min(1, confidence));
        const opacity = 0.35 + clamped * 0.65;
        const corrected = applyGazeBias(point.x, point.y);
        const snapped = getSnappedGaze(corrected.x, corrected.y, { force: true });
        const snapPoint = snapped.snap !== "none" ? { x: snapped.x, y: snapped.y } : corrected;
        el.style.transform = `translate3d(${Math.round(snapPoint.x)}px, ${Math.round(snapPoint.y)}px, 0)`;
        el.style.opacity = String(opacity);
      } else {
        el.style.opacity = "0";
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [applyGazeBias, getSnappedGaze, gazeDebugEnabled, gazeRef]);

  useEffect(() => {
    if (!nodeId || !doc) return;
    let observer: IntersectionObserver | null = null;
    let raf = 0;
    visibleBlocksRef.current.clear();
    lastSessionPayloadRef.current = "";

    const init = () => {
      const container = docContainerRef.current ?? document;
      const elements = Array.from(container.querySelectorAll<HTMLElement>("[data-doc-block-id]"));
      if (elements.length === 0) return;
      const scrollContainer = resolveScrollContainer();
      const thresholds = [0, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 1];
      observer = new IntersectionObserver(
        (entries) => {
          let changed = false;
          for (const entry of entries) {
            const target = entry.target as HTMLElement;
            const id = String(target.dataset.docBlockId || "").trim();
            if (!id) continue;
            const ratio = Math.max(0, Math.min(1, entry.intersectionRatio || 0));
            const rect = target.getBoundingClientRect();
            const rootRect = scrollContainer?.getBoundingClientRect();
            const rootTop = rootRect?.top ?? 0;
            const rootHeight = Math.max(rootRect?.height ?? window.innerHeight, 1);
            const rootBottom = rootTop + rootHeight;
            const visibleStart = Math.max(rect.top, rootTop);
            const visibleEnd = Math.min(rect.bottom, rootBottom);
            const visibleHeight = Math.max(0, visibleEnd - visibleStart);
            const height = rect.height || 1;
            const visibleStartPct = clamp((visibleStart - rect.top) / height, 0, 1);
            const visibleEndPct = clamp((visibleEnd - rect.top) / height, 0, 1);
            const hiddenTopPct = clamp((rootTop - rect.top) / height, 0, 1);
            const hiddenBottomPct = clamp((rect.bottom - rootBottom) / height, 0, 1);
            const anchorPct = clamp((visibleStartPct + visibleEndPct) * 0.5, 0, 1);
            blockMetricsRef.current.set(id, {
              ratio,
              topDelta: rect.top - rootTop,
              height,
              visibleHeight,
              rootHeight,
              top: rect.top,
              bottom: rect.bottom,
              left: rect.left,
              right: rect.right,
              visibleStartPct,
              visibleEndPct,
              hiddenTopPct,
              hiddenBottomPct,
              anchorPct,
              seenAt: Date.now(),
            });
            blockBoundsRef.current.set(id, {
              top: rect.top,
              bottom: rect.bottom,
              left: rect.left,
              right: rect.right,
              seenAt: Date.now(),
            });
            if (ratio < VISIBLE_RATIO_MIN) {
              if (visibleBlocksRef.current.has(id)) {
                visibleBlocksRef.current.delete(id);
                changed = true;
              }
              continue;
            }
            const prev = visibleBlocksRef.current.get(id) ?? 0;
            visibleBlocksRef.current.set(id, ratio);
            if (Math.abs(prev - ratio) >= 0.02) changed = true;
          }
          if (changed) scheduleSessionSync();
        },
        { root: scrollContainer ?? null, threshold: thresholds }
      );
      elements.forEach((el) => observer?.observe(el));
      scheduleSessionSync();
    };

    raf = window.requestAnimationFrame(init);

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      if (observer) observer.disconnect();
      if (sessionSyncTimerRef.current != null) {
        clearTimeout(sessionSyncTimerRef.current);
        sessionSyncTimerRef.current = null;
      }
      if (sessionIdleTimerRef.current != null) {
        clearTimeout(sessionIdleTimerRef.current);
        sessionIdleTimerRef.current = null;
      }
      if (sessionForceTimerRef.current != null) {
        clearTimeout(sessionForceTimerRef.current);
        sessionForceTimerRef.current = null;
      }
      visibleBlocksRef.current.clear();
      blockMetricsRef.current.clear();
      blockBoundsRef.current.clear();
      blockLineRectsRef.current.clear();
      scoreEMARef.current.clear();
      lastCurrentAtRef.current.clear();
      currentBlockIdRef.current = "";
      flushSessionSync({ clear: true, immediate: true });
    };
  }, [doc, nodeId, scheduleSessionSync, flushSessionSync, resolveScrollContainer]);

  const conceptLabels = useMemo(() => {
    return conceptKeys.map((k) => conceptNameByKey.get(k) ?? humanizeConceptKey(k));
  }, [conceptKeys, conceptNameByKey]);

  useEffect(() => {
    if (!feedbackStorageKey) return;
    try {
      const raw = localStorage.getItem(feedbackStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        setBlockFeedback(parsed);
      }
    } catch {
      // ignore storage errors
    }
  }, [feedbackStorageKey]);

  useEffect(() => {
    if (!feedbackStorageKey) return;
    try {
      localStorage.setItem(feedbackStorageKey, JSON.stringify(blockFeedback || {}));
    } catch {
      // ignore storage errors
    }
  }, [feedbackStorageKey, blockFeedback]);

  useEffect(() => {
    if (!nodeId) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await listPathNodeDocRevisions(nodeId, { limit: 50 });
        if (cancelled) return;
        const next: Record<string, boolean> = {};
        rows.forEach((r) => {
          const id = String(r?.blockId ?? "").trim();
          if (id) next[id] = true;
        });
        setUndoableBlocks(next);
      } catch (err) {
        if (!cancelled) console.warn("[PathNodePage] load revisions failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nodeId, doc]);

  const resolveBlockId = useCallback(
    (payload: Record<string, unknown> | null) => {
      if (!payload) return "";
      const fromPayload = String((payload as { block_id?: unknown }).block_id ?? "").trim();
      if (fromPayload) return fromPayload;
      const rawIdx = (payload as { block_index?: unknown }).block_index;
      const idx = typeof rawIdx === "number" && Number.isFinite(rawIdx) ? rawIdx : null;
      if (idx == null) return "";
      const parsedDoc = safeParseJSON(doc);
      const blocks = Array.isArray((parsedDoc as { blocks?: unknown })?.blocks)
        ? ((parsedDoc as { blocks: DocBlock[] }).blocks ?? [])
        : [];
      const candidate = blocks[idx]?.id ?? "";
      return String(candidate || "").trim();
    },
    [doc]
  );

  const resolveBlockIdFromIndex = useCallback(
    (index?: number | null) => {
      if (typeof index !== "number" || !Number.isFinite(index) || index < 0) return "";
      const parsedDoc = safeParseJSON(doc);
      const blocks = Array.isArray((parsedDoc as { blocks?: unknown })?.blocks)
        ? ((parsedDoc as { blocks: DocBlock[] }).blocks ?? [])
        : [];
      const candidate = blocks[index]?.id ?? "";
      return String(candidate || "").trim();
    },
    [doc]
  );

  const clearPendingEdit = useCallback(() => {
    setPendingEdit(null);
    setPendingEditBusy(false);
    pendingEditThreadIdRef.current = null;
    pendingEditSeqRef.current = 0;
    if (pendingEditPollRef.current) {
      window.clearTimeout(pendingEditPollRef.current);
      pendingEditPollRef.current = null;
    }
  }, []);

  const applyPendingEdit = useCallback(
    (proposal: NodeDocEditProposal | null, threadId?: string | null, seq?: number) => {
      if (!proposal) return;
      const proposalNodeId = normalizeProposalText(proposal.path_node_id);
      if (!proposalNodeId || String(nodeId || "") !== proposalNodeId) return;
      const incomingSeq = typeof seq === "number" && Number.isFinite(seq) ? seq : 0;
      if (incomingSeq > 0 && incomingSeq <= pendingEditSeqRef.current) return;
      pendingEditSeqRef.current = incomingSeq || pendingEditSeqRef.current;
      const thread = String(threadId || "").trim();
      if (thread) pendingEditThreadIdRef.current = thread;
      setPendingEditBusy(false);
      const blockId = normalizeProposalText(proposal.block_id);
      const resolvedId = blockId || resolveBlockIdFromIndex(proposal.block_index ?? null);
      const nextProposal =
        resolvedId && resolvedId !== blockId ? { ...proposal, block_id: resolvedId } : proposal;
      setPendingEdit(nextProposal);
      if (resolvedId) {
        window.setTimeout(() => {
          scrollToBlockId(resolvedId);
        }, 0);
      }
    },
    [nodeId, resolveBlockIdFromIndex, scrollToBlockId]
  );

  const schedulePendingEditPoll = useCallback(
    (threadId: string, attempt = 0) => {
      if (!threadId) return;
      if (pendingEditPollRef.current) {
        window.clearTimeout(pendingEditPollRef.current);
        pendingEditPollRef.current = null;
      }
      if (attempt > 6) {
        setPendingEditBusy(false);
        return;
      }
      const delay = attempt === 0 ? 600 : Math.min(3000, 600 + attempt * 500);
      pendingEditPollRef.current = window.setTimeout(() => {
        getChatThread(threadId, 30)
          .then(({ thread }) => {
            const meta = asRecord(thread?.metadata);
            const pendingKind = meta ? String(meta.pending_waitpoint_kind || "") : "";
            const pendingProposal = meta ? meta.pending_waitpoint_proposal : null;
            if (pendingKind.toLowerCase() === "node_doc_edit" && pendingProposal) {
              const proposal = parseNodeDocEditProposal({ proposal: pendingProposal });
              if (proposal) {
                applyPendingEdit(proposal, threadId, 0);
                return;
              }
            }
            if (pendingKind.toLowerCase() === "node_doc_edit") {
              schedulePendingEditPoll(threadId, attempt + 1);
            } else {
              setPendingEditBusy(false);
            }
          })
          .catch(() => {
            schedulePendingEditPoll(threadId, attempt + 1);
          });
      }, delay);
    },
    [applyPendingEdit, asRecord, parseNodeDocEditProposal]
  );

  const handleChatMessageEvent = useCallback(
    (event: string, data: unknown) => {
      if (!data || typeof data !== "object") return;
      const payload = data as { message?: unknown; thread_id?: unknown };
      const msg = payload.message as { metadata?: unknown; seq?: unknown; thread_id?: unknown } | undefined;
      if (!msg) return;
      const kind = messageKindFromMetadata(msg.metadata);
      const threadId = String(payload.thread_id ?? msg.thread_id ?? "").trim();

      if (kind === "node_doc_edit") {
        const proposal = parseNodeDocEditProposal(msg.metadata);
        const seqNum = typeof msg.seq === "number" ? msg.seq : Number(msg.seq) || 0;
        applyPendingEdit(proposal, threadId, seqNum);
        return;
      }
      if (kind === "node_doc_edit_pending") {
        if (threadId) {
          pendingEditThreadIdRef.current = threadId;
        }
        setPendingEditBusy(true);
        if (threadId) {
          schedulePendingEditPoll(threadId, 0);
        }
        return;
      }
      if (kind === "waitpoint_confirm") {
        const waitKind = stringFromMetadata(msg.metadata, ["waitpoint_kind"]);
        if (waitKind === "node_doc_edit" && pendingEditThreadIdRef.current === threadId) {
          clearPendingEdit();
        }
      }
    },
    [applyPendingEdit, clearPendingEdit, schedulePendingEditPoll]
  );

  const handleRuntimePromptEvent = useCallback((data: unknown) => {
    if (!data || typeof data !== "object") return;
    const payload = data as RuntimePromptPayload;
    const payloadPathId = String(payload.path_id ?? "").trim();
    const payloadNodeId = String(payload.node_id ?? "").trim();
    if (payloadPathId && payloadPathId !== String(pathIdRef.current || "")) return;
    if (payloadNodeId && payloadNodeId !== String(nodeIdRef.current || "")) return;
    setRuntimePrompt(payload);
  }, []);

  const handleJobUpdate = useCallback(
    (event: string, data: unknown) => {
      if (!data || typeof data !== "object") return;
      const payload = data as JobEventPayload;
      const job = payload.job as BackendJob | undefined;
      const jobType = String(payload.job_type ?? job?.job_type ?? "").toLowerCase();
      if (jobType === "node_doc_edit_apply") {
        if (event === "jobdone") {
          loadDoc().then((d) => {
            if (d !== undefined) setDoc(d);
          });
          clearPendingEdit();
        }
        if (event === "jobfailed" || event === "jobcanceled") {
          clearPendingEdit();
        }
        return;
      }
      if (jobType !== "node_doc_patch") return;
      const jobPayload = resolvePayload(job?.payload);
      const payloadNodeId = String(jobPayload?.path_node_id ?? "");
      if (payloadNodeId && String(nodeId || "") !== payloadNodeId) return;

      const jobId = String(payload.job_id ?? job?.id ?? "");
      let blockId = "";
      if (jobId && pendingJobsRef.current[jobId]) {
        blockId = pendingJobsRef.current[jobId];
      } else {
        blockId = resolveBlockId(jobPayload);
      }
      if (!blockId) return;

      if (event === "jobcreated" || event === "jobprogress") {
        setPendingBlocks((prev) => ({ ...prev, [blockId]: jobId || true }));
        if (jobId) pendingJobsRef.current[jobId] = blockId;
        return;
      }

      if (event === "jobdone") {
        setPendingBlocks((prev) => {
          const next = { ...prev };
          delete next[blockId];
          return next;
        });
        if (jobId) delete pendingJobsRef.current[jobId];
        loadDoc().then((d) => {
          if (d !== undefined) setDoc(d);
        });
        return;
      }

      if (event === "jobfailed" || event === "jobcanceled") {
        setPendingBlocks((prev) => {
          const next = { ...prev };
          delete next[blockId];
          return next;
        });
        if (jobId) delete pendingJobsRef.current[jobId];
        console.warn("[PathNodePage] doc patch failed:", payload.error || job?.error || "unknown");
      }
    },
    [clearPendingEdit, loadDoc, nodeId, resolveBlockId]
  );

  const lastSseIndexRef = useRef<number>(0);
  useEffect(() => {
    if (!user?.id) return;
    if (!Array.isArray(messages) || messages.length === 0) return;
    const start =
      lastSseIndexRef.current > messages.length
        ? 0
        : Math.max(0, lastSseIndexRef.current);
    for (let i = start; i < messages.length; i += 1) {
      const msg = messages[i];
      if (!msg || msg.channel !== user.id) continue;
      const event = String(msg.event || "").toLowerCase();
      if (event.startsWith("job")) {
        handleJobUpdate(event, msg.data);
        continue;
      }
      if (event.startsWith("chatmessage")) {
        handleChatMessageEvent(event, msg.data);
        continue;
      }
      if (event === "runtimeprompt") {
        handleRuntimePromptEvent(msg.data);
      }
    }
    lastSseIndexRef.current = messages.length;
  }, [handleChatMessageEvent, handleJobUpdate, handleRuntimePromptEvent, messages, user?.id]);

  useEffect(() => {
    if (!connected) return;
    if (!nodeId) return;
    loadDoc().then((d) => {
      if (d !== undefined) setDoc(d);
    });
  }, [connected, nodeId, loadDoc]);

  useEffect(() => {
    clearPendingEdit();
  }, [clearPendingEdit, nodeId]);

  useEffect(() => {
    let cancelled = false;
    const threadId = String(activeThreadId || "").trim();
    if (!threadId || !nodeId) return () => {};
    getChatThread(threadId, 30)
      .then(({ thread, messages }) => {
        if (cancelled) return;
        const meta = asRecord(thread?.metadata);
        const pendingKind = meta ? String(meta.pending_waitpoint_kind || "") : "";
        const pendingProposal = meta ? meta.pending_waitpoint_proposal : null;
        if (pendingKind.toLowerCase() === "node_doc_edit" && pendingProposal) {
          const proposal = parseNodeDocEditProposal({ proposal: pendingProposal });
          if (proposal) {
            applyPendingEdit(proposal, threadId, 0);
            return;
          }
        }
        if (pendingKind.toLowerCase() !== "node_doc_edit") return;
        if (!Array.isArray(messages)) return;
        const ordered = [...messages].sort((a, b) => (a.seq || 0) - (b.seq || 0));
        const latest = [...ordered]
          .reverse()
          .find((msg) => messageKindFromMetadata(msg?.metadata) === "node_doc_edit");
        if (!latest) return;
        const proposal = parseNodeDocEditProposal(latest.metadata);
        if (!proposal) return;
        applyPendingEdit(proposal, threadId, latest.seq || 0);
      })
      .catch(() => {
        // ignore fetch errors
      });
    return () => {
      cancelled = true;
    };
  }, [activeThreadId, applyPendingEdit, asRecord, messageKindFromMetadata, nodeId, parseNodeDocEditProposal]);

  useEffect(() => {
    const threadId = String(activeThreadId || "").trim();
    if (!threadId || !nodeId) return () => {};
    if (pendingEdit) return () => {};
    let attempts = 0;
    let cancelled = false;

    const tick = () => {
      if (cancelled || pendingEdit) return;
      attempts += 1;
      getChatThread(threadId, 10)
        .then(({ thread }) => {
          if (cancelled || pendingEdit) return;
          const meta = asRecord(thread?.metadata);
          const pendingKind = meta ? String(meta.pending_waitpoint_kind || "") : "";
          const pendingProposal = meta ? meta.pending_waitpoint_proposal : null;
          if (pendingKind.toLowerCase() === "node_doc_edit" && pendingProposal) {
            const proposal = parseNodeDocEditProposal({ proposal: pendingProposal });
            if (proposal) {
              applyPendingEdit(proposal, threadId, 0);
              return;
            }
          }
          if (attempts >= 8) {
            cancelled = true;
          }
        })
        .catch(() => {
          if (attempts >= 8) {
            cancelled = true;
          }
        });
    };

    tick();
    const interval = window.setInterval(tick, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeThreadId, applyPendingEdit, asRecord, nodeId, parseNodeDocEditProposal, pendingEdit]);

  const recordFeedback = useCallback(
    (block: DocBlock, idx: number, next: BlockFeedback) => {
      const blockId = String(block?.id ?? "").trim();
      if (!blockId) return;
      setBlockFeedback((prev) => {
        const updated = { ...(prev || {}) };
        if (!next) {
          delete updated[blockId];
        } else {
          updated[blockId] = next;
        }
        return updated;
      });
      if (!next) return;
      const eventType = next === "like" ? "feedback_thumbs_up" : "feedback_thumbs_down";
      queueEvent({
        type: eventType,
        pathId: node?.pathId ?? path?.id ?? "",
        pathNodeId: nodeId ?? undefined,
        data: {
          source: "node_doc_block",
          block_id: blockId,
          block_type: String(block?.type ?? ""),
          block_index: idx,
        },
      });
    },
    [nodeId, node?.pathId, path?.id]
  );

  const handleLike = useCallback(
    (block: DocBlock, idx: number) => {
      const blockId = String(block?.id ?? "").trim();
      if (!blockId) return;
      const current = blockFeedback?.[blockId] || "";
      const next = current === "like" ? "" : "like";
      recordFeedback(block, idx, next);
    },
    [blockFeedback, recordFeedback]
  );

  const handleDislike = useCallback(
    (block: DocBlock, idx: number) => {
      const blockId = String(block?.id ?? "").trim();
      if (!blockId) return;
      const current = blockFeedback?.[blockId] || "";
      const next = current === "dislike" ? "" : "dislike";
      recordFeedback(block, idx, next);
    },
    [blockFeedback, recordFeedback]
  );

  const openRegenDialog = useCallback((block: DocBlock | null) => {
    setRegenBlock(block || null);
    setRegenInstruction("");
    setRegenPolicy("reuse_only");
    setRegenError("");
    setRegenDialogOpen(true);
  }, []);

  const openChatDialog = useCallback((block: DocBlock | null) => {
    setChatBlock(block || null);
    setChatQuestion("");
    setChatError("");
    setChatDialogOpen(true);
  }, []);

  const submitEditDecision = useCallback(
    async (action: "confirm" | "deny" | "refine", refineText = "") => {
      if (!pendingEdit) return;
      const threadId = String(pendingEditThreadIdRef.current || activeThreadId || "").trim();
      if (!threadId) {
        console.warn("[PathNodePage] missing thread for node doc edit decision");
        return;
      }
      let content = "Confirm";
      if (action === "deny") content = "Deny";
      if (action === "refine") {
        const trimmed = String(refineText || "").trim();
        if (!trimmed) return;
        content = `Refine: ${trimmed}`;
      }
      setPendingEditBusy(true);
      try {
        await sendChatMessage(threadId, content);
        if (action !== "refine") {
          clearPendingEdit();
        }
        if (action === "confirm") {
          window.setTimeout(() => {
            loadDoc().then((d) => {
              if (d !== undefined) setDoc(d);
            });
          }, 3500);
        }
      } catch (err) {
        console.warn("[PathNodePage] edit decision failed:", err);
      } finally {
        setPendingEditBusy(false);
      }
    },
    [activeThreadId, clearPendingEdit, loadDoc, pendingEdit]
  );

  const submitRegen = useCallback(async () => {
    if (!nodeId || !regenBlock) return;
    const blockId = String(regenBlock?.id ?? "").trim();
    if (!blockId) return;
    const action = String(regenBlock?.type || "").toLowerCase() === "video" ||
      String(regenBlock?.type || "").toLowerCase() === "figure"
      ? "regen_media"
      : "rewrite";

	    if (action === "rewrite" && !String(regenInstruction || "").trim()) {
	      setRegenError(t("pathNode.regen.error.missingInstruction"));
	      return;
	    }

    setRegenSubmitting(true);
    setRegenError("");
    try {
      const payload: {
        block_id: string;
        action: string;
        instruction: string;
        citation_policy?: string;
      } = {
        block_id: blockId,
        action,
        instruction: String(regenInstruction || "").trim(),
      };
      if (action === "rewrite") {
        payload.citation_policy = regenPolicy || "reuse_only";
      }
      const res = await enqueuePathNodeDocPatch(nodeId, payload);
      const jobId = String(res?.job_id ?? "");
      setPendingBlocks((prev) => ({ ...prev, [blockId]: jobId || true }));
      if (jobId) pendingJobsRef.current[jobId] = blockId;
      setRegenDialogOpen(false);
	    } catch (err) {
	      setRegenError(getErrorMessage(err, t("pathNode.regen.error.enqueueFailed")));
	    } finally {
	      setRegenSubmitting(false);
	    }
	  }, [nodeId, regenBlock, regenInstruction, regenPolicy, t]);

  const buildBlockContext = useCallback((block: DocBlock) => {
    if (!block) return "";
    const type = String(block?.type || "").toLowerCase();
    const clip = (v: unknown, max = 500) => {
      const s = String(v || "").trim();
      if (s.length <= max) return s;
      return s.slice(0, max) + "…";
    };
    switch (type) {
      case "heading":
        return `Heading: ${clip(block?.text)}`;
      case "paragraph":
        return `Paragraph: ${clip(block?.md)}`;
      case "callout":
        return `Callout (${block?.variant || "info"}): ${clip(block?.title)}\n${clip(block?.md)}`;
      case "code":
        return `Code (${block?.language || "text"}): ${clip(block?.code, 420)}`;
      case "figure":
        return `Figure: ${clip(block?.caption)}\nURL: ${clip((block as { asset?: { url?: string } })?.asset?.url)}`;
      case "video":
        return `Video: ${clip(block?.caption)}\nURL: ${clip(block?.url)}`;
      case "diagram":
        return `Diagram (${block?.kind || "diagram"}): ${clip(block?.caption)}\n${clip(block?.source, 420)}`;
      case "table": {
        const cols = Array.isArray(block?.columns) ? block.columns : [];
        return `Table: ${clip(block?.caption)}\nColumns: ${cols.map((c) => String(c || "")).join(", ")}`;
      }
      case "quick_check":
        return `Quick check: ${clip(block?.prompt_md)}`;
      case "flashcard":
        return `Flashcard: ${clip(block?.front_md)}\n${clip(block?.back_md)}`;
      default:
        return clip(JSON.stringify(block));
    }
  }, []);

  const submitChat = useCallback(async () => {
    if (!chatBlock || !nodeId) return;
	    const question = String(chatQuestion || "").trim();
	    if (!question) {
	      setChatError(t("pathNode.chat.error.missingQuestion"));
	      return;
	    }
    setChatSubmitting(true);
    setChatError("");
	    try {
	      const fallbackBlockType = t("pathNode.chat.threadTypeFallback");
	      const blockType = String(chatBlock?.type || fallbackBlockType);
	      const thread = await createChatThread({
	        title: t("pathNode.chat.threadTitle", { type: blockType }),
	        pathId: node?.pathId ?? path?.id ?? null,
	      });
	      if (!thread?.id) {
	        throw new Error(t("pathNode.chat.error.createThreadFailed"));
	      }
      const context = buildBlockContext(chatBlock);
      const prompt = [
        "We are reviewing a generated learning doc block.",
        `Path node ID: ${nodeId}`,
        `Block ID: ${chatBlock?.id || ""}`,
        `Block type: ${chatBlock?.type || ""}`,
        context ? `Block context:\n${context}` : "",
        `User question:\n${question}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      await sendChatMessage(thread.id, prompt);
      setChatDialogOpen(false);
      openThread(thread.id, {
        nodeId,
        blockId: chatBlock?.id ? String(chatBlock.id) : null,
        blockType: chatBlock?.type ? String(chatBlock.type) : null,
      });
    } catch (err) {
      setChatError(getErrorMessage(err, t("pathNode.chat.error.startFailed")));
    } finally {
	      setChatSubmitting(false);
	    }
  }, [chatBlock, chatQuestion, nodeId, node?.pathId, path?.id, buildBlockContext, openThread, t]);

  const handleUndo = useCallback(
    async (block: DocBlock) => {
      if (!nodeId || !block?.id) return;
      const blockId = String(block.id);
      try {
        const rows = await listPathNodeDocRevisions(nodeId, { limit: 10, includeDocs: true });
        const latest = rows.find((r) => String(r?.blockId ?? "") === blockId);
        const before = latest?.beforeJson ?? null;
        const parsed = safeParseJSON(before);
        const prevBlocks = Array.isArray((parsed as { blocks?: unknown })?.blocks)
          ? ((parsed as { blocks: DocBlock[] }).blocks ?? [])
          : [];
        const prevBlock = prevBlocks.find((b) => String(b?.id ?? "") === blockId);
        if (!prevBlock) return;
        const instruction = [
          "Restore this block exactly to the JSON below.",
          "Do not change the id or type.",
          "BLOCK_JSON:",
          JSON.stringify(prevBlock),
        ].join("\n");
        const res = await enqueuePathNodeDocPatch(nodeId, {
          block_id: blockId,
          action: "rewrite",
          citation_policy: "reuse_only",
          instruction,
        });
        const jobId = String(res?.job_id ?? "");
        setPendingBlocks((prev) => ({ ...prev, [blockId]: jobId || true }));
        if (jobId) pendingJobsRef.current[jobId] = blockId;
      } catch (err) {
        console.warn("[PathNodePage] undo failed:", err);
      }
    },
    [nodeId]
  );

  const openDrill = useCallback(
    async (kind: string, label?: string) => {
	      if (!nodeId) return;
	      setDrawerOpen(true);
	      setDrawerKind(kind);
	      setDrawerTitle(label || t("pathNode.drill.titleFallback"));
	      setDrawerLoading(true);
	      setDrawerError("");
	      setDrawerDrill(null);
	      try {
	        const out = await generateDrillForNode(nodeId, kind);
	        setDrawerDrill(out);
	      } catch (e) {
	        setDrawerError(getErrorMessage(e, t("pathNode.drill.error.generateFailed")));
	      } finally {
	        setDrawerLoading(false);
	      }
	    },
    [nodeId, t]
  );

  const submitRuntimePromptDecision = useCallback(
    async (decision: "completed" | "dismissed") => {
      if (!runtimePrompt) return;
      const type = decision === "completed" ? "runtime_prompt_completed" : "runtime_prompt_dismissed";
      queueEvent({
        type,
        pathId: pathIdRef.current || undefined,
        pathNodeId: runtimePrompt.node_id || nodeId || undefined,
        data: {
          prompt_id: runtimePrompt.prompt_id,
          prompt_type: runtimePrompt.type,
          block_id: runtimePrompt.block_id,
        },
      });
      setRuntimePrompt(null);
      runtimeStateQuery.refetch().catch(() => undefined);
    },
    [nodeId, runtimePrompt, runtimeStateQuery]
  );

  const drillPayload = drawerDrill && typeof drawerDrill === "object" ? drawerDrill : null;

  if (loading && !node) {
    return <PathNodePageSkeleton />;
  }

  return (
    <div className="page-surface">
      <Container size="2xl" className="page-pad">
        <div className="mx-auto w-full max-w-5xl">
          {/* Header section - responsive */}
          <div className="mb-6 sm:mb-8 space-y-2.5 sm:space-y-3">
            {/* Breadcrumb row - responsive */}
            <div className="flex items-center gap-2 sm:gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => (path?.id ? navigate(`/paths/${path.id}`) : navigate(-1))}
                className={cn(
                  "h-9 sm:h-8 px-3 sm:px-2.5 rounded-full",
                  "text-sm sm:text-xs",
                  "touch-manipulation -webkit-tap-highlight-color-transparent",
                  "active:scale-[0.97]"
                )}
              >
                {t("common.back")}
              </Button>
              {path?.title ? (
                <div className="text-[11px] xs:text-xs sm:text-xs text-muted-foreground truncate max-w-[50vw] sm:max-w-none">
                  {path.title}
                </div>
              ) : null}
              {eyeTrackingEnabled ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] xs:text-[11px]",
                    eyeTrackingStatus === "active"
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                      : "border-border/60 bg-muted/40 text-muted-foreground"
                  )}
                  title={
                    eyeTrackingStatus === "error"
                      ? `Eye tracking error: ${eyeTrackingError || "unknown"}`
                      : undefined
                  }
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      eyeTrackingStatus === "active" ? "bg-emerald-500" : "bg-muted-foreground/60"
                    )}
                  />
                  {eyeTrackingStatus === "active"
                    ? `Eye tracking ${eyeQuality === "off" ? "on" : eyeQuality}`
                    : eyeTrackingStatus === "error"
                    ? `Eye tracking error: ${eyeTrackingError || "unknown"}`
                    : `Eye tracking ${eyeTrackingStatus}`}
                </span>
              ) : null}
              {eyeTrackingEnabled && needsCalibration ? (
                <Button
                  size="xs"
                  variant="outline"
                  className="h-6 rounded-full px-2 text-[10px] xs:text-[11px]"
                  onClick={() => setShowCalibration(true)}
                >
                  Calibrate
                </Button>
              ) : null}
            </div>

            {/* Title - responsive typography */}
            <h1 className={cn(
              "text-balance font-semibold tracking-tight text-foreground",
              "text-2xl xs:text-[26px] sm:text-3xl md:text-[32px] lg:text-4xl"
            )}>
              {node?.title || (loading ? t("pathNode.loading") : t("pathNode.node"))}
            </h1>

            {/* Concept tags - responsive */}
            {conceptLabels.length > 0 ? (
              <div className="flex flex-wrap gap-1 xs:gap-1.5 pt-0.5 sm:pt-1">
                {conceptLabels.slice(0, 18).map((label, idx) => (
                  <span
                    key={`${conceptKeys[idx] ?? label}:${idx}`}
                    className={cn(
                      "rounded-full border border-border/60 bg-muted/30 text-muted-foreground",
                      // Responsive sizing
                      "px-2 py-0.5 sm:px-2.5 sm:py-1",
                      "text-[10px] xs:text-[11px] sm:text-xs"
                    )}
                  >
                    {label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {/* Error state - responsive */}
          {err ? (
            <div className="mb-4 sm:mb-6 rounded-xl sm:rounded-2xl border border-border/60 bg-muted/30 p-3 sm:p-4 text-sm text-muted-foreground">
              {t("pathNode.loadFailed")}
            </div>
          ) : null}

          {/* Drills section - responsive */}
          {drills.length > 0 ? (
            <div className="mb-6 sm:mb-8 rounded-xl sm:rounded-2xl border border-border/60 bg-card/70 p-3 sm:p-4 shadow-sm backdrop-blur">
              <div className="flex items-start sm:items-center justify-between gap-2 sm:gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">{t("pathNode.drills.recommended")}</div>
                  <div className="text-xs text-muted-foreground hidden xs:block">{t("pathNode.drills.subtitle")}</div>
                </div>
              </div>
              {/* Drill buttons - responsive grid on mobile, flex on desktop */}
              <div className="mt-2.5 sm:mt-3 flex flex-wrap gap-2">
                {drills.map((d) => (
                  <Button
                    key={d.kind}
                    variant="secondary"
                    onClick={() => openDrill(d.kind, d.label)}
                    className={cn(
                      // Touch-friendly on mobile
                      "h-10 sm:h-9 px-4 sm:px-3 text-sm",
                      "touch-manipulation -webkit-tap-highlight-color-transparent",
                      "active:scale-[0.97]"
                    )}
                  >
                    {d.label || d.kind}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Main content container - responsive */}
          <div className="relative rounded-xl sm:rounded-2xl border border-border/60 bg-card/70 shadow-sm">
            <div className="pointer-events-none absolute inset-0 rounded-xl sm:rounded-2xl overflow-hidden z-0">
              <div className="absolute -top-28 right-0 h-56 w-56 rounded-full bg-primary/6 blur-2xl" />
              <div className="absolute -bottom-32 left-0 h-64 w-64 rounded-full bg-accent/6 blur-2xl" />
              <div className="absolute inset-0 bg-gradient-to-br from-muted/25 via-transparent to-transparent opacity-60" />
            </div>
            <div
              ref={docContainerRef}
              className="relative z-10 px-4 py-5 xs:px-5 xs:py-6 sm:px-6 sm:py-8 md:px-8 md:py-10"
            >
              {doc ? (
                <NodeDocRenderer
                  doc={doc}
                  pathNodeId={nodeId}
                  interactiveMode={interactiveMode}
                  completedInteractiveBlocks={completedInteractiveBlocks}
                  pendingBlocks={pendingBlocks}
                  pendingEdit={pendingEdit}
                  editBusy={pendingEditBusy}
                  blockFeedback={blockFeedback}
                  undoableBlocks={undoableBlocks}
                  onLike={handleLike}
                  onDislike={handleDislike}
                  onRegenerate={(block: DocBlock) => openRegenDialog(block)}
                  onChat={(block: DocBlock) => openChatDialog(block)}
                  onUndo={(block: DocBlock) => handleUndo(block)}
                  onEditConfirm={(_proposal) => void submitEditDecision("confirm")}
                  onEditDeny={(_proposal) => void submitEditDecision("deny")}
                  onEditRefine={(_proposal, text) => void submitEditDecision("refine", text)}
                />
              ) : (
                <NodeContentRenderer contentJson={node?.contentJson} />
              )}
            </div>
          </div>

          {/* Footer separator and helper - responsive */}
          <Separator className="my-6 sm:my-8 md:my-10" />

          <div className="text-[11px] xs:text-xs text-muted-foreground pb-2 sm:pb-0">
            {t("pathNode.drills.helper")}
          </div>
        </div>
      </Container>

      <Dialog
        open={Boolean(runtimePrompt)}
        onOpenChange={(open) => {
          if (!open) void submitRuntimePromptDecision("dismissed");
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {runtimePrompt?.type === "break"
                ? "Take a short break"
                : runtimePrompt?.type === "flashcard"
                  ? "Flashcard"
                  : "Quick check"}
            </DialogTitle>
            <DialogDescription>
              {runtimePrompt?.type === "break"
                ? "A short pause can improve retention and accuracy."
                : "Respond and then confirm when you are ready to continue."}
            </DialogDescription>
          </DialogHeader>

          {runtimePrompt?.type === "break" ? (
            <div className="space-y-2 rounded-xl border border-border/60 bg-muted/10 p-4 text-sm text-foreground/90">
              <div>
                Suggested break:{" "}
                <span className="font-medium">
                  {runtimePrompt.break_min ?? 3}–{runtimePrompt.break_max ?? 8} minutes
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                You can keep going if you prefer; this just helps pacing.
              </div>
            </div>
          ) : runtimePrompt?.type === "quick_check" ? (
            runtimePromptBlock ? (
              <QuickCheck
                pathNodeId={runtimePrompt.node_id || nodeId || undefined}
                blockId={runtimePrompt.block_id}
                promptMd={runtimePromptBlock?.prompt_md as string}
                answerMd={runtimePromptBlock?.answer_md as string}
                kind={runtimePromptBlock?.kind}
                options={runtimePromptBlock?.options}
              />
            ) : (
              <div className="rounded-xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
                Loading the quick check…
              </div>
            )
          ) : runtimePrompt?.type === "flashcard" ? (
            runtimePromptBlock ? (
              <Flashcard
                frontMd={runtimePromptBlock?.front_md as string}
                backMd={runtimePromptBlock?.back_md as string}
              />
            ) : (
              <div className="rounded-xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
                Loading the flashcard…
              </div>
            )
          ) : null}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => void submitRuntimePromptDecision("dismissed")}
            >
              Dismiss
            </Button>
            <Button onClick={() => void submitRuntimePromptDecision("completed")}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showDebugOverlay ? (
        <div
          ref={debugOverlayRef}
          className="fixed bottom-6 end-6 z-50 w-[320px] rounded-2xl border border-border/60 bg-background/95 p-4 shadow-xl backdrop-blur"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Current Block Debug
          </div>
          <div className="mt-2 space-y-2 text-xs text-foreground/80">
            <div className="rounded-lg border border-border/50 px-2 py-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>active</span>
                <span>{debugOverlayData.activeId || "none"}</span>
              </div>
              {debugOverlayData.activeMetric ? (
                <>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>ratio {debugOverlayData.activeMetric.ratio}</span>
                    <span>top {debugOverlayData.activeMetric.topDelta}px</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>visible {debugOverlayData.activeMetric.visibleStartPct}→{debugOverlayData.activeMetric.visibleEndPct}</span>
                    <span>anchor {debugOverlayData.activeMetric.anchorPct}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>hidden {debugOverlayData.activeMetric.hiddenTopPct}/{debugOverlayData.activeMetric.hiddenBottomPct}</span>
                    <span>scroll {debugOverlayData.scrollPercent}%</span>
                  </div>
                </>
              ) : (
                <div className="text-[11px] text-muted-foreground">no active metric</div>
              )}
            </div>

            <div className="rounded-lg border border-border/50 px-2 py-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>progress</span>
                <span>
                  {debugOverlayData.progress.state} {debugOverlayData.progress.confidence}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>engaged</span>
                <span>{debugOverlayData.progress.engagedId || "none"}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>completed</span>
                <span>{debugOverlayData.progress.completedId || "none"}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>forward/regress</span>
                <span>
                  {debugOverlayData.progress.forwardCount}/{debugOverlayData.progress.regressionCount}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>progressing for</span>
                <span>{debugOverlayData.progress.progressingSinceSec}s</span>
              </div>
              {debugOverlayData.progress.engagedSeq.length > 0 ? (
                <div className="text-[11px] text-muted-foreground">
                  engaged seq: {debugOverlayData.progress.engagedSeq.join(", ")}
                </div>
              ) : null}
              {debugOverlayData.progress.completedSeq.length > 0 ? (
                <div className="text-[11px] text-muted-foreground">
                  completed seq: {debugOverlayData.progress.completedSeq.join(", ")}
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-border/50 px-2 py-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>visible blocks</span>
                <span>{debugOverlayData.visible.length}</span>
              </div>
              {debugOverlayData.visible.length === 0 ? (
                <div className="text-[11px] text-muted-foreground">none</div>
              ) : (
                debugOverlayData.visible.slice(0, 6).map((v) => (
                  <div key={`vis-${v.id}`} className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="truncate">{v.id}</span>
                    <span>{v.ratio} | {v.visibleStartPct}→{v.visibleEndPct}</span>
                  </div>
                ))
              )}
            </div>

            {debugCandidatesRef.current.length === 0 ? (
              <div className="text-muted-foreground">No visible blocks detected.</div>
            ) : (
              debugCandidatesRef.current.map((c, idx) => (
                <div
                  key={`${c.id}-${idx}`}
                  className="space-y-1 rounded-lg border border-border/50 px-2 py-1"
                >
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="truncate">{c.id}</span>
                    <span>score {c.score}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>ratio {c.ratio}</span>
                    <span>top {c.topDelta}px</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>center {c.centerY}px</span>
                    <span>anchor {c.anchor}</span>
                  </div>
                </div>
              ))
            )}
          </div>
          {!LESSON_DEBUG_OVERLAY ? (
            <div className="mt-3 text-[10px] text-muted-foreground">Toggle: Ctrl/Cmd + Shift + `</div>
          ) : null}
        </div>
      ) : null}

      {gazeDebugEnabled ? (
        <div
          ref={gazeDebugRef}
          className="pointer-events-none fixed left-0 top-0 z-[70] h-3.5 w-3.5 rounded-full bg-primary/70 ring-2 ring-primary/40 shadow"
          style={{ transform: "translate(-9999px, -9999px)", opacity: 0 }}
          aria-hidden="true"
        />
      ) : null}

      <EyeCalibrationOverlay
        open={showCalibration}
        onClose={() => setShowCalibration(false)}
        onComplete={(result) => {
          markCalibrated(result);
          setShowCalibration(false);
        }}
        getGaze={() => rawGazeRef.current}
      />

      <Dialog open={regenDialogOpen} onOpenChange={(open) => !regenSubmitting && setRegenDialogOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("pathNode.regen.dialog.title")}</DialogTitle>
	            <DialogDescription>
	              {t("pathNode.regen.dialog.description")}
	            </DialogDescription>
	          </DialogHeader>

          <div className="space-y-4">
	            <Textarea
	              value={regenInstruction}
	              onChange={(e) => setRegenInstruction(e.target.value)}
	              placeholder={t("pathNode.regen.placeholder")}
	              rows={5}
	            />
            {String(regenBlock?.type || "").toLowerCase() !== "figure" &&
	            String(regenBlock?.type || "").toLowerCase() !== "video" ? (
	              <div className="space-y-1.5">
	                <div className="text-xs font-medium text-muted-foreground">{t("pathNode.regen.citations.label")}</div>
	                <Select
	                  value={regenPolicy}
	                  onValueChange={(value) => setRegenPolicy(value as "reuse_only" | "allow_new")}
	                >
	                  <SelectTrigger className="w-full">
	                    <SelectValue placeholder={t("pathNode.regen.citations.placeholder")} />
	                  </SelectTrigger>
	                  <SelectContent>
	                    <SelectItem value="reuse_only">{t("pathNode.regen.citations.reuseOnly")}</SelectItem>
	                    <SelectItem value="allow_new">{t("pathNode.regen.citations.allowNew")}</SelectItem>
	                  </SelectContent>
	                </Select>
	              </div>
	            ) : null}
            {regenError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {regenError}
              </div>
            ) : null}
          </div>

	          <DialogFooter>
	            <Button variant="outline" onClick={() => setRegenDialogOpen(false)} disabled={regenSubmitting}>
	              {t("common.cancel")}
	            </Button>
	            <Button onClick={submitRegen} disabled={regenSubmitting}>
	              {regenSubmitting ? t("common.submitting") : t("common.regenerate")}
	            </Button>
	          </DialogFooter>
	        </DialogContent>
	      </Dialog>

	      <Dialog open={chatDialogOpen} onOpenChange={(open) => !chatSubmitting && setChatDialogOpen(open)}>
	        <DialogContent>
	          <DialogHeader>
	            <DialogTitle>{t("pathNode.chat.dialog.title")}</DialogTitle>
	            <DialogDescription>
	              {t("pathNode.chat.dialog.description")}
	            </DialogDescription>
	          </DialogHeader>
	          <div className="space-y-4">
	            <Textarea
	              value={chatQuestion}
	              onChange={(e) => setChatQuestion(e.target.value)}
	              placeholder={t("pathNode.chat.placeholder")}
	              rows={5}
	            />
            {chatError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {chatError}
              </div>
            ) : null}
          </div>
	          <DialogFooter>
	            <Button variant="outline" onClick={() => setChatDialogOpen(false)} disabled={chatSubmitting}>
	              {t("common.cancel")}
	            </Button>
	            <Button onClick={submitChat} disabled={chatSubmitting}>
	              {chatSubmitting ? t("common.starting") : t("pathNode.chat.start")}
	            </Button>
	          </DialogFooter>
	        </DialogContent>
	      </Dialog>

      {/* Drill drawer - responsive width */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-[95vw] xs:w-[92vw] sm:w-[520px] md:w-[560px]">
          <SheetHeader>
            <SheetTitle className="text-lg xs:text-xl sm:text-2xl">{drawerTitle}</SheetTitle>
          </SheetHeader>

          <div className="mt-3 sm:mt-4">
            {drawerLoading ? (
              <div className="text-sm text-muted-foreground">{t("common.generating")}</div>
            ) : drawerError ? (
              <div className="rounded-lg sm:rounded-xl border border-border bg-muted/30 p-3 sm:p-4 text-sm text-muted-foreground">
                {drawerError}
              </div>
            ) : drillPayload ? (
              <>
                {drawerKind === "flashcards" ? <FlashcardsDrill drill={drillPayload} /> : null}
                {drawerKind === "quiz" ? (
                  <QuizDrill
                    drill={drillPayload}
                    pathId={pathId}
                    pathNodeId={nodeId ?? ""}
                    defaultConceptKeys={conceptKeys}
                    conceptIdByKey={conceptIdByKey}
                  />
                ) : null}
              </>
            ) : (
              <div className="text-sm text-muted-foreground">{t("pathNode.drill.noneLoaded")}</div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
