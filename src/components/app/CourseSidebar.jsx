import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, matchPath } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ChevronDown, ChevronRight, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { useCourses } from "@/providers/CourseProvider";
import { listModulesForCourse } from "@/api/ModuleService";
import { listLessonsForModule } from "@/api/LessonService";

function getMeta(course) {
  const m = course?.metadata;
  if (!m) return {};
  if (typeof m === "object") return m;
  if (typeof m === "string") {
    try {
      return JSON.parse(m);
    } catch {
      return {};
    }
  }
  return {};
}

function clampPct(n) {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(Math.max(v, 0), 100);
}

export function CourseSidebar() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();

  const { getById } = useCourses();

  const courseId = useMemo(() => {
    const m = matchPath({ path: "/courses/:id", end: false }, location.pathname);
    return m?.params?.id || params.id || null;
  }, [location.pathname, params.id]);

  const course = courseId ? getById(courseId) : null;
  const meta = getMeta(course);

  const courseTitle = meta.short_title || meta.shortTitle || course?.title || "Course";
  const courseProgress = clampPct(course?.progress);

  const [expandedModules, setExpandedModules] = useState([]);
  const [modules, setModules] = useState([]);
  const [lessonsByModule, setLessonsByModule] = useState({});
  const [loading, setLoading] = useState(false);

  const activeLessonId = useMemo(() => {
    const m = matchPath({ path: "/lessons/:id", end: true }, location.pathname);
    return m?.params?.id || null;
  }, [location.pathname]);

  // Placeholder completion set — wire later when you have lesson progress API
  const completedLessons = useMemo(() => new Set(), []);
  const isLessonCompleted = (lessonId) => completedLessons.has(lessonId);

  const toggleModule = (moduleId) => {
    setExpandedModules((prev) =>
      prev.includes(moduleId) ? prev.filter((id) => id !== moduleId) : [...prev, moduleId]
    );
  };

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!courseId) return;
      try {
        setLoading(true);

        const mods = await listModulesForCourse(courseId);
        if (!mounted) return;

        setModules(mods || []);

        setExpandedModules((prev) => {
          if (prev.length > 0) return prev;
          return (mods || []).slice(0, 3).map((m) => m.id);
        });

        const pairs = await Promise.all(
          (mods || []).map(async (m) => [m.id, await listLessonsForModule(m.id)])
        );

        if (!mounted) return;
        const map = {};
        for (const [mid, lessons] of pairs) map[mid] = lessons || [];
        setLessonsByModule(map);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [courseId]);

  return (
    <Sidebar collapsible="offcanvas" variant="sidebar">
      {/* Header */}
      <SidebarHeader className="border-b border-sidebar-border">
        {!isCollapsed ? (
          <div className="p-6 pb-5 min-w-0">
            {/* title w/ tooltip */}
            <Tooltip>
              <TooltipTrigger asChild>
                <h1 className="text-lg font-semibold text-sidebar-foreground leading-snug truncate">
                  {courseTitle}
                </h1>
              </TooltipTrigger>
              <TooltipContent side="right" align="start">
                {courseTitle}
              </TooltipContent>
            </Tooltip>

            <div className="mt-4 space-y-2 min-w-0">
              <div className="flex items-center justify-between text-sm min-w-0 gap-2">
                <span className="text-muted-foreground truncate">Course Progress</span>
                <span className="font-medium text-sidebar-foreground shrink-0">
                  {courseProgress}%
                </span>
              </div>
              <Progress value={courseProgress} className="h-1.5" />
            </div>
          </div>
        ) : (
          // collapsed header: keep minimal; no trigger
          <div className="h-14 px-3 flex items-center justify-center">
            <div className="w-8">
              <Progress value={courseProgress} className="h-1.5" />
            </div>
          </div>
        )}
      </SidebarHeader>

      {/* Content */}
      <SidebarContent className="p-0 overflow-x-hidden">
        {isCollapsed ? null : (
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            <nav className="p-3 space-y-1 overflow-x-hidden">
              {loading && modules.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">Loading…</div>
              ) : (
                modules.map((module) => {
                  const isExpanded = expandedModules.includes(module.id);
                  const lessons = lessonsByModule[module.id] || [];
                  const completedCount = lessons.filter((l) => isLessonCompleted(l.id)).length;

                  return (
                    <div key={module.id} className="space-y-1 min-w-0">
                      {/* Module row */}
                      <Button
                        variant="ghost"
                        className={cn(
                          "w-full h-auto px-3 py-2 text-sm font-medium",
                          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          "text-sidebar-foreground",
                          "min-w-0 justify-start"
                        )}
                        onClick={() => toggleModule(module.id)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0" />
                        )}

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="ml-2 flex-1 min-w-0 text-left truncate">
                              {module.title}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="right" align="start">
                            {module.title}
                          </TooltipContent>
                        </Tooltip>

                        <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                          {completedCount}/{lessons.length}
                        </span>
                      </Button>

                      {/* Lessons */}
                      {isExpanded && (
                        <div className="ml-6 space-y-0.5 min-w-0 overflow-x-hidden">
                          {lessons.map((lesson) => {
                            const completed = isLessonCompleted(lesson.id);
                            const isActive = activeLessonId === lesson.id;

                            return (
                              <Button
                                key={lesson.id}
                                variant="ghost"
                                className={cn(
                                  "w-full h-auto px-3 py-2 text-sm",
                                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                                  completed ? "text-sidebar-foreground" : "text-muted-foreground",
                                  isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
                                  "min-w-0 justify-start"
                                )}
                                onClick={() => navigate(`/lessons/${lesson.id}`)}
                              >
                                {completed ? (
                                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                                ) : (
                                  <Circle className="h-4 w-4 shrink-0" />
                                )}

                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="ml-2 flex-1 min-w-0 text-left truncate">
                                      {lesson.title}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="right" align="start">
                                    {lesson.title}
                                  </TooltipContent>
                                </Tooltip>

                                {lesson.estimated_minutes ? (
                                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                                    {lesson.estimated_minutes} min
                                  </span>
                                ) : null}
                              </Button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </nav>
          </div>
        )}
      </SidebarContent>
    </Sidebar>
  );
}










