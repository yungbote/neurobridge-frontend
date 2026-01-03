import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle } from "@/shared/ui/card";
import { clampPct, stageLabel } from "@/shared/lib/learningBuildStages";
import type { Path } from "@/shared/types/models";

interface PathCardLargeProps {
  path?: Path | null;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeParseMetadata(value: Path["metadata"]): JsonRecord | null {
  if (!value) return null;
  if (isRecord(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function getCoverImageUrlFromMeta(meta: JsonRecord | null): string | null {
  if (!meta) return null;
  const cover = meta["cover_image"];
  if (isRecord(cover)) {
    const url = cover["url"];
    if (typeof url === "string" && url.trim()) return url.trim();
  }
  const flatUrl = meta["cover_image_url"];
  if (typeof flatUrl === "string" && flatUrl.trim()) return flatUrl.trim();
  return null;
}

function getPathAvatarUrl(path: Path | null | undefined, meta: JsonRecord | null): string | null {
  if (!path) return null;
  if (typeof path.avatarSquareUrl === "string" && path.avatarSquareUrl.trim()) {
    return path.avatarSquareUrl.trim();
  }
  const metaCoverUrl = getCoverImageUrlFromMeta(meta);
  if (typeof metaCoverUrl === "string" && metaCoverUrl.trim()) {
    return metaCoverUrl.trim();
  }
  if (typeof path.avatarUrl === "string" && path.avatarUrl.trim()) {
    return path.avatarUrl.trim();
  }
  return null;
}

export function PathCardLarge({ path }: PathCardLargeProps) {
  if (!path) return null;

  const isPlaceholder = String(path.id || "").startsWith("job:");

  const jobStatus = String(path.jobStatus || "").toLowerCase();
  const jobStage = String(path.jobStage || "");
  const jobProgress = clampPct(path.jobProgress);

  const showGen =
    path.jobId ||
    path.jobStatus ||
    path.jobStage ||
    typeof path.jobProgress === "number" ||
    path.jobMessage;

  const isFailed = showGen && jobStatus === "failed";
  const isDone =
    showGen &&
    (jobStatus === "succeeded" || jobStatus === "success" || stageLabel(jobStage) === "Done");
  const showProgress = showGen && !isFailed && !isDone;

  const progressPercentage = showProgress ? jobProgress : 0;

  const titleText = showGen
    ? isFailed
      ? "Generation failed"
      : stageLabel(jobStage) || "Generating path…"
    : path.title || "Untitled Path";

  const subText = showGen
    ? path.jobMessage || (isFailed ? "Unknown error" : null)
    : path.description || null;

  const meta = safeParseMetadata(path.metadata);
  const coverUrl = getPathAvatarUrl(path, meta);
  const isReady = String(path.status || "").toLowerCase() === "ready";
  const showCover = !showGen && isReady && Boolean(coverUrl);

  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset =
    circumference - (progressPercentage / 100) * circumference;

  const card = (
    <Card className="group transition-all duration-200 hover:border-foreground/20 hover:shadow-md">
      <CardHeader>
        <div className="space-y-3">
          <div className="flex min-h-[110px] items-start justify-between gap-3">
            <div className="flex-1 space-y-1.5">
              <CardTitle className="line-clamp-2 text-balance text-lg leading-tight sm:text-xl">
                {titleText}
              </CardTitle>

              {subText && (
                <div className="pt-1">
                  <div className="line-clamp-2 text-sm text-muted-foreground">
                    {subText}
                  </div>
                </div>
              )}
            </div>

            {showProgress && (
              <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center sm:h-[92px] sm:w-[92px]">
                <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
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
            )}
          </div>

          {showCover && coverUrl && (
            <div className="flex justify-center">
              <div className="w-full max-w-[320px] overflow-hidden rounded-2xl border border-border/60 bg-muted/30 shadow-sm">
                <div className="aspect-[16/9]">
                  <img
                    src={coverUrl}
                    alt={`Cover for ${path.title || "learning path"}`}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
    </Card>
  );

  const to = showGen && path.jobId
    ? `/paths/build/${path.jobId}`
    : !isPlaceholder
      ? `/paths/${path.id}`
      : null;

  if (!to) return <div className="cursor-default">{card}</div>;

  return (
    <Link
      to={to}
      className="cursor-pointer"
      aria-label={`Open path ${path.title || "path"}`}
    >
      {card}
    </Link>
  );
}
