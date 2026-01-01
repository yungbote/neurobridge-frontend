import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { createChatThread, sendChatMessage } from "@/api/ChatService";
import { ingestEvents } from "@/api/EventService";
import { getPath } from "@/api/PathService";
import {
  enqueuePathNodeDocPatch,
  generateDrillForNode,
  getPathNodeContent,
  getPathNodeDoc,
  listDrillsForNode,
  listPathNodeDocRevisions,
} from "@/api/PathNodeService";
import { NodeContentRenderer } from "@/components/path/NodeContentRenderer";
import { NodeDocRenderer } from "@/components/path/NodeDocRenderer";
import { Container } from "@/layout/Container";
import { useSSEContext } from "@/providers/SSEProvider";
import { useUser } from "@/providers/UserProvider";
import { usePaths } from "@/providers/PathProvider";

function safeParseJSON(v) {
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

function resolvePayload(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

function extractConceptKeys(node) {
  const md = safeParseJSON(node?.metadata) ?? node?.metadata;
  const keys = md?.concept_keys ?? md?.conceptKeys ?? [];
  if (!Array.isArray(keys)) return [];
  return keys.map((k) => String(k || "").trim()).filter(Boolean);
}

function FlashcardsDrill({ drill }) {
  const cards = Array.isArray(drill?.cards) ? drill.cards : [];
  const [idx, setIdx] = useState(0);
  const [showBack, setShowBack] = useState(false);

  useEffect(() => {
    setIdx(0);
    setShowBack(false);
  }, [drill]);

  if (cards.length === 0) {
    return <div className="text-sm text-muted-foreground">No flashcards generated.</div>;
  }

  const card = cards[Math.min(Math.max(idx, 0), cards.length - 1)] || {};
  const front = String(card.front_md ?? "");
  const back = String(card.back_md ?? "");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div>
          Card {idx + 1} / {cards.length}
        </div>
        <button
          type="button"
          className="underline underline-offset-4 hover:text-foreground"
          onClick={() => setShowBack((v) => !v)}
        >
          {showBack ? "Show front" : "Show back"}
        </button>
      </div>

      <div
        className={cn(
          "rounded-xl border border-border bg-muted/30 p-4",
          "min-h-[180px] flex items-center"
        )}
      >
        <div className="w-full text-[15px] leading-relaxed text-foreground/90">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{showBack ? back : front}</ReactMarkdown>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => {
            setIdx((v) => Math.max(0, v - 1));
            setShowBack(false);
          }}
          disabled={idx <= 0}
        >
          Previous
        </Button>
        <Button
          onClick={() => {
            setIdx((v) => Math.min(cards.length - 1, v + 1));
            setShowBack(false);
          }}
          disabled={idx >= cards.length - 1}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function QuizDrill({ drill }) {
  const questions = Array.isArray(drill?.questions) ? drill.questions : [];
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setIdx(0);
    setSelected(null);
    setRevealed(false);
  }, [drill]);

  if (questions.length === 0) {
    return <div className="text-sm text-muted-foreground">No quiz generated.</div>;
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
    .filter(Boolean);
  const answerId =
    typeof q.answer_id === "string" && q.answer_id.trim()
      ? q.answer_id.trim()
      : typeof q.correct_index === "number"
      ? String(q.correct_index)
      : null;

  const select = (id) => {
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
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div>
          Question {idx + 1} / {questions.length}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <div className="text-[15px] leading-relaxed text-foreground/90">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{String(q.prompt_md ?? "")}</ReactMarkdown>
        </div>
      </div>

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
                "w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors",
                "border-border hover:bg-muted/40",
                isCorrect && "border-emerald-500/50 bg-emerald-500/10",
                isWrong && "border-destructive/50 bg-destructive/10"
              )}
            >
              {String(opt.text ?? "")}
            </button>
          );
        })}
      </div>

      {revealed ? (
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="text-xs font-medium text-muted-foreground">Explanation</div>
          <div className="mt-2 text-[15px] leading-relaxed text-foreground/90">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{String(q.explanation_md ?? "")}</ReactMarkdown>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between pt-1">
        <Button
          variant="outline"
          onClick={() => {
            setIdx((v) => Math.max(0, v - 1));
            setSelected(null);
            setRevealed(false);
          }}
          disabled={idx <= 0}
        >
          Previous
        </Button>
        <Button onClick={next} disabled={idx >= questions.length - 1}>
          Next
        </Button>
      </div>
    </div>
  );
}

export default function PathNodePage() {
  const { id: nodeId } = useParams();
  const navigate = useNavigate();
  const { lastMessage, connected } = useSSEContext();
  const { user } = useUser();
  const { setActivePathId, setActivePath } = usePaths();

  const [loading, setLoading] = useState(false);
  const [node, setNode] = useState(null);
  const [doc, setDoc] = useState(null);
  const [path, setPath] = useState(null);
  const [drills, setDrills] = useState([]);
  const [err, setErr] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTitle, setDrawerTitle] = useState("");
  const [drawerKind, setDrawerKind] = useState("");
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState("");
  const [drawerDrill, setDrawerDrill] = useState(null);

  const [pendingBlocks, setPendingBlocks] = useState({});
  const pendingJobsRef = useRef({});
  const [blockFeedback, setBlockFeedback] = useState({});
  const [undoableBlocks, setUndoableBlocks] = useState({});

  const [regenDialogOpen, setRegenDialogOpen] = useState(false);
  const [regenBlock, setRegenBlock] = useState(null);
  const [regenInstruction, setRegenInstruction] = useState("");
  const [regenPolicy, setRegenPolicy] = useState("reuse_only");
  const [regenError, setRegenError] = useState("");
  const [regenSubmitting, setRegenSubmitting] = useState(false);

  const [chatDialogOpen, setChatDialogOpen] = useState(false);
  const [chatBlock, setChatBlock] = useState(null);
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

  const loadDoc = useCallback(async () => {
    if (!nodeId) return null;
    try {
      return await getPathNodeDoc(nodeId);
    } catch (e) {
      if (e?.response?.status !== 404) return null;
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
        const n = await getPathNodeContent(nodeId);
        if (cancelled) return;
        setNode(n);

        if (n?.pathId) {
          const p = await getPath(n.pathId);
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
  }, [nodeId, loadDoc]);

  useEffect(() => {
    if (node?.pathId) setActivePathId(node.pathId);
  }, [node?.pathId, setActivePathId]);

  useEffect(() => {
    if (path?.id) setActivePath(path);
  }, [path, setActivePath]);

  const conceptKeys = useMemo(() => extractConceptKeys(node), [node]);

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
        const next = {};
        rows.forEach((r) => {
          const id = String(r?.block_id ?? r?.blockId ?? "").trim();
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
    (payload) => {
      if (!payload) return "";
      const fromPayload = String(payload.block_id ?? "").trim();
      if (fromPayload) return fromPayload;
      const idx = Number.isFinite(payload.block_index) ? payload.block_index : null;
      if (idx == null) return "";
      const blocks = Array.isArray(doc?.blocks) ? doc.blocks : [];
      const candidate = blocks[idx]?.id ?? "";
      return String(candidate || "").trim();
    },
    [doc?.blocks]
  );

  const handleJobUpdate = useCallback(
    (event, data) => {
      const job = data?.job;
      const jobType = String(data?.job_type ?? job?.job_type ?? job?.jobType ?? "").toLowerCase();
      if (jobType !== "node_doc_patch") return;
      const payload = resolvePayload(job?.payload);
      const payloadNodeId = String(payload?.path_node_id ?? "");
      if (payloadNodeId && String(nodeId || "") !== payloadNodeId) return;

      const jobId = String(data?.job_id ?? job?.id ?? "");
      let blockId = "";
      if (jobId && pendingJobsRef.current[jobId]) {
        blockId = pendingJobsRef.current[jobId];
      } else {
        blockId = resolveBlockId(payload);
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
        console.warn("[PathNodePage] doc patch failed:", data?.error || job?.error || "unknown");
      }
    },
    [loadDoc, nodeId, resolveBlockId]
  );

  useEffect(() => {
    if (!lastMessage) return;
    if (!user?.id) return;
    if (lastMessage.channel !== user.id) return;
    const event = String(lastMessage.event || "").toLowerCase();
    handleJobUpdate(event, lastMessage.data || {});
  }, [lastMessage, user?.id, handleJobUpdate]);

  useEffect(() => {
    if (!connected) return;
    if (!nodeId) return;
    loadDoc().then((d) => {
      if (d !== undefined) setDoc(d);
    });
  }, [connected, nodeId, loadDoc]);

  const recordFeedback = useCallback(
    async (block, idx, next) => {
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
            path_id: node?.pathId ?? path?.id ?? "",
            path_node_id: nodeId,
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
    (block, idx) => {
      const blockId = String(block?.id ?? "").trim();
      if (!blockId) return;
      const current = blockFeedback?.[blockId] || "";
      const next = current === "like" ? "" : "like";
      recordFeedback(block, idx, next);
    },
    [blockFeedback, recordFeedback]
  );

  const handleDislike = useCallback(
    (block, idx) => {
      const blockId = String(block?.id ?? "").trim();
      if (!blockId) return;
      const current = blockFeedback?.[blockId] || "";
      const next = current === "dislike" ? "" : "dislike";
      recordFeedback(block, idx, next);
    },
    [blockFeedback, recordFeedback]
  );

  const openRegenDialog = useCallback((block) => {
    setRegenBlock(block || null);
    setRegenInstruction("");
    setRegenPolicy("reuse_only");
    setRegenError("");
    setRegenDialogOpen(true);
  }, []);

  const openChatDialog = useCallback((block) => {
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
      setRegenError("Add a short note about what should change.");
      return;
    }

    setRegenSubmitting(true);
    setRegenError("");
    try {
      const payload = {
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
      setRegenError(String(err?.response?.data?.error || err?.message || "Failed to enqueue regen"));
    } finally {
      setRegenSubmitting(false);
    }
  }, [nodeId, regenBlock, regenInstruction, regenPolicy]);

  const buildBlockContext = useCallback((block) => {
    if (!block) return "";
    const type = String(block?.type || "").toLowerCase();
    const clip = (v, max = 500) => {
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
        return `Figure: ${clip(block?.caption)}\nURL: ${clip(block?.asset?.url)}`;
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
      setChatError("Add a question or point of confusion.");
      return;
    }
    setChatSubmitting(true);
    setChatError("");
    try {
      const thread = await createChatThread({
        title: `Doc block: ${String(chatBlock?.type || "note")}`,
        pathId: node?.pathId ?? path?.id ?? null,
      });
      if (!thread?.id) {
        throw new Error("Failed to create thread");
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
      setChatError(String(err?.response?.data?.error || err?.message || "Failed to start chat"));
    } finally {
      setChatSubmitting(false);
    }
  }, [chatBlock, chatQuestion, nodeId, node?.pathId, path?.id, buildBlockContext, navigate]);

  const handleUndo = useCallback(
    async (block) => {
      if (!nodeId || !block?.id) return;
      const blockId = String(block.id);
      try {
        const rows = await listPathNodeDocRevisions(nodeId, { limit: 10, includeDocs: true });
        const latest = rows.find((r) => String(r?.block_id ?? "") === blockId);
        const before = latest?.before_json ?? latest?.beforeJson ?? null;
        const parsed = safeParseJSON(before);
        const prevBlocks = Array.isArray(parsed?.blocks) ? parsed.blocks : [];
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
    async (kind, label) => {
      if (!nodeId) return;
      setDrawerOpen(true);
      setDrawerKind(kind);
      setDrawerTitle(label || "Drill");
      setDrawerLoading(true);
      setDrawerError("");
      setDrawerDrill(null);
      try {
        const out = await generateDrillForNode(nodeId, kind);
        setDrawerDrill(out);
      } catch (e) {
        const msg = String(e?.response?.data?.error || e?.message || "Failed to generate drill");
        setDrawerError(msg);
      } finally {
        setDrawerLoading(false);
      }
    },
    [nodeId]
  );

  const drillPayload = drawerDrill && typeof drawerDrill === "object" ? drawerDrill : null;

  return (
    <div className="min-h-svh bg-background">
      <Container size="2xl" className="py-10 sm:py-14">
        <div className="mb-8 space-y-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => (path?.id ? navigate(`/paths/${path.id}`) : navigate(-1))}>
              Back
            </Button>
            {path?.title ? (
              <div className="text-xs text-muted-foreground truncate">{path.title}</div>
            ) : null}
          </div>

          <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground">
            {node?.title || (loading ? "Loading node…" : "Node")}
          </h1>

          {conceptKeys.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {conceptKeys.slice(0, 18).map((k) => (
                <span
                  key={k}
                  className="rounded-full border border-border bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground"
                >
                  {k}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {err ? (
          <div className="mb-6 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            Failed to load node.
          </div>
        ) : null}

        {drills.length > 0 ? (
          <div className="mb-8 rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-foreground">Recommended drills</div>
                <div className="text-xs text-muted-foreground">Launch practice tools inline.</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {drills.map((d) => (
                <Button
                  key={d.kind}
                  variant="secondary"
                  onClick={() => openDrill(d.kind, d.label)}
                >
                  {d.label || d.kind}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {doc ? (
          <NodeDocRenderer
            doc={doc}
            pendingBlocks={pendingBlocks}
            blockFeedback={blockFeedback}
            undoableBlocks={undoableBlocks}
            onLike={handleLike}
            onDislike={handleDislike}
            onRegenerate={(block) => openRegenDialog(block)}
            onChat={(block) => openChatDialog(block)}
            onUndo={(block) => handleUndo(block)}
          />
        ) : (
          <NodeContentRenderer contentJson={node?.contentJson} />
        )}

        <Separator className="my-10" />

        <div className="text-xs text-muted-foreground">
          Drills are generated on-demand and grounded in your uploaded materials.
        </div>
      </Container>

      <Dialog open={regenDialogOpen} onOpenChange={(open) => !regenSubmitting && setRegenDialogOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate block</DialogTitle>
            <DialogDescription>
              Describe what should change. The more specific, the better.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Textarea
              value={regenInstruction}
              onChange={(e) => setRegenInstruction(e.target.value)}
              placeholder="What is unclear or should be improved?"
              rows={5}
            />
            {String(regenBlock?.type || "").toLowerCase() !== "figure" &&
            String(regenBlock?.type || "").toLowerCase() !== "video" ? (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">Citations</div>
                <Select value={regenPolicy} onValueChange={setRegenPolicy}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Citation policy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reuse_only">Reuse existing citations only</SelectItem>
                    <SelectItem value="allow_new">Allow new sources from your materials</SelectItem>
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
              Cancel
            </Button>
            <Button onClick={submitRegen} disabled={regenSubmitting}>
              {regenSubmitting ? "Submitting…" : "Regenerate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={chatDialogOpen} onOpenChange={(open) => !chatSubmitting && setChatDialogOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ask about this block</DialogTitle>
            <DialogDescription>
              Ask clarifying questions to refine what should change before regenerating.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={chatQuestion}
              onChange={(e) => setChatQuestion(e.target.value)}
              placeholder="What doesn’t make sense or what do you want changed?"
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
              Cancel
            </Button>
            <Button onClick={submitChat} disabled={chatSubmitting}>
              {chatSubmitting ? "Starting…" : "Start chat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-[92vw] sm:w-[520px]">
          <SheetHeader>
            <SheetTitle>{drawerTitle}</SheetTitle>
          </SheetHeader>

          <div className="mt-4">
            {drawerLoading ? (
              <div className="text-sm text-muted-foreground">Generating…</div>
            ) : drawerError ? (
              <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                {drawerError}
              </div>
            ) : drillPayload ? (
              <>
                {drawerKind === "flashcards" ? <FlashcardsDrill drill={drillPayload} /> : null}
                {drawerKind === "quiz" ? <QuizDrill drill={drillPayload} /> : null}
              </>
            ) : (
              <div className="text-sm text-muted-foreground">No drill loaded.</div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
