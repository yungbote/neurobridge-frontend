import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { getLesson, listLessonsForModule } from "@/api/LessonService";

function safeParseJSON(v) {
  if (!v) return null;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return null; }
  }
  return null;
}

// Supports either blocks array, or {blocks:[...]} shape
function extractBlocks(contentJSON) {
  const obj = safeParseJSON(contentJSON);
  if (!obj) return null;
  if (Array.isArray(obj)) return obj;
  if (Array.isArray(obj.blocks)) return obj.blocks;
  if (Array.isArray(obj.content)) return obj.content;
  return null;
}

export default function LessonPage() {
  const { id: lessonId } = useParams();
  const navigate = useNavigate();

  const [lesson, setLesson] = useState(null);
  const [module, setModule] = useState(null);
  const [siblings, setSiblings] = useState([]);
  const [loading, setLoading] = useState(false);

  // UI-only completion for now (wire to backend later)
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!lessonId) return;
      try {
        setLoading(true);

        const { lesson: l, module: m } = await getLesson(lessonId);
        if (!mounted) return;

        setLesson(l);
        setModule(m);
        setCompleted(false); // reset per lesson

        const moduleId = l?.module_id ?? l?.moduleId;
        if (moduleId) {
          const ls = await listLessonsForModule(moduleId);
          if (!mounted) return;
          // ensure order by index if present
          const sorted = (ls || []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
          setSiblings(sorted);
        } else {
          setSiblings([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [lessonId]);

  const { prevLesson, nextLesson, currentLessonNumber, currentModuleNumber } = useMemo(() => {
    if (!lesson) return { prevLesson: null, nextLesson: null, currentLessonNumber: null, currentModuleNumber: null };

    const idx = siblings.findIndex((x) => x.id === lesson.id);
    const prev = idx > 0 ? siblings[idx - 1] : null;
    const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

    const lessonNum = (lesson.index ?? idx ?? 0) + 1;
    const moduleNum = (module?.index ?? 0) + 1;

    return { prevLesson: prev, nextLesson: next, currentLessonNumber: lessonNum, currentModuleNumber: moduleNum };
  }, [lesson, module, siblings]);

  const blocks = useMemo(() => extractBlocks(lesson?.content_json), [lesson]);

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
      case "video":
        return (
          <div key={index} className="overflow-hidden rounded-lg border border-border bg-muted/30">
            <div className="aspect-video w-full">
              <video controls className="h-full w-full" poster={block.thumbnail}>
                <source src={block.url} type="video/mp4" />
              </video>
            </div>
            {block.caption && <p className="px-4 py-3 text-xs text-muted-foreground">{block.caption}</p>}
          </div>
        );
      case "image":
        return (
          <div key={index} className="space-y-2">
            <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
              <img
                src={block.url}
                alt={block.alt || "Lesson image"}
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

  if (loading && !lesson) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground sm:px-6 lg:px-8">
        Loading…
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground sm:px-6 lg:px-8">
        Lesson not found.
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Navigation Header */}
        <div className="mb-8 flex items-center justify-between border-b border-border pb-6">
          <div className="flex-1">
            {prevLesson && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => navigate(`/lessons/${prevLesson.id}`)}
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="text-sm">Previous</span>
              </Button>
            )}
          </div>

          <div className="flex-1 text-center">
            <p className="text-xs font-medium text-muted-foreground">
              {currentModuleNumber ? `Module ${currentModuleNumber}` : "Module"}
              {currentLessonNumber ? ` · Lesson ${currentLessonNumber}` : ""}
            </p>
          </div>

          <div className="flex flex-1 justify-end">
            {nextLesson && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => navigate(`/lessons/${nextLesson.id}`)}
              >
                <span className="text-sm">Next</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Lesson Content */}
        <div className="space-y-8">
          {/* Title and metadata */}
          <div className="space-y-3">
            <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground">
              {lesson.title}
            </h1>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {lesson.estimated_minutes ? <span>{lesson.estimated_minutes} min</span> : null}
              {lesson.kind ? (
                <>
                  <span>·</span>
                  <span className="capitalize">{lesson.kind}</span>
                </>
              ) : null}
            </div>
          </div>

          {/* Prefer block JSON if you have it; else render markdown */}
          {blocks && blocks.length > 0 ? (
            <div className="space-y-6">
              {blocks.map((b, i) => renderBlock(b, i))}
            </div>
          ) : (
            <div className="prose prose-neutral dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {lesson.content_md || ""}
              </ReactMarkdown>
            </div>
          )}

          <Separator />

          {/* Action Buttons */}
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

            {nextLesson && !completed && (
              <Button variant="outline" onClick={() => navigate(`/lessons/${nextLesson.id}`)}>
                Continue to Next Lesson
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}









