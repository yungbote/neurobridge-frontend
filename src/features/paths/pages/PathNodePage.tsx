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
import { ingestEvents } from "@/shared/api/EventService";
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

function QuizDrill({ drill }: DrillProps) {
  const { t } = useI18n();
  const questions = Array.isArray(drill?.questions) ? drill.questions : [];
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setIdx(0);
    setSelected(null);
    setRevealed(false);
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

  const select = (id: string) => {
    if (revealed) return;
    setSelected(id);
    setRevealed(true);
  };

  const next = () => {
    setIdx((v) => Math.min(questions.length - 1, v + 1));
    setSelected(null);
    setRevealed(false);
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
    async (block: DocBlock, idx: number, next: BlockFeedback) => {
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
      try {
        await ingestEvents([
          {
            type: `node_doc_block_${next}`,
            pathId: node?.pathId ?? path?.id ?? "",
            pathNodeId: nodeId ?? undefined,
            data: {
              block_id: blockId,
              block_type: String(block?.type ?? ""),
              block_index: idx,
            },
          },
        ]);
      } catch (err) {
        console.warn("[PathNodePage] feedback ingest failed:", err);
      }
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
      const params = new URLSearchParams();
      if (nodeId) params.set("nodeId", nodeId);
      if (chatBlock?.id) params.set("blockId", String(chatBlock.id));
      if (chatBlock?.type) params.set("blockType", String(chatBlock.type));
      const qs = params.toString();
      navigate(`/chat/threads/${thread.id}${qs ? `?${qs}` : ""}`);
	    } catch (err) {
	      setChatError(getErrorMessage(err, t("pathNode.chat.error.startFailed")));
	    } finally {
	      setChatSubmitting(false);
	    }
	  }, [chatBlock, chatQuestion, nodeId, node?.pathId, path?.id, buildBlockContext, navigate, t]);

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
          <div className="rounded-xl sm:rounded-2xl border border-border/60 bg-card/70 shadow-sm backdrop-blur">
            <div className="px-4 py-5 xs:px-5 xs:py-6 sm:px-6 sm:py-8 md:px-8 md:py-10">
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
                {drawerKind === "quiz" ? <QuizDrill drill={drillPayload} /> : null}
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
