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
const rawGazeTickMs = Number(import.meta.env.VITE_EYE_TRACKING_TICK_MS);
const GAZE_TICK_MS = Number.isFinite(rawGazeTickMs) && rawGazeTickMs > 0 ? rawGazeTickMs : 120;
const rawGazeConfidence = Number(import.meta.env.VITE_EYE_TRACKING_MIN_CONFIDENCE);
const GAZE_MIN_CONFIDENCE =
  Number.isFinite(rawGazeConfidence) && rawGazeConfidence > 0 ? rawGazeConfidence : 0.4;
const rawGazeBlockTtl = Number(import.meta.env.VITE_EYE_TRACKING_BLOCK_TTL_MS);
const GAZE_BLOCK_TTL_MS =
  Number.isFinite(rawGazeBlockTtl) && rawGazeBlockTtl > 0 ? rawGazeBlockTtl : 4000;

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
        rootHeight: number;
        top: number;
        bottom: number;
        left: number;
        right: number;
        seenAt: number;
      }
    >
  >(new Map());
  const blockBoundsRef = useRef<Map<string, { top: number; bottom: number; left: number; right: number; seenAt: number }>>(
    new Map()
  );
  const blockLineRectsRef = useRef<
    Map<string, Array<{ id: string; top: number; bottom: number; left: number; right: number; index: number }>>
  >(new Map());
  const currentBlockIdRef = useRef<string>("");
  const lastSwitchAtRef = useRef<number>(0);
  const scoreEMARef = useRef<Map<string, number>>(new Map());
  const lastCurrentAtRef = useRef<Map<string, number>>(new Map());
  const scrollDirRef = useRef<"up" | "down" | "none">("none");
  const lastScrollTopRef = useRef<number>(0);
  const lastScrollAtRef = useRef<number>(0);
  const scrollVelocityRef = useRef<number>(0);
  const readCreditsRef = useRef<Map<string, number>>(new Map());
  const readBlocksRef = useRef<Set<string>>(new Set());
  const readTargetSecondsRef = useRef<Map<string, number>>(new Map());
  const lastReadTickRef = useRef<number>(0);
  const debugCandidatesRef = useRef<
    Array<{
      id: string;
      score: number;
      ratio: number;
      topDelta: number;
      centerY: number;
    }>
  >([]);
  const [debugOverlay, setDebugOverlay] = useState(false);
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

  const findGazeLine = useCallback(
    (blockId: string, x: number, y: number) => {
      if (!blockId) return null;
      let lines = blockLineRectsRef.current.get(blockId);
      if (!lines || lines.length === 0) {
        const el = getBlockElement(blockId);
        lines = computeLineRects(blockId, el);
        if (lines.length > 0) {
          blockLineRectsRef.current.set(blockId, lines);
        }
      }
      if (!lines || lines.length === 0) return null;
      let best: { id: string; index: number; dist: number } | null = null;
      for (const line of lines) {
        const inside = x >= line.left && x <= line.right && y >= line.top && y <= line.bottom;
        const dist = inside ? 0 : Math.abs((line.top + line.bottom) * 0.5 - y);
        if (!best || dist < best.dist) {
          best = { id: line.id, index: line.index, dist };
        }
        if (dist === 0) break;
      }
      return best ? { id: best.id, index: best.index } : null;
    },
    [computeLineRects, getBlockElement]
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
    lastReadTickRef.current = 0;
    for (const block of docBlocks) {
      const id = String(block?.id ?? "").trim();
      if (!id) continue;
      readTargetSecondsRef.current.set(id, estimateReadSeconds(block));
    }
    blockLineRectsRef.current.clear();
    gazeSmoothRef.current = null;
  }, [docBlocks, nodeId]);

  useEffect(() => {
    const onResize = () => {
      blockLineRectsRef.current.clear();
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
  }, [nodeId]);

  const conceptGraphQuery = useQuery({
    queryKey: queryKeys.conceptGraph(pathId || "unknown"),
    enabled: Boolean(pathId),
    staleTime: 10 * 60_000,
    queryFn: () => getConceptGraph(pathId),
  });

  const { enabled: eyeTrackingEnabled } = useEyeTrackingPreference();
  const { gazeRef, status: eyeTrackingStatus, error: eyeTrackingError } = useEyeTracking(eyeTrackingEnabled);
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
    const gaze = gazeRef.current;
    const gazeOk =
      eyeTrackingEnabled &&
      eyeTrackingStatus === "active" &&
      gaze &&
      gaze.confidence >= GAZE_MIN_CONFIDENCE &&
      gaze.y >= rootTop &&
      gaze.y <= rootBottom;
    const focusLine = gazeOk ? gaze.y - rootTop : readingLine;

    const getElementForId = (id: string) => {
      if (!id) return null;
      const escaped =
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? CSS.escape(id)
          : id.replace(/"/g, '\\"');
      return (scrollRoot ?? document).querySelector<HTMLElement>(`[data-doc-block-id="${escaped}"]`);
    };

    const entries: Array<{ id: string; ratio: number; top_delta: number }> = [];
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
        const intersectTop = Math.max(rect.top, rootTop);
        const intersectBottom = Math.min(rect.bottom, rootBottom);
        const visibleHeight = Math.max(0, intersectBottom - intersectTop);
        const ratio = Math.max(0, Math.min(1, visibleHeight / height));
        if (ratio >= VISIBLE_RATIO_MIN) {
          const rounded = Math.round(ratio * 1000) / 1000;
          entries.push({ id, ratio: rounded, top_delta: rect.top - rootTop });
          visibleBlocksRef.current.set(id, ratio);
          blockMetricsRef.current.set(id, {
            ratio,
            topDelta: rect.top - rootTop,
            height,
            rootHeight,
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
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
        entries.push({ id, ratio: rounded, top_delta: 0 });
      });
    }

    entries.sort((a, b) => b.ratio - a.ratio);
    const visible = entries.slice(0, MAX_VISIBLE_BLOCKS);
    if (visible.length === 0) {
      currentBlockIdRef.current = "";
      return { visible, current: null };
    }

    const now = Date.now();
    const candidates: Array<{
      id: string;
      ratio: number;
      topDelta: number;
      height: number;
      centerY: number;
      bottomY: number;
      score: number;
    }> = [];

    for (const entry of visible) {
      const metric = blockMetricsRef.current.get(entry.id);
      let topDelta = metric?.topDelta ?? 0;
      let height = metric?.height ?? 0;
      let rootH = metric?.rootHeight ?? rootHeight;
      if (!metric) {
        const el = getElementForId(entry.id);
        if (el) {
          const rect = el.getBoundingClientRect();
          topDelta = rect.top - rootTop;
          height = rect.height;
          rootH = rootHeight;
        }
      }
      if (!height || height < 1) height = rootHeight * 0.1;
      if (!rootH || rootH < 1) rootH = rootHeight;
      const centerY = topDelta + height * 0.5;
      const bottomY = topDelta + height;

      const topProx = 1 - Math.min(Math.abs(topDelta) / Math.max(rootH, 1), 1);
      const readingProx = 1 - Math.min(Math.abs(centerY - focusLine) / Math.max(rootH, 1), 1);

      const lastCurrent = lastCurrentAtRef.current.get(entry.id) ?? 0;
      const dwellBonus =
        entry.id === currentBlockIdRef.current ? 0.15 : now - lastCurrent < 2500 ? 0.08 : 0;

      const rawScore = 0.45 * entry.ratio + 0.3 * readingProx + 0.2 * topProx + dwellBonus;
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
      });
    }

    if (candidates.length === 0) {
      currentBlockIdRef.current = "";
      return { visible, current: null };
    }

    candidates.sort((a, b) => b.score - a.score);
    debugCandidatesRef.current = candidates.slice(0, 5).map((c) => ({
      id: c.id,
      score: Math.round(c.score * 1000) / 1000,
      ratio: Math.round(c.ratio * 1000) / 1000,
      topDelta: Math.round(c.topDelta),
      centerY: Math.round(c.centerY),
    }));
    const best = candidates[0];
    const currentId = currentBlockIdRef.current;
    const current = currentId ? candidates.find((c) => c.id === currentId) : null;

    if (!best || best.ratio < CURRENT_RATIO_MIN) {
      currentBlockIdRef.current = "";
      return { visible, current: null };
    }

    let selected = best;
    const nowSwitchWindow = now - lastSwitchAtRef.current;
    const direction = scrollDirRef.current;

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

    return {
      visible,
      current: {
        id: selected.id,
        confidence: Math.round(confidence * 1000) / 1000,
      },
    };
  }, [eyeTrackingEnabled, eyeTrackingStatus, gazeRef, resolveScrollContainer]);

  const buildReadingSnapshot = useCallback(() => {
    const credits = Array.from(readCreditsRef.current.entries());
    credits.sort((a, b) => b[1] - a[1]);
    const topCredits: Record<string, number> = {};
    for (const [id, credit] of credits.slice(0, 12)) {
      topCredits[id] = Math.round(credit * 1000) / 1000;
    }
    const allRead = Array.from(readBlocksRef.current);
    const trimmedRead = allRead.length > 80 ? allRead.slice(-80) : allRead;
    return {
      read_blocks: trimmedRead,
      read_block_count: readBlocksRef.current.size,
      read_credit_top: topCredits,
      eye_tracking: {
        enabled: eyeTrackingEnabled,
        status: eyeTrackingStatus,
      },
    };
  }, [eyeTrackingEnabled, eyeTrackingStatus]);

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
    [buildReadingSnapshot, buildVisibleSnapshot, user?.id]
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
      queueEvent({
        type: "block_read",
        pathId: pathIdRef.current || "",
        pathNodeId: nodeId || "",
        data: {
          block_id: id,
          read_credit: Math.min(1, Math.max(credit, 0)),
          source,
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

      const gaze = gazeRef.current;
      const gazeOk =
        eyeTrackingEnabled &&
        eyeTrackingStatus === "active" &&
        gaze &&
        gaze.confidence >= 0.5 &&
        gaze.y >= rootTop &&
        gaze.y <= rootTop + rootHeight;
      const focusY = gazeOk ? gaze.y : rootTop + rootHeight * READ_LINE_RATIO;
      const source: "behavioral" | "gaze" = gazeOk ? "gaze" : "behavioral";

      const dtSec = Math.min(dt, 1000) / 1000;
      let updated = false;

      for (const [id, metric] of blockMetricsRef.current.entries()) {
        const ratio = metric.ratio ?? 0;
        if (ratio < READ_VISIBLE_RATIO_MIN) continue;
        const height = metric.height || 1;
        const centerY = rootTop + (metric.topDelta || 0) + height * 0.5;
        const distance = Math.abs(centerY - focusY);
        const focusFactor = 1 - Math.min(distance / Math.max(rootHeight, 1), 1);
        const weight = ratio * focusFactor * speedFactor;
        if (weight < READ_MIN_WEIGHT) continue;
        const required = readTargetSecondsRef.current.get(id) ?? 4;
        const prev = readCreditsRef.current.get(id) ?? 0;
        const next = clamp(prev + (dtSec / required) * weight, 0, 1);
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
    docBlocks.length,
    eyeTrackingEnabled,
    eyeTrackingStatus,
    gazeRef,
    markBlockRead,
    nodeId,
    resolveScrollContainer,
    scheduleSessionSync,
  ]);

  useEffect(() => {
    if (!nodeId) return;
    let timer: number | null = null;
    const tick = () => {
      if (!gazeStreamEnabled || !gazeEnabledRef.current) return;
      if (document.hidden) return;
      const gaze = gazeRef.current;
      if (!gaze || gaze.confidence < GAZE_MIN_CONFIDENCE) return;
      const now = Date.now();
      const prevSmooth = gazeSmoothRef.current;
      const smoothWeight = 0.65;
      const smoothX = prevSmooth ? prevSmooth.x * smoothWeight + gaze.x * (1 - smoothWeight) : gaze.x;
      const smoothY = prevSmooth ? prevSmooth.y * smoothWeight + gaze.y * (1 - smoothWeight) : gaze.y;
      gazeSmoothRef.current = { x: smoothX, y: smoothY, ts: now };

      const blockId = findGazeBlock(smoothX, smoothY);
      if (!blockId) return;
      const line = findGazeLine(blockId, smoothX, smoothY);
      const dt = gazeLastHitAtRef.current > 0 ? now - gazeLastHitAtRef.current : 0;
      gazeLastHitAtRef.current = now;
      gazeLastBlockRef.current = blockId;
      gazeQueueRef.current?.enqueue({
        block_id: blockId,
        line_id: line?.id,
        line_index: line?.index,
        x: smoothX,
        y: smoothY,
        confidence: gaze.confidence,
        ts: new Date(now).toISOString(),
        dt_ms: dt > 0 ? dt : undefined,
        read_credit: readCreditsRef.current.get(blockId) ?? 0,
        source: gaze.source,
        screen_w: window.innerWidth,
        screen_h: window.innerHeight,
      });
    };
    timer = window.setInterval(tick, Math.max(60, GAZE_TICK_MS));
    return () => {
      if (timer != null) window.clearInterval(timer);
    };
  }, [findGazeBlock, findGazeLine, gazeRef, gazeStreamEnabled, nodeId]);

  useEffect(() => {
    if (!gazeDebugEnabled) return;
    let raf = 0;
    const el = gazeDebugRef.current;
    if (!el) return;
    const tick = () => {
      const gaze = gazeRef.current;
      const smooth = gazeSmoothRef.current;
      const point = smooth && gaze ? { x: smooth.x, y: smooth.y, confidence: gaze.confidence } : gaze;
      if (point && point.confidence >= GAZE_MIN_CONFIDENCE) {
        el.style.transform = `translate(${Math.round(point.x)}px, ${Math.round(point.y)}px)`;
        el.style.opacity = "1";
      } else {
        el.style.opacity = "0";
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [gazeDebugEnabled, gazeRef]);

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
            blockMetricsRef.current.set(id, {
              ratio,
              topDelta: rect.top - rootTop,
              height: rect.height,
              rootHeight,
              top: rect.top,
              bottom: rect.bottom,
              left: rect.left,
              right: rect.right,
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
                    ? "Eye tracking on"
                    : eyeTrackingStatus === "error"
                    ? `Eye tracking error: ${eyeTrackingError || "unknown"}`
                    : `Eye tracking ${eyeTrackingStatus}`}
                </span>
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

      {debugOverlay ? (
        <div
          ref={debugOverlayRef}
          className="fixed bottom-6 end-6 z-50 w-[320px] rounded-2xl border border-border/60 bg-background/95 p-4 shadow-xl backdrop-blur"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Current Block Debug
          </div>
          <div className="mt-2 space-y-2 text-xs text-foreground/80">
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
                  <div className="text-[11px] text-muted-foreground">center {c.centerY}px</div>
                </div>
              ))
            )}
          </div>
          <div className="mt-3 text-[10px] text-muted-foreground">Toggle: Ctrl/Cmd + Shift + `</div>
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
