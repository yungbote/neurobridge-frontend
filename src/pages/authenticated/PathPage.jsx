import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

import { usePaths } from "@/providers/PathProvider";
import { getPath, listNodesForPath } from "@/api/PathService";
import { ConceptGraphView } from "@/components/path/ConceptGraphView";
import { Container } from "@/layout/Container";

export default function PathPage() {
  const { id: pathId } = useParams();
  const navigate = useNavigate();

  const { getById } = usePaths();
  const cached = pathId ? getById(pathId) : null;

  const [path, setPath] = useState(cached);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [view, setView] = useState("outline"); // "outline" | "graph"

  useEffect(() => {
    setPath(cached || null);
  }, [cached]);

  useEffect(() => {
    const showGen =
      cached?.jobId ||
      cached?.jobStatus ||
      cached?.jobStage ||
      typeof cached?.jobProgress === "number" ||
      cached?.jobMessage;

    if (showGen && cached?.jobId) {
      navigate(`/paths/build/${cached.jobId}`, { replace: true });
    }
  }, [cached, navigate]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!pathId) return;
      try {
        setLoading(true);
        setErr(null);

        if (!cached) {
          const p = await getPath(pathId);
          if (!mounted) return;

          const showGen =
            p?.jobId ||
            p?.jobStatus ||
            p?.jobStage ||
            typeof p?.jobProgress === "number" ||
            p?.jobMessage;

          if (showGen && p?.jobId) {
            navigate(`/paths/build/${p.jobId}`, { replace: true });
            return;
          }

          setPath(p);
        }

        const ns = await listNodesForPath(pathId);
        if (!mounted) return;
        setNodes(ns);
      } catch (e) {
        console.error("[PathPage] load failed:", e);
        if (mounted) setErr(e);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [pathId, cached, navigate]);

  const firstNode = useMemo(() => {
    const sortedNodes = (nodes || []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return sortedNodes[0] || null;
  }, [nodes]);

  const onStart = () => {
    if (!firstNode) return;
    navigate(`/path-nodes/${firstNode.id}`);
  };

  if (!pathId) return null;

  const displayTitle = path?.title || (loading ? "Loading path…" : "Path");
  const displayDescription = path?.description || "";

      return (
    <div className="min-h-svh bg-background">
      <Container size="2xl" className="py-10 sm:py-16">
        <div className="mb-12 space-y-4">
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {displayTitle}
          </h1>
          <p className="text-pretty text-lg leading-relaxed text-muted-foreground">
            {displayDescription}
          </p>

          {err && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              Failed to load path content.
            </div>
          )}
        </div>

        <div className="mb-10 flex flex-wrap items-center gap-2">
          <Button
            variant={view === "outline" ? "default" : "outline"}
            onClick={() => setView("outline")}
          >
            Outline
          </Button>
          <Button
            variant={view === "graph" ? "default" : "outline"}
            onClick={() => setView("graph")}
          >
            Concept Graph
          </Button>
        </div>

        {view === "graph" ? (
          <ConceptGraphView pathId={pathId} />
        ) : (
          <>
            <div className="mb-12">
              <h2 className="mb-6 text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Path Outline
              </h2>

              {loading && nodes.length === 0 ? (
                <div className="text-sm text-muted-foreground">Loading nodes…</div>
              ) : (
                <div className="space-y-2">
                  {(nodes || [])
                    .slice()
                    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
                    .map((node, nodeIndex) => {
                      const hasContent = Boolean(node?.contentJson);
                      return (
                        <button
                          key={node.id}
                          type="button"
                          onClick={() => navigate(`/path-nodes/${node.id}`)}
                          className="w-full rounded-xl border border-border bg-background px-4 py-4 text-left transition-colors hover:bg-muted/30"
                        >
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                              {nodeIndex + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <h3 className="text-base font-medium text-foreground truncate">
                                  {node.title}
                                </h3>
                                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {hasContent ? "Lesson ready" : "Lesson is still being written"}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>

            <div className="flex justify-center pt-4">
              <Button size="lg" className="px-8" onClick={onStart} disabled={!firstNode}>
                Start Path
              </Button>
            </div>
          </>
        )}
      </Container>
    </div>
  );
}






