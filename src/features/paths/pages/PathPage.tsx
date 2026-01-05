import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/shared/ui/button";
import { BookOpen, ChevronRight, Headphones } from "lucide-react";

import { usePaths } from "@/app/providers/PathProvider";
import { useLessons } from "@/app/providers/LessonProvider";
import { listNodesForPath, recordPathView } from "@/shared/api/PathService";
import { ConceptGraphView } from "@/features/paths/components/ConceptGraphView";
import { EmptyContent } from "@/shared/components/EmptyContent";
import { PathMaterialsView } from "@/features/paths/components/PathMaterialsView";
import { Container } from "@/shared/layout/Container";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import type { Path, PathNode } from "@/shared/types/models";

export default function PathPage() {
  const { id: pathId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { getById, activatePath, setActivePath } = usePaths();
  const { clearActiveLesson } = useLessons();
  const cached = pathId ? getById(pathId) : null;

  const [path, setPath] = useState<Path | null>(cached);
  const [nodes, setNodes] = useState<PathNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<unknown | null>(null);
  const viewRecordedForRef = useRef<string | null>(null);
  const viewParam = useMemo(() => {
    return String(searchParams.get("view") || "").toLowerCase();
  }, [searchParams]);
  const view = viewParam === "mindmap" || viewParam === "graph" ? "graph" : "outline";
  const isMaterialsView = viewParam === "materials";
  const isAudioView = viewParam === "audio";
  const isMindmapView = view === "graph";
  const isUnitView = !isMindmapView && !isMaterialsView && !isAudioView;

  useEffect(() => {
    setPath(cached || null);
  }, [cached]);

  useEffect(() => {
    // Viewing the path overview (not a lesson) => clear active lesson.
    clearActiveLesson();
  }, [pathId, clearActiveLesson]);

  useEffect(() => {
    if (!pathId) return;
    if (!path?.id || path.id !== pathId) return;

    const showGen =
      path?.jobId ||
      path?.jobStatus ||
      path?.jobStage ||
      typeof path?.jobProgress === "number" ||
      path?.jobMessage;
    if (showGen) return;

    if (viewRecordedForRef.current === pathId) return;
    viewRecordedForRef.current = pathId;

    recordPathView(pathId)
      .then((updated) => {
        if (updated?.id && updated.id === pathId) {
          setPath((prev) => (prev ? { ...prev, ...updated } : updated));
          setActivePath(updated);
        }
      })
      .catch((e) => {
        console.warn("[PathPage] Failed to record path view:", e);
      });
  }, [
    pathId,
    path?.id,
    path?.jobId,
    path?.jobStatus,
    path?.jobStage,
    path?.jobProgress,
    path?.jobMessage,
    setActivePath,
  ]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!pathId) return;
      try {
        setLoading(true);
        setErr(null);

        const p = await activatePath(pathId);
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
  }, [pathId, activatePath, navigate]);

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
    <div className="page-surface">
      <Container size="2xl" className="page-pad">
        <div className="mb-12 space-y-4">
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {displayTitle}
          </h1>
          <p className="text-pretty text-lg leading-relaxed text-muted-foreground">
            {displayDescription}
          </p>

          {err != null && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              Failed to load path content.
            </div>
          )}
        </div>

        {isMindmapView ? (
          <ConceptGraphView pathId={pathId} />
        ) : isMaterialsView ? (
          <PathMaterialsView pathId={pathId} />
        ) : isAudioView ? (
          <EmptyContent
            title="Audio view"
            message="Audio summaries are coming soon for this path."
            helperText="Switch to Unit or Mindmap to continue learning."
            icon={<Headphones className="h-7 w-7" />}
          />
        ) : (
          <>
            <div className="mb-12">
              <h2 className="mb-6 text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Path Outline
              </h2>

              {loading && nodes.length === 0 ? (
                <div className="text-sm text-muted-foreground">Loading nodes…</div>
              ) : nodes.length === 0 ? (
                <div className="rounded-2xl border border-border/60 bg-muted/20 p-8 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-background/60 text-muted-foreground shadow-sm">
                    <BookOpen className="h-6 w-6" />
                  </div>
                  <div className="text-base font-medium text-foreground">No lessons yet</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {path?.jobId
                      ? "We’re still building your path. Check back in a moment."
                      : "This path doesn’t have any lessons yet."}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {(nodes || [])
                    .slice()
                    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
                    .map((node, nodeIndex) => {
                      const hasContent = Boolean(node?.contentJson);
                      const avatarUrl =
                        typeof node?.avatarUrl === "string" && node.avatarUrl.trim()
                          ? node.avatarUrl.trim()
                          : null;
                      return (
                        <button
                          key={node.id}
                          type="button"
                          onClick={() => navigate(`/path-nodes/${node.id}`)}
                          className="w-full rounded-xl border border-border bg-background px-4 py-4 text-left transition-colors hover:bg-muted/30"
                        >
                          <div className="flex items-start gap-3">
                            <Avatar className="mt-0.5 h-6 w-6 shrink-0">
                              {avatarUrl ? (
                                <AvatarImage src={avatarUrl} alt={`${node.title} avatar`} />
                              ) : null}
                              <AvatarFallback className="text-xs font-medium text-muted-foreground">
                                {nodeIndex + 1}
                              </AvatarFallback>
                            </Avatar>
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
