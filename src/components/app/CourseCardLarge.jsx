import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function normalizeProgress(n) {
  const v = typeof n === "number" ? n : 0;
  return Math.min(Math.max(v, 0), 100);
}

function stageLabel(stage) {
  const s = String(stage || "").toLowerCase();
  if (!s) return null;
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
  const gen = course?.generation || null;

  const progressPercentage = normalizeProgress(
    gen?.status && gen.status !== "succeeded"
      ? gen.progress ?? course.progress
      : course.progress
  );

  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset =
    circumference - (progressPercentage / 100) * circumference;

  const showGen =
    gen &&
    (gen.status === "queued" ||
      gen.status === "running" ||
      gen.status === "failed");

  const genTitle =
    gen?.status === "failed"
      ? "Generation failed"
      : gen?.status === "queued"
        ? "Queued"
        : gen?.status === "running"
          ? stageLabel(gen.stage) || "Generating"
          : null;

  const genSub =
    gen?.status === "failed"
      ? (gen.error || "Unknown error")
      : gen?.message || null;

  return (
    <Card className="transition-all duration-200 hover:border-foreground/20 hover:shadow-md">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-1.5">
            <CardTitle className="text-balance text-xl leading-tight">
              {course.title}
            </CardTitle>

            {course.subject && (
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

            {showGen && (
              <div className="pt-1">
                <div className="text-xs font-medium text-foreground">
                  {genTitle}
                </div>
                {genSub && (
                  <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                    {genSub}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Progress Wheel */}
          <div className="relative flex-shrink-0">
            <svg className="size-16 -rotate-90 transform" viewBox="0 0 100 100">
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
                className="text-foreground transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-semibold">{progressPercentage}%</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {course.description && (
          <CardDescription className="text-sm leading-relaxed">
            {course.description}
          </CardDescription>
        )}

        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            Updated{" "}
            {new Date(
              course.updatedAt ||
                course.updated_at ||
                course.createdAt ||
                course.created_at
            ).toLocaleDateString()}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}










