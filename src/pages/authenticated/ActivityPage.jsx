import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { getActivity } from "@/api/ActivityService";
import { ingestEvents } from "@/api/EventService";
import { listActivitiesForNode } from "@/api/PathNodeService";
import { Container } from "@/layout/Container";
import { usePaths } from "@/providers/PathProvider";
import { ImageLightbox } from "@/components/app/ImageLightbox";

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

function extractBlocks(contentJSON) {
  const obj = safeParseJSON(contentJSON);
  if (!obj) return null;
  if (Array.isArray(obj)) return obj;
  if (Array.isArray(obj.blocks)) return obj.blocks;
  if (Array.isArray(obj.content)) return obj.content;
  return null;
}

export default function ActivityPage() {
  const { id: activityId } = useParams();
  const navigate = useNavigate();
  const { setActivePath } = usePaths();

  const [activity, setActivity] = useState(null);
  const [path, setPath] = useState(null);
  const [node, setNode] = useState(null);
  const [siblings, setSiblings] = useState([]);
  const [loading, setLoading] = useState(false);

  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!activityId) return;
      try {
        setLoading(true);
        const res = await getActivity(activityId);
        if (!mounted) return;

        setActivity(res.activity);
        setPath(res.path);
        setNode(res.node);
        setCompleted(false);

        const nodeId = res.pathNodeId ?? res.node?.id ?? null;
        if (nodeId) {
          const acts = await listActivitiesForNode(nodeId);
          if (!mounted) return;
          const sorted = (acts || []).slice().sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
          setSiblings(sorted);
        } else {
          setSiblings([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [activityId]);

  useEffect(() => {
    if (path?.id) setActivePath(path);
  }, [path, setActivePath]);

  const { prevActivity, nextActivity } = useMemo(() => {
    if (!activity) return { prevActivity: null, nextActivity: null };
    const idx = siblings.findIndex((x) => x.id === activity.id);
    const prev = idx > 0 ? siblings[idx - 1] : null;
    const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
    return { prevActivity: prev, nextActivity: next };
  }, [activity, siblings]);

  const blocks = useMemo(() => extractBlocks(activity?.contentJson), [activity]);

  const handleMarkComplete = useCallback(async () => {
    if (completed) return;
    if (!activity?.id) return;
    setCompleted(true);
    try {
      await ingestEvents([
        {
          client_event_id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          type: "activity_completed",
          occurred_at: new Date().toISOString(),
          path_id: path?.id ?? undefined,
          path_node_id: node?.id ?? undefined,
          activity_id: activity.id,
          data: { source: "ui" },
        },
      ]);
    } catch (err) {
      console.warn("[ActivityPage] failed to ingest activity_completed:", err);
    }
  }, [completed, activity?.id, path?.id, node?.id]);
  
// TODO: Support for rendering video && Animation && Diagram (beyond image figures) Blocks
  const renderBlock = (block, index) => {
    switch (block.type) {
      case "heading":
        return (
          <h2 key={index} className="text-lg font-medium text-foreground">
            {block.content}
          </h2>
        );
      case "text":
        return (
          <p key={index} className="text-pretty leading-relaxed text-muted-foreground">
            {block.content}
          </p>
        );
      case "code":
        return (
          <div key={index} className="overflow-hidden rounded-lg border border-border bg-muted/30">
            <pre className="overflow-x-auto p-4">
              <code className="text-sm text-foreground">{block.content}</code>
            </pre>
          </div>
        );
      case "image":
        return (
          <div key={index}>
            <ImageLightbox
              src={block.url}
              alt={block.alt || "Activity image"}
              caption={block.caption}
              frameClassName="bg-muted/30"
            />
          </div>
        );
      default:
        return null;
    }
  };

  if (loading && !activity) {
    return (
      <div className="min-h-svh bg-background">
        <Container size="2xl" className="py-10 text-sm text-muted-foreground">
          Loading…
        </Container>
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="min-h-svh bg-background">
        <Container size="2xl" className="py-10 text-sm text-muted-foreground">
          Activity not found.
        </Container>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-background">
      <Container size="2xl" className="py-8 sm:py-10">
        <div className="mb-8 flex items-center justify-between border-b border-border pb-6">
          <div className="flex-1">
            {prevActivity && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => navigate(`/activities/${prevActivity.id}`)}
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="text-sm">Previous</span>
              </Button>
            )}
          </div>

          <div className="flex-1 text-center">
            <p className="text-xs font-medium text-muted-foreground">
              {path?.title ? path.title : "Path"}
              {node?.title ? ` · ${node.title}` : ""}
            </p>
          </div>

          <div className="flex flex-1 justify-end">
            {nextActivity && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => navigate(`/activities/${nextActivity.id}`)}
              >
                <span className="text-sm">Next</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-8">
          <div className="space-y-3">
            <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground">
              {activity.title}
            </h1>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {activity.estimatedMinutes ? <span>{activity.estimatedMinutes} min</span> : null}
              {activity.kind ? (
                <>
                  <span>·</span>
                  <span className="capitalize">{activity.kind}</span>
                </>
              ) : null}
            </div>
          </div>

          {blocks && blocks.length > 0 ? (
            <div className="space-y-6">
              {blocks.map((b, i) => renderBlock(b, i))}
            </div>
          ) : (
            <div className="prose prose-neutral dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {activity.contentMd || ""}
              </ReactMarkdown>
            </div>
          )}

          <Separator />

          <div className="flex items-center gap-3 pt-2">
            <Button
              variant={completed ? "secondary" : "default"}
              className="gap-2"
              onClick={handleMarkComplete}
            >
              {completed ? (
                <>
                  <Check className="h-4 w-4" />
                  <span>Completed</span>
                </>
              ) : (
                <span>Mark as Complete</span>
              )}
            </Button>

            {nextActivity && !completed && (
              <Button variant="outline" onClick={() => navigate(`/activities/${nextActivity.id}`)}>
                Continue
              </Button>
            )}
          </div>
        </div>
      </Container>
    </div>
  );
}
