import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/shared/ui/button";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Separator } from "@/shared/ui/separator";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock, InlineCode } from "@/shared/components/CodeBlock";

import { getActivity } from "@/shared/api/ActivityService";
import { ingestEvents } from "@/shared/api/EventService";
import { listActivitiesForNode } from "@/shared/api/PathNodeService";
import { Container } from "@/shared/layout/Container";
import { usePaths } from "@/app/providers/PathProvider";
import { ImageLightbox } from "@/shared/components/ImageLightbox";
import { useI18n } from "@/app/providers/I18nProvider";
import type { Activity, NodeActivity, Path, PathNode } from "@/shared/types/models";

type ActivityBlock = {
  type?: string;
  content?: string;
  url?: string;
  alt?: string;
  caption?: string;
};

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

function extractBlocks(contentJSON: unknown): ActivityBlock[] | null {
  const obj = safeParseJSON(contentJSON);
  if (!obj) return null;
  if (Array.isArray(obj)) return obj as ActivityBlock[];
  if (typeof obj === "object" && obj && Array.isArray((obj as { blocks?: unknown }).blocks)) {
    return (obj as { blocks: ActivityBlock[] }).blocks;
  }
  if (typeof obj === "object" && obj && Array.isArray((obj as { content?: unknown }).content)) {
    return (obj as { content: ActivityBlock[] }).content;
  }
  return null;
}

export default function ActivityPage() {
  const { id: activityId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { setActivePath } = usePaths();
  const { t } = useI18n();

  const [activity, setActivity] = useState<Activity | null>(null);
  const [path, setPath] = useState<Path | null>(null);
  const [node, setNode] = useState<PathNode | null>(null);
  const [siblings, setSiblings] = useState<NodeActivity[]>([]);
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
          clientEventId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          type: "activity_completed",
          occurredAt: new Date().toISOString(),
          pathId: path?.id ?? undefined,
          pathNodeId: node?.id ?? undefined,
          activityId: activity.id,
          data: { source: "ui" },
        },
      ]);
    } catch (err) {
      console.warn("[ActivityPage] failed to ingest activity_completed:", err);
    }
  }, [completed, activity?.id, path?.id, node?.id]);
  
// TODO: Support for rendering video && Animation && Diagram (beyond image figures) Blocks
  const renderBlock = (block: ActivityBlock, index: number) => {
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
        return <CodeBlock key={index}>{String(block.content || "").replace(/\n$/, "")}</CodeBlock>;
      case "image":
        if (!block.url) return null;
        return (
          <div key={index}>
            <ImageLightbox
              src={block.url || ""}
              alt={block.alt || t("activity.imageAlt")}
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
      <div className="page-surface">
        <Container size="2xl" className="page-pad-compact text-sm text-muted-foreground">
          {t("common.loading")}
        </Container>
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="page-surface">
        <Container size="2xl" className="page-pad-compact text-sm text-muted-foreground">
          {t("activity.notFound")}
        </Container>
      </div>
    );
  }

  return (
    <div className="page-surface">
      <Container size="2xl" className="page-pad-compact">
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
                <span className="text-sm">{t("common.previous")}</span>
              </Button>
            )}
          </div>

          <div className="flex-1 text-center">
            <p className="text-xs font-medium text-muted-foreground">
              {path?.title ? path.title : t("paths.path")}
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
                <span className="text-sm">{t("common.next")}</span>
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
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownCodeComponents}>
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
                  <span>{t("activity.completed")}</span>
                </>
              ) : (
                <span>{t("activity.markComplete")}</span>
              )}
            </Button>

            {nextActivity && !completed && (
              <Button variant="outline" onClick={() => navigate(`/activities/${nextActivity.id}`)}>
                {t("common.continue")}
              </Button>
            )}
          </div>
        </div>
      </Container>
    </div>
  );
}
