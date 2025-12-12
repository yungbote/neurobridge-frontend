import React, { useMemo, useState } from "react";
import {
  CheckSquare,
  BookOpen,
  Clock,
  Bookmark,
  CheckCircle2,
  History,
  Code2,
} from "lucide-react";
import { CourseCardLarge } from "@/components/app/CourseCardLarge";
import { useCourses } from "@/providers/CourseProvider";
import { EmptyContent } from "@/components/app/EmptyContent";

export function HomeTabs() {
  const [activeTab, setActiveTab] = useState("home");
  const { courses, loading } = useCourses();

  const tabs = [
    { id: "home", label: "Home" },
    { id: "in-progress", label: "In Progress" },
    { id: "saved", label: "Saved" },
    { id: "completed", label: "Completed" },
    { id: "recently-viewed", label: "Recently Viewed" },
    {
      id: "coding-challenge",
      label: "Coding Challenge",
      icon: <CheckSquare className="size-5" />,
    },
  ];

  const normalizeProgress = (course) => {
    const raw =
      course.progressPercent ??
      course.progress_percent ??
      course.progress ??
      0;

    if (typeof raw !== "number" || Number.isNaN(raw)) return 0;
    return Math.max(0, Math.min(100, raw));
  };

  const filteredCourses = useMemo(() => {
    if (!courses || courses.length === 0) return [];

    switch (activeTab) {
      case "completed":
        return courses.filter((c) => normalizeProgress(c) >= 100);

      case "in-progress":
        return courses.filter((c) => {
          const p = normalizeProgress(c);
          // treat 0–99 as in-progress for now
          return p >= 0 && p < 100;
        });

      case "saved":
        // placeholder: later you can use a real saved flag in metadata
        return courses;

      case "recently-viewed":
        // simple recency sort; still same courses list
        return [...courses].sort((a, b) => {
          const aDate =
            new Date(
              (a.metadata && a.metadata.lastViewedAt) ||
                a.updatedAt ||
                a.updated_at ||
                a.createdAt ||
                a.created_at ||
                0
            ).getTime() || 0;

          const bDate =
            new Date(
              (b.metadata && b.metadata.lastViewedAt) ||
                b.updatedAt ||
                b.updated_at ||
                b.createdAt ||
                b.created_at ||
                0
            ).getTime() || 0;

          return bDate - aDate;
        });

      case "coding-challenge":
        // placeholder filter by subject / tags if you add them
        return courses;

      case "home":
      default:
        return courses;
    }
  }, [activeTab, courses]);

  // Per-tab empty-state copy + icon
  const emptyConfig = (() => {
    switch (activeTab) {
      case "home":
        return {
          title: "No courses yet",
          message:
            "Upload your first set of materials and we’ll scaffold a course for you automatically.",
          helperText: "Use the “New Course” button in the nav to get started.",
          icon: <BookOpen className="w-8 h-8" />,
        };

      case "in-progress":
        return {
          title: "Nothing in progress",
          message:
            "Once you start working through a course, it will appear here with your progress.",
          helperText: "Open any course to begin learning.",
          icon: <Clock className="w-8 h-8" />,
        };

      case "saved":
        return {
          title: "No saved courses yet",
          message: "You can bookmark courses you want to come back to later.",
          helperText: "Soon you’ll be able to pin favorites here.",
          icon: <Bookmark className="w-8 h-8" />,
        };

      case "completed":
        return {
          title: "No completed courses",
          message:
            "Finished courses will show up here once you work through all the material.",
          helperText: "Progress updates will be tracked automatically.",
          icon: <CheckCircle2 className="w-8 h-8" />,
        };

      case "recently-viewed":
        return {
          title: "Nothing recent",
          message:
            "Recently opened courses will show up here so you can jump back in quickly.",
          helperText: "Open any course to start building a trail.",
          icon: <History className="w-8 h-8" />,
        };

      case "coding-challenge":
        return {
          title: "No challenges yet",
          message: "Coding challenges tied to your materials will live here.",
          helperText: "We’ll surface practice sets as the platform evolves.",
          icon: <Code2 className="w-8 h-8" />,
        };

      default:
        return {
          title: "Nothing here yet",
          message: "We don’t have anything to show for this view right now.",
          helperText: "",
          icon: <BookOpen className="w-8 h-8" />,
        };
    }
  })();

  return (
    <div className="w-full bg-background">
      <header className="border-b border-border bg-background">
        <nav className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex h-14 items-stretch gap-8 overflow-x-auto scrollbar-none">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-current={activeTab === tab.id ? "page" : undefined}
                className={`
                  font-brand relative flex items-center cursor-pointer gap-2.5 whitespace-nowrap py-3 text-xl font-medium transition-all duration-200
                  ${
                    activeTab === tab.id
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground/80"
                  }
                `}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {activeTab === tab.id && (
                  <span className="absolute inset-x-0 bottom-0 h-[2px] bg-foreground rounded-t-full" />
                )}
              </button>
            ))}
          </div>
        </nav>
      </header>

      {/* Card Content */}
      <main className="mx-auto max-w-7xl px-6 py-12 lg:px-8 lg:py-16">
        {loading ? (
          <p>Loading your courses…</p>
        ) : !filteredCourses || filteredCourses.length === 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="col-span-1 sm:col-span-2 lg:col-span-3">
              <EmptyContent
                title={emptyConfig.title}
                message={emptyConfig.message}
                helperText={emptyConfig.helperText}
                icon={emptyConfig.icon}
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCourses.map((course) => (
              <CourseCardLarge key={course.id} course={course} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}










