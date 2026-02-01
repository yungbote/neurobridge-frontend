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

import { createChatThread, sendChatMessage } from "@/shared/api/ChatService";
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
import { NodeContentRenderer } from "@/features/paths/components/NodeContentRenderer";
import { NodeDocRenderer } from "@/features/paths/components/NodeDocRenderer";
import { Container } from "@/shared/layout/Container";
import { queryKeys } from "@/shared/query/queryKeys";
import { CodeBlock, InlineCode } from "@/shared/components/CodeBlock";
import { useSSEContext } from "@/app/providers/SSEProvider";
import { useUser } from "@/app/providers/UserProvider";
import { usePaths } from "@/app/providers/PathProvider";
import { useChatDock } from "@/app/providers/ChatDockProvider";
import { useLessons } from "@/app/providers/LessonProvider";
import { useI18n } from "@/app/providers/I18nProvider";
import type { DrillPayloadV1 } from "@/shared/types/drillPayloadV1";
import type { BackendJob } from "@/shared/types/backend";
import type {
  DrillSpec,
  JsonInput,
  NodeDocRevision,
  Path,
  PathNode,
} from "@/shared/types/models";
import type { JobEventPayload } from "@/shared/types/models";

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
  const { lastMessage, connected } = useSSEContext();
  const { user } = useUser();
  const { activatePath } = usePaths();
  const { activateLesson } = useLessons();
  const { openThread } = useChatDock();

  const [loading, setLoading] = useState(false);
  const [node, setNode] = useState<PathNode | null>(null);
  const [doc, setDoc] = useState<JsonInput>(null);
  const [path, setPath] = useState<Path | null>(null);
  const [drills, setDrills] = useState<DrillSpec[]>([]);
  const [err, setErr] = useState<unknown | null>(null);

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
    Map<string, { ratio: number; topDelta: number; height: number; rootHeight: number; seenAt: number }>
  >(new Map());
  const currentBlockIdRef = useRef<string>("");
  const lastSwitchAtRef = useRef<number>(0);
  const scoreEMARef = useRef<Map<string, number>>(new Map());
  const lastCurrentAtRef = useRef<Map<string, number>>(new Map());
  const scrollDirRef = useRef<"up" | "down" | "none">("none");
  const lastScrollTopRef = useRef<number>(0);
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

  const pathId = node?.pathId || path?.id || "";
  useEffect(() => {
    pathIdRef.current = pathId;
  }, [pathId]);

  useEffect(() => {
    nodeIdRef.current = nodeId ? String(nodeId) : "";
  }, [nodeId]);

  const conceptGraphQuery = useQuery({
    queryKey: queryKeys.conceptGraph(pathId || "unknown"),
    enabled: Boolean(pathId),
    staleTime: 10 * 60_000,
    queryFn: () => getConceptGraph(pathId),
  });

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
    const rootHeight = (rootRect?.height ?? window.innerHeight) || 1;
    const rootBottom = rootTop + rootHeight;
    const readingLine = rootHeight * 0.35;

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
      const readingProx = 1 - Math.min(Math.abs(centerY - readingLine) / Math.max(rootH, 1), 1);

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
        directionGate = best.topDelta <= readingLine * 1.05;
      } else if (direction === "up") {
        directionGate = best.bottomY >= readingLine * 0.95;
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
      1 - Math.min(Math.abs(selected.centerY - readingLine) / Math.max(rootHeight, 1), 1)
    );
    const confidence = Math.min(1, Math.max(0, 0.55 * selected.ratio + 0.45 * proximity));

    return {
      visible,
      current: {
        id: selected.id,
        confidence: Math.round(confidence * 1000) / 1000,
      },
    };
  }, [resolveScrollContainer]);

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
    [buildVisibleSnapshot, user?.id]
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
        scrollContainer?.clientHeight ?? (typeof docEl.clientHeight === "number" ? docEl.clientHeight : window.innerHeight || 1);
      const denom = Math.max(1, scrollHeight - clientHeight);
      const pct = Math.max(0, Math.min(100, Math.round((scrollTop / denom) * 100)));
      const delta = scrollTop - (lastScrollTopRef.current || 0);
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
            const rootHeight = (rootRect?.height ?? window.innerHeight) || 1;
            blockMetricsRef.current.set(id, {
              ratio,
              topDelta: rect.top - rootTop,
              height: rect.height,
              rootHeight,
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

  const handleJobUpdate = useCallback(
    (event: string, data: unknown) => {
      if (!data || typeof data !== "object") return;
      const payload = data as JobEventPayload;
      const job = payload.job as BackendJob | undefined;
      const jobType = String(payload.job_type ?? job?.job_type ?? "").toLowerCase();
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
    [loadDoc, nodeId, resolveBlockId]
  );

  useEffect(() => {
    if (!lastMessage) return;
    if (!user?.id) return;
    if (lastMessage.channel !== user.id) return;
    const event = String(lastMessage.event || "").toLowerCase();
    handleJobUpdate(event, lastMessage.data);
  }, [lastMessage, user?.id, handleJobUpdate]);

  useEffect(() => {
    if (!connected) return;
    if (!nodeId) return;
    loadDoc().then((d) => {
      if (d !== undefined) setDoc(d);
    });
  }, [connected, nodeId, loadDoc]);

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
                  pendingBlocks={pendingBlocks}
                  blockFeedback={blockFeedback}
                  undoableBlocks={undoableBlocks}
                  onLike={handleLike}
                  onDislike={handleDislike}
                  onRegenerate={(block: DocBlock) => openRegenDialog(block)}
                  onChat={(block: DocBlock) => openChatDialog(block)}
                  onUndo={(block: DocBlock) => handleUndo(block)}
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
