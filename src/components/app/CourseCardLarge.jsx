import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

function clampPct(n) {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(Math.max(v, 0), 100);
}

function stageLabel(stage) {
  const s = String(stage || "").toLowerCase();
  if (!s) return null;
  if (s === "queued") return "Queued";
  if (s === "ingest") return "Ingesting";
  if (s === "embed") return "Embedding";
  if (s === "metadata") return "Summarizing";
  if (s === "blueprint") return "Building outline";
  if (s === "lessons") return "Writing lessons";
  if (s === "quizzes") return "Creating quizzes";
  if (s === "done") return "Finalizing";
  return stage;
}

export function CourseCardLarge({ course }) {
  if (!course) return null;

  const jobStatus = String(course.jobStatus || "").toLowerCase();
  const jobStage = String(course.jobStage || "");
  const jobProgress = clampPct(course.jobProgress);

  // Provider strips job fields when generation is done.
  // So: if job fields exist, we're in "generation overlay" mode.
  const showGen =
    course.jobId ||
    course.jobStatus ||
    course.jobStage ||
    typeof course.jobProgress === "number" ||
    course.jobMessage;

  const isFailed = showGen && jobStatus === "failed";

  const progressPercentage = showGen ? jobProgress : clampPct(course.progress);

  const titleText = showGen
    ? isFailed
      ? "Generation failed"
      : stageLabel(jobStage) || "Generating course…"
    : course.title || "Untitled Course";

  const subText = showGen
    ? course.jobMessage || (isFailed ? "Unknown error" : null)
    : course.description || null;

  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset =
    circumference - (progressPercentage / 100) * circumference;

  return (
    <Link
      to={`/courses/${course.id}`}
      className="cursor-pointer"
      aria-label={`Open course ${course.title || "course"}`}
    >
      <Card className="transition-all duration-200 hover:border-foreground/20 hover:shadow-md">
        <CardHeader>
          <div className="flex min-h-[120px] items-start justify-between gap-4">
            <div className="flex-1 space-y-1.5">
              <CardTitle className="line-clamp-2 text-balance text-xl leading-tight">
                {titleText}
              </CardTitle>

              {!showGen && course.subject && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted px-2.5 py-1">
                    {course.subject}
                  </span>
                  {course.level && (
                    <span className="rounded-full bg-muted px-2.5 py-1">
                      {course.level}
                    </span>
                  )}
                </div>
              )}

              {subText && (
                <div className="pt-1">
                  <div className="line-clamp-2 text-sm text-muted-foreground">
                    {subText}
                  </div>
                </div>
              )}
            </div>

            <div className="flex h-20 w-20 shrink-0 items-center justify-center sm:h-[100px] sm:w-[100px]">
              <svg
                className="h-full w-full -rotate-90 transform"
                viewBox="0 0 100 100"
              >
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  className="text-muted"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className="text-primary transition-all duration-300"
                />
                <text
                  x="50"
                  y="50"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-foreground text-sm font-bold sm:text-base"
                  style={{ transform: "rotate(90deg)", transformOrigin: "center" }}
                >
                  {progressPercentage}%
                </text>
              </svg>
            </div>
          </div>
        </CardHeader>
      </Card>
    </Link>
    );
}









