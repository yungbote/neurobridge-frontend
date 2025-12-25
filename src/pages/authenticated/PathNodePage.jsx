import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { getPath } from "@/api/PathService";
import { generateDrillForNode, getPathNodeContent, getPathNodeDoc, listDrillsForNode } from "@/api/PathNodeService";
import { NodeContentRenderer } from "@/components/path/NodeContentRenderer";
import { NodeDocRenderer } from "@/components/path/NodeDocRenderer";
import { Container } from "@/layout/Container";

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

        try {
          const d = await getPathNodeDoc(nodeId);
          if (!cancelled) setDoc(d);
        } catch (e) {
          // Doc is optional (fallback to legacy content_json).
          if (!cancelled && e?.response?.status !== 404) setDoc(null);
        }

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
  }, [nodeId]);

  const conceptKeys = useMemo(() => extractConceptKeys(node), [node]);

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

        {doc ? <NodeDocRenderer doc={doc} /> : <NodeContentRenderer contentJson={node?.contentJson} />}

        <Separator className="my-10" />

        <div className="text-xs text-muted-foreground">
          Drills are generated on-demand and grounded in your uploaded materials.
        </div>
      </Container>

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
