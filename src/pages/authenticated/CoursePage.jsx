import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PlayCircle } from "lucide-react";
import { useCourses } from "@/providers/CourseProvider";
import { listModulesForCourse } from "@/api/ModuleService";
import { listLessonsForModule } from "@/api/LessonService";
import { Container } from "@/layout/Container";

function getMeta(course) {
  const m = course?.metadata;
  if (!m) return {};
  if (typeof m === "object") return m;
  if (typeof m === "string") {
    try { return JSON.parse(m); } catch { return {}; }
  }
  return {};
}

export default function CoursePage() {
  const { id: courseId } = useParams();
  const navigate = useNavigate();
  const { getById } = useCourses();
  const course = getById(courseId);
  const meta = useMemo(() => getMeta(course), [course]);
  const [modules, setModules] = useState([]);
  const [lessonsByModule, setLessonsByModule] = useState({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const displayTitle =
    meta.long_title || meta.longTitle || course?.title || (loading ? "Loading course…" : "Course");
  const displayDescription =
    meta.long_description || meta.longDescription || course?.description || "";


  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!courseId) return;
      try {
        setLoading(true);
        setErr(null);

        const mods = await listModulesForCourse(courseId);
        if (!mounted) return;
        setModules(mods);

        // Load lessons for each module (simple + reliable)
        const pairs = await Promise.all(
          (mods || []).map(async (m) => {
            const lessons = await listLessonsForModule(m.id);
            return [m.id, lessons];
          })
        );

        if (!mounted) return;
        const map = {};
        for (const [mid, lessons] of pairs) map[mid] = lessons;
        setLessonsByModule(map);
      } catch (e) {
        console.error("[CoursePage] load failed:", e);
        if (mounted) setErr(e);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [courseId]);

  const firstLesson = useMemo(() => {
    for (const m of modules) {
      const lessons = lessonsByModule[m.id] || [];
      if (lessons.length > 0) return lessons[0];
    }
    return null;
  }, [modules, lessonsByModule]);

  const onStartCourse = () => {
    if (!firstLesson) return;
    // Choose your route convention. Here’s a sane default:
    navigate(`/lessons/${firstLesson.id}`);
  };

  if (!courseId) return null;

  return (
    <div className="min-h-svh bg-background">
      <Container size="xl" className="py-10 sm:py-16">
        {/* Course Header */}
        <div className="mb-12 space-y-4">
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {displayTitle}
          </h1>
          <p className="text-pretty text-lg leading-relaxed text-muted-foreground">
            {displayDescription}
          </p>

          {err && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              Failed to load course content.
            </div>
          )}
        </div>

        {/* Modules Accordion */}
        <div className="mb-12">
          <h2 className="mb-6 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Course Content
          </h2>

          {loading && modules.length === 0 ? (
            <div className="text-sm text-muted-foreground">Loading modules…</div>
          ) : (
            <Accordion type="single" collapsible className="w-full cursor-pointer">
              {modules.map((module, moduleIndex) => {
                const lessons = lessonsByModule[module.id] || [];
                return (
                  <AccordionItem
                    key={module.id}
                    value={`module-${module.id}`}
                    className="border-b border-border"
                  >
                    <AccordionTrigger className="cursor-pointer text-left hover:no-underline">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                          {moduleIndex + 1}
                        </span>
                        <div className="flex-1">
                          <h3 className="text-base font-medium text-foreground">
                            {module.title}
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {lessons.length} lesson{lessons.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                    </AccordionTrigger>

                    <AccordionContent>
                      <div className="ml-9 space-y-0 pt-2">
                        {lessons.map((lesson) => (
                          <button
                            key={lesson.id}
                            className="w-full rounded-md px-3 py-3 text-left transition-colors hover:bg-muted/50"
                            onClick={() => navigate(`/lessons/${lesson.id}`)}
                          >
                            <div className="flex items-center gap-3">
                              <PlayCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-foreground">
                                  {lesson.title}
                                </p>
                                {lesson.estimated_minutes ? (
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    {lesson.estimated_minutes} min
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </button>
                        ))}

                        {lessons.length === 0 && (
                          <div className="px-3 py-3 text-sm text-muted-foreground">
                            No lessons yet.
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

        {/* Start Course Button */}
        <div className="flex justify-center pt-4">
          <Button size="lg" className="px-8" onClick={onStartCourse} disabled={!firstLesson}>
            Start Course
          </Button>
        </div>
      </Container>
    </div>
  );
}








