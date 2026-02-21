import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/shared/ui/button";
import { BookOpen, ChevronRight, CornerDownRight, Headphones, Layers } from "lucide-react";

import { usePaths } from "@/app/providers/PathProvider";
import { useLessons } from "@/app/providers/LessonProvider";
import { listNodesForPath, recordPathView } from "@/shared/api/PathService";
import { ConceptGraphView } from "@/features/paths/components/ConceptGraphView";
import { PathCardLarge } from "@/features/paths/components/PathCardLarge";
import { EmptyContent } from "@/shared/components/EmptyContent";
import { PathMaterialsView } from "@/features/paths/components/PathMaterialsView";
import { Container } from "@/shared/layout/Container";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import { useI18n } from "@/app/providers/I18nProvider";
import { Badge } from "@/shared/ui/badge";
import { Skeleton, SkeletonText } from "@/shared/ui/skeleton";
import { clampPct, stageLabel } from "@/shared/lib/learningBuildStages";
import { cn } from "@/shared/lib/utils";
import { queryKeys } from "@/shared/query/queryKeys";
import type { Path, PathNode } from "@/shared/types/models";

type OutlineRow = { node: PathNode; depth: number; hasChildren: boolean };

const EMPTY_NODES: PathNode[] = [];

function parseEnvBool(value: unknown, def: boolean) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return def;
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return def;
}

const NODE_AVATAR_RENDER_ENABLED = parseEnvBool(import.meta.env.VITE_NODE_AVATAR_RENDER_ENABLED, true);

type NodeAvailabilityStatus =
  | "available"
  | "soft_remediate"
  | "blocked"
  | "building"
  | "listed_not_ready"
  | "locked";

function normalizeNodeAvailabilityStatus(node: PathNode | null | undefined): NodeAvailabilityStatus {
  const raw = String(node?.availabilityStatus || "").trim().toLowerCase();
  switch (raw) {
    case "available":
    case "soft_remediate":
    case "blocked":
    case "building":
    case "listed_not_ready":
    case "locked":
      return raw;
    default:
      break;
  }
  const docState = String(node?.docStatus?.state || "").trim().toLowerCase();
  if (docState === "ready") return "available";
  if (docState === "building" || docState === "pending") return "building";
  return node?.contentJson ? "available" : "listed_not_ready";
}

function canNavigateNode(node: PathNode | null | undefined): boolean {
  const status = normalizeNodeAvailabilityStatus(node);
  return status === "available" || status === "soft_remediate";
}

function availabilityHint(status: NodeAvailabilityStatus): string {
  switch (status) {
    case "available":
      return "Ready";
    case "soft_remediate":
      return "Remediation suggested";
    case "blocked":
      return "Blocked by prerequisites";
    case "building":
      return "Preparing content";
    case "locked":
      return "Locked";
    case "listed_not_ready":
    default:
      return "Not ready yet";
  }
}

function PathOutlineSkeleton() {
  const depths = [0, 0, 1, 1, 2, 0, 1, 2];
  return (
    <div className="space-y-2" aria-hidden="true">
      {depths.map((depth, i) => {
        const indent = Math.min(depth, 4) * 16;
        return (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            className="w-full rounded-xl border border-border bg-background px-4 py-4"
          >
            <div className="flex items-start gap-3">
              {indent > 0 ? <div aria-hidden="true" style={{ width: indent }} /> : null}
              <Skeleton className="h-10 w-10 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-9/12 rounded-full" />
                <Skeleton className="h-4 w-6/12 rounded-full" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PathPageSkeleton({ embedded = false }: { embedded?: boolean } = {}) {
  const body = (
    <>
      {/* Header skeleton - responsive */}
      <div className="mb-8 sm:mb-10 md:mb-12 space-y-3 sm:space-y-4">
        <Skeleton className="h-9 xs:h-10 sm:h-12 w-[90%] sm:w-10/12 rounded-full" />
        <SkeletonText lines={2} className="max-w-2xl" />
      </div>

      {/* Outline skeleton - responsive */}
      <div className="mb-8 sm:mb-10 md:mb-12">
        <Skeleton className="mb-4 sm:mb-6 h-4 w-32 sm:w-40 rounded-full" />
        <PathOutlineSkeleton />
      </div>
    </>
  );

  if (embedded) {
    return <div aria-busy="true">{body}</div>;
  }

  return (
    <div className="page-surface" aria-busy="true">
      <Container size="app" className="page-pad">
        {body}
      </Container>
    </div>
  );
}

export default function PathPage() {
  const { id: pathId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [searchParams] = useSearchParams();

  const { getById, activatePath, setActivePath, paths } = usePaths();
  const { clearActiveLesson } = useLessons();
  const cached = pathId ? getById(pathId) : null;

  const [path, setPath] = useState<Path | null>(cached);
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
  const isProgram = String(path?.kind || "").toLowerCase() === "program";

  const childrenByParent = useMemo(() => {
    const list = Array.isArray(paths) ? paths : [];
    const byId = new Map<string, Path>();
    for (const p of list) {
      const id = String(p?.id || "");
      if (id) byId.set(id, p);
    }
    const out = new Map<string, Path[]>();
    for (const p of list) {
      const id = String(p?.id || "");
      const parentId = String(p?.parentPathId || "");
      if (!id || !parentId || parentId === id || !byId.has(parentId)) continue;
      const existing = out.get(parentId) ?? [];
      existing.push(p);
      out.set(parentId, existing);
    }
    for (const [pid, kids] of out.entries()) {
      kids.sort((a, b) => {
        const ai = typeof a?.sortIndex === "number" ? a.sortIndex : 0;
        const bi = typeof b?.sortIndex === "number" ? b.sortIndex : 0;
        if (ai !== bi) return ai - bi;
        return String(a?.title || "").localeCompare(String(b?.title || ""));
      });
      out.set(pid, kids);
    }
    return out;
  }, [paths]);

  const programChildren = useMemo(() => {
    if (!pathId) return [];
    return childrenByParent.get(String(pathId)) ?? [];
  }, [childrenByParent, pathId]);

  const renderProgramTree = (parentId: string, visited: Set<string>): React.ReactNode => {
    const children = childrenByParent.get(parentId) ?? [];
    if (children.length === 0) return null;

    return (
      <div className={cn("mt-4 space-y-4", "border-l border-border/60 pl-4")}>
        <div className="grid gap-4 sm:gap-6 grid-cols-1 xs:grid-cols-[repeat(auto-fill,minmax(min(100%,280px),360px))] sm:grid-cols-[repeat(auto-fill,minmax(min(100%,320px),360px))]">
          {children.map((p) => {
            const pid = String(p?.id || "");
            const nextVisited = new Set(visited);
            const already = pid ? visited.has(pid) : true;
            if (pid) nextVisited.add(pid);
            return (
              <div key={p.id} className="space-y-4">
                <PathCardLarge path={p} />
                {!already && pid ? renderProgramTree(pid, nextVisited) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

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

        setPath(p);
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
  }, [pathId, activatePath]);

  const nodesQuery = useQuery({
    queryKey: queryKeys.pathNodes(String(pathId || "")),
    enabled: Boolean(pathId),
    staleTime: 60_000,
    refetchInterval: (q) => {
      const rows = (q.state.data as PathNode[] | undefined) ?? [];
      if (!Array.isArray(rows) || rows.length === 0) return 6000;
      const hasPending = rows.some((n) => {
        const s = normalizeNodeAvailabilityStatus(n);
        return s === "building" || s === "listed_not_ready" || s === "locked";
      });
      return hasPending ? 4000 : false;
    },
    queryFn: () => listNodesForPath(String(pathId)),
  });

  const nodes = nodesQuery.data ?? EMPTY_NODES;
  const nodesLoading = Boolean(nodesQuery.isPending);

  const outline = useMemo((): { rows: OutlineRow[]; firstLeaf: PathNode | null } => {
    const sorted = (nodes || []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    if (sorted.length === 0) return { rows: [], firstLeaf: null };

    const byId = new Map<string, PathNode>();
    sorted.forEach((n) => {
      if (n?.id) byId.set(String(n.id), n);
    });

    const childrenByParent = new Map<string, PathNode[]>();
    const roots: PathNode[] = [];
    sorted.forEach((n) => {
      const parentId = n?.parentNodeId ? String(n.parentNodeId) : "";
      if (parentId && byId.has(parentId)) {
        const arr = childrenByParent.get(parentId) ?? [];
        arr.push(n);
        childrenByParent.set(parentId, arr);
      } else {
        roots.push(n);
      }
    });
    for (const arr of childrenByParent.values()) {
      arr.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    }
    roots.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

    const rows: OutlineRow[] = [];
    const seen = new Set<string>();
    const walk = (node: PathNode, depth: number) => {
      const id = String(node?.id || "");
      if (!id || seen.has(id)) return;
      seen.add(id);
      const children = childrenByParent.get(id) ?? [];
      rows.push({ node, depth, hasChildren: children.length > 0 });
      children.forEach((c) => walk(c, Math.min(depth + 1, 6)));
    };
    roots.forEach((r) => walk(r, 0));

    const firstLeaf =
      rows.find((r) => !r.hasChildren && canNavigateNode(r.node))?.node ??
      rows.find((r) => canNavigateNode(r.node))?.node ??
      null;
    return { rows, firstLeaf };
  }, [nodes]);

  const onStart = () => {
    if (!outline.firstLeaf) return;
    navigate(`/path-nodes/${outline.firstLeaf.id}`);
  };

  if (!pathId) return null;

  if ((loading || nodesLoading) && nodes.length === 0 && !path) {
    return <PathPageSkeleton />;
  }

  const displayTitle = path?.title || (loading ? t("paths.loadingPath") : t("paths.path"));
  const displayDescription = path?.description || "";

  const showGen =
    path?.jobId ||
    path?.jobStatus ||
    path?.jobStage ||
    typeof path?.jobProgress === "number" ||
    path?.jobMessage;

  const jobStatus = String(path?.jobStatus || "").toLowerCase();
  const jobStage = String(path?.jobStage || "");
  const isFailed = Boolean(showGen && jobStatus === "failed");
  const isCanceled = Boolean(showGen && jobStatus === "canceled");
  const isDone =
    Boolean(showGen) &&
    (jobStatus === "succeeded" || jobStatus === "success" || stageLabel(jobStage) === "Done");
  const showProgress = Boolean(showGen && !isFailed && !isDone && !isCanceled);
  const progressPct = showProgress ? clampPct(path?.jobProgress) : 0;

  return (
    <div className="page-surface">
      <Container size="app" className="page-pad">
        {/* Header section - responsive */}
        <div className="mb-8 sm:mb-10 md:mb-12 space-y-3 sm:space-y-4">
          <h1 className={cn(
            "text-balance font-semibold tracking-tight text-foreground",
            // Responsive typography
            "text-2xl xs:text-3xl sm:text-4xl md:text-[44px] lg:text-5xl"
          )}>
            {displayTitle}
          </h1>
          <p className={cn(
            "text-pretty leading-relaxed text-muted-foreground",
            // Responsive typography
            "text-sm xs:text-base sm:text-lg"
          )}>
            {displayDescription}
          </p>

          {/* Generation progress card - responsive */}
          {showGen ? (
            <div className="rounded-xl sm:rounded-2xl border border-border/60 bg-muted/20 p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row sm:flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1 sm:space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <Badge>{t("paths.inProgress")}</Badge>
                    {isFailed ? <Badge variant="destructive">{t("common.failed")}</Badge> : null}
                  </div>
                  <div className="text-sm font-medium text-foreground">
                    {isFailed
                      ? t("paths.generation.failed")
                      : isCanceled
                        ? t("chat.pathGeneration.canceled")
                      : stageLabel(jobStage) || t("paths.generation.generating")}
                  </div>
                  {path?.jobMessage ? (
                    <div className="text-[11px] xs:text-xs text-muted-foreground">{path.jobMessage}</div>
                  ) : null}
                </div>

                {path?.jobId ? (
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {showProgress ? (
                      <div className="flex-1 sm:flex-none sm:min-w-[140px]">
                        <div className="mb-1 flex items-center justify-between text-[10px] xs:text-[11px] text-muted-foreground">
                          <span>{progressPct}%</span>
                          <span>{t("paths.generation.generating")}</span>
                        </div>
                        <div className="h-1.5 sm:h-2 w-full overflow-hidden rounded-full bg-muted/60">
                          <div
                            className="h-full rounded-full bg-primary transition-[width] nb-duration nb-ease-out motion-reduce:transition-none"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    ) : null}
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="shrink-0 h-9 sm:h-8 touch-manipulation"
                    >
                      <Link to={`/paths/build/${path.jobId}`}>{t("sidebar.openChat")}</Link>
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {err != null && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              {t("paths.loadFailed")}
            </div>
          )}
        </div>

        {isMindmapView ? (
          isProgram ? (
            <EmptyContent
              title={t("paths.program")}
              message="This program doesn’t have a mindmap. Open a track to see its concept graph."
              icon={<BookOpen className="h-7 w-7" />}
            />
          ) : (
            <ConceptGraphView pathId={pathId} />
          )
        ) : isMaterialsView ? (
          <PathMaterialsView pathId={pathId} />
        ) : isAudioView ? (
          <EmptyContent
            title={t("paths.audio.title")}
            message={t("paths.audio.message")}
            helperText={t("paths.audio.helper")}
            icon={<Headphones className="h-7 w-7" />}
          />
        ) : (
          <>
            {/* Outline section - responsive */}
            <div className="mb-8 sm:mb-10 md:mb-12">
              <h2 className="mb-4 sm:mb-6 text-xs sm:text-sm font-medium uppercase tracking-wide text-muted-foreground">
                {isProgram ? "Tracks" : t("paths.outline")}
              </h2>

              {isProgram ? (
                programChildren.length === 0 ? (
                  <EmptyContent
                    title="No tracks yet"
                    message="This program will show tracks once they’re created."
                    icon={<BookOpen className="h-7 w-7" />}
                  />
                ) : (
                  renderProgramTree(String(pathId), new Set([String(pathId)]))
                )
              ) : nodesLoading && nodes.length === 0 ? (
                <PathOutlineSkeleton />
              ) : nodes.length === 0 ? (
                <div className="rounded-2xl border border-border/60 bg-muted/20 p-8 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-background/60 text-muted-foreground shadow-sm">
                    <BookOpen className="h-6 w-6" />
                  </div>
                  <div className="text-base font-medium text-foreground">{t("sidebar.emptyLessons")}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {path?.jobId
                      ? t("paths.lessons.building")
                      : t("paths.lessons.none")}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {outline.rows.map(({ node, depth, hasChildren }) => {
                      const hasContent = Boolean(node?.contentJson);
                      const availabilityStatus = normalizeNodeAvailabilityStatus(node);
                      const canOpen = canNavigateNode(node);
                      const hint = availabilityHint(availabilityStatus);
                      const avatarUrl =
                        NODE_AVATAR_RENDER_ENABLED &&
                        typeof node?.avatarUrl === "string" &&
                        node.avatarUrl.trim()
                          ? node.avatarUrl.trim()
                          : null;
                      const showAvatarSkeleton = Boolean(
                        NODE_AVATAR_RENDER_ENABLED && !hasChildren && !avatarUrl
                      );
                      const indent = Math.min(depth, 4) * 16;

                      return (
                        <button
                          key={node.id}
                          type="button"
                          onClick={() => {
                            if (!canOpen) return;
                            navigate(`/path-nodes/${node.id}`);
                          }}
                          disabled={!canOpen}
                          aria-disabled={!canOpen}
                          className={cn(
                            "w-full rounded-xl border border-border bg-background text-start",
                            // Touch-friendly sizing (min 48px height on mobile)
                            "min-h-[56px] sm:min-h-[48px] px-3 py-3 sm:px-4 sm:py-4",
                            // Transitions
                            "nb-motion-fast motion-reduce:transition-none",
                            // Hover/active states
                            canOpen ? "hover:bg-muted/30 active:bg-muted/50 active:scale-[0.995]" : "opacity-70 cursor-not-allowed",
                            // Touch optimizations
                            "touch-manipulation -webkit-tap-highlight-color-transparent"
                          )}
                        >
                          <div className="flex items-start gap-2 sm:gap-3">
                            {indent > 0 ? (
                              <div
                                aria-hidden="true"
                                className="mt-0.5 flex shrink-0 items-center justify-end text-muted-foreground/70"
                                style={{ width: indent }}
                              >
                                <CornerDownRight className="h-4 w-4" />
                              </div>
                            ) : null}
                            <Avatar className="mt-0.5 h-7 w-7 sm:h-6 sm:w-6 shrink-0">
                              {avatarUrl ? (
                                <AvatarImage src={avatarUrl} alt={`${node.title} avatar`} />
                              ) : null}
                              <AvatarFallback
                                className={cn(
                                  "border border-border/60 bg-primary/10 text-primary",
                                  showAvatarSkeleton && "animate-pulse bg-muted/40 text-muted-foreground"
                                )}
                              >
                                {hasChildren ? (
                                  <Layers className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                                ) : (
                                  <BookOpen className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                                )}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2 sm:gap-3">
                                <h3 className="text-sm sm:text-base font-medium text-foreground truncate">
                                  {node.title}
                                </h3>
                                <ChevronRight className="mt-0.5 h-5 w-5 sm:h-4 sm:w-4 shrink-0 text-muted-foreground" />
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {hasChildren ? t("paths.outline") : hint}
                              </p>
                              {availabilityStatus !== "available" ? (
                                <p className="mt-1 text-[11px] text-muted-foreground/90">
                                  {String(node?.availabilityReason || "").trim() || (hasContent ? "" : t("paths.lessons.writing"))}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Start button - responsive */}
            {!isProgram ? (
              <div className="flex justify-center pt-2 sm:pt-4">
                <Button
                  size="lg"
                  className={cn(
                    "px-6 sm:px-8",
                    "h-12 sm:h-11",
                    "text-base sm:text-sm",
                    "touch-manipulation -webkit-tap-highlight-color-transparent",
                    "active:scale-[0.97]"
                  )}
                  onClick={onStart}
                  disabled={!outline.firstLeaf}
                >
                  {t("paths.start")}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Container>
    </div>
  );
}
