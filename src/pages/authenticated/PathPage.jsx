import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PlayCircle } from "lucide-react";

import { usePaths } from "@/providers/PathProvider";
import { getPath, listNodesForPath } from "@/api/PathService";
import { listActivitiesForNode } from "@/api/PathNodeService";
import { ConceptGraphView } from "@/components/path/ConceptGraphView";
import { Container } from "@/layout/Container";
import { cn } from "@/lib/utils";

export default function PathPage() {
  const { id: pathId } = useParams();
  const navigate = useNavigate();

  const { getById } = usePaths();
  const cached = pathId ? getById(pathId) : null;

  const [path, setPath] = useState(cached);
  const [nodes, setNodes] = useState([]);
  const [activitiesByNode, setActivitiesByNode] = useState({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [view, setView] = useState("outline"); // "outline" | "graph"

  useEffect(() => {
    setPath(cached || null);
  }, [cached]);

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
          setPath(p);
        }

        const ns = await listNodesForPath(pathId);
        if (!mounted) return;
        setNodes(ns);

        const pairs = await Promise.all(
          (ns || []).map(async (n) => {
            const acts = await listActivitiesForNode(n.id);
            return [n.id, acts];
          })
        );

        if (!mounted) return;
        const map = {};
        for (const [nid, acts] of pairs) map[nid] = acts;
        setActivitiesByNode(map);
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
  }, [pathId, cached]);

  const firstActivity = useMemo(() => {
    const sortedNodes = (nodes || []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    for (const n of sortedNodes) {
      const acts = activitiesByNode[n.id] || [];
      if (acts.length > 0) return acts[0];
    }
    return null;
  }, [nodes, activitiesByNode]);

  const onStart = () => {
    if (!firstActivity) return;
    navigate(`/activities/${firstActivity.id}`);
  };

  if (!pathId) return null;

  const displayTitle = path?.title || (loading ? "Loading path…" : "Path");
  const displayDescription = path?.description || "";

  return (
    <div className="min-h-svh bg-background">
      <Container
        className={cn(
          "py-10 sm:py-16",
          view === "graph" ? "max-w-6xl" : "max-w-3xl"
        )}
      >
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
                <Accordion type="single" collapsible className="w-full cursor-pointer">
                  {nodes.map((node, nodeIndex) => {
                    const activities = activitiesByNode[node.id] || [];
                    return (
                      <AccordionItem
                        key={node.id}
                        value={`node-${node.id}`}
                        className="border-b border-border"
                      >
                        <AccordionTrigger className="cursor-pointer text-left hover:no-underline">
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                              {nodeIndex + 1}
                            </span>
                            <div className="flex-1">
                              <h3 className="text-base font-medium text-foreground">
                                {node.title}
                              </h3>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {activities.length} item{activities.length !== 1 ? "s" : ""}
                              </p>
                            </div>
                          </div>
                        </AccordionTrigger>

                        <AccordionContent>
                          <div className="ml-9 space-y-0 pt-2">
                            {activities.map((act) => (
                              <button
                                key={act.id}
                                className="w-full rounded-md px-3 py-3 text-left transition-colors hover:bg-muted/50"
                                onClick={() => navigate(`/activities/${act.id}`)}
                              >
                                <div className="flex items-center gap-3">
                                  <PlayCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-foreground">
                                      {act.title}
                                    </p>
                                    {act.estimatedMinutes ? (
                                      <p className="mt-0.5 text-xs text-muted-foreground">
                                        {act.estimatedMinutes} min
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                              </button>
                            ))}

                            {activities.length === 0 && (
                              <div className="px-3 py-3 text-sm text-muted-foreground">
                                No items yet.
                              </div>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              )}
            </div>

            <div className="flex justify-center pt-4">
              <Button size="lg" className="px-8" onClick={onStart} disabled={!firstActivity}>
                Start Path
              </Button>
            </div>
          </>
        )}
      </Container>
    </div>
  );
}
