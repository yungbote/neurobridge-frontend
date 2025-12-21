import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { getActivity } from "@/api/ActivityService";
import { listActivitiesForNode } from "@/api/PathNodeService";

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

  const { prevActivity, nextActivity } = useMemo(() => {
    if (!activity) return { prevActivity: null, nextActivity: null };
    const idx = siblings.findIndex((x) => x.id === activity.id);
    const prev = idx > 0 ? siblings[idx - 1] : null;
    const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
    return { prevActivity: prev, nextActivity: next };
  }, [activity, siblings]);

  const blocks = useMemo(() => extractBlocks(activity?.contentJson), [activity]);

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
          <div key={index} className="space-y-2">
            <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
              <img
                src={block.url}
                alt={block.alt || "Activity image"}
                className="h-auto w-full"
              />
            </div>
            {block.caption && <p className="text-xs text-muted-foreground">{block.caption}</p>}
          </div>
        );
      default:
        return null;
    }
  };

  if (loading && !activity) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground sm:px-6 lg:px-8">
        Loading…
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground sm:px-6 lg:px-8">
        Activity not found.
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
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
              onClick={() => setCompleted(true)}
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
      </div>
    </div>
  );
}
