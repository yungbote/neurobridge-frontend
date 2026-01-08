import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Ellipsis, RotateCcw, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { restartJob } from "@/shared/api/JobService";
import { deletePath } from "@/shared/api/PathService";
import { useMaterials } from "@/app/providers/MaterialProvider";
import { usePaths } from "@/app/providers/PathProvider";
import { useI18n } from "@/app/providers/I18nProvider";
import { clampPct, stageLabel } from "@/shared/lib/learningBuildStages";
import { cn } from "@/shared/lib/utils";
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

  const { t } = useI18n();
  const { activePathId, clearActivePath, reload } = usePaths();
  const { reload: reloadMaterials } = useMaterials();
  const [action, setAction] = useState<"retry" | "trash" | null>(null);
  const [coverError, setCoverError] = useState(false);

  useEffect(() => {
    setCoverError(false);
  }, [path?.id, path?.updatedAt]);

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
      ? t("paths.generation.failed")
      : stageLabel(jobStage) || t("paths.generation.generating")
    : path.title || t("paths.untitled");

  const subText = showGen
    ? path.jobMessage || (isFailed ? t("common.unknownError") : null)
    : path.description || null;

  const meta = safeParseMetadata(path.metadata);
  const coverUrl = getPathAvatarUrl(path, meta);
  const isReady = String(path.status || "").toLowerCase() === "ready";
  const showMedia = !showGen && isReady;
  const showCover = showMedia && Boolean(coverUrl) && !coverError;

  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset =
    circumference - (progressPercentage / 100) * circumference;

  const canRetry = Boolean(path.jobId) && isFailed;
  const canTrash = isFailed && !isPlaceholder;
  const showFailedActions = canRetry || canTrash;

  const handleRetry = useCallback(async () => {
    const jobId = path.jobId ? String(path.jobId) : "";
    if (!jobId) return;
    setAction("retry");
    try {
      await restartJob(jobId);
      await reload();
    } catch (err) {
      console.error("[PathCardLarge] Retry failed:", err);
    } finally {
      setAction(null);
    }
  }, [path.jobId, reload]);

  const handleTrash = useCallback(async () => {
    const pathId = String(path.id || "");
    if (!pathId || pathId.startsWith("job:")) return;
    setAction("trash");
    try {
      await deletePath(pathId);
      if (activePathId && String(activePathId) === pathId) {
        clearActivePath();
      }
      await Promise.all([reload(), reloadMaterials()]);
    } catch (err) {
      console.error("[PathCardLarge] Trash failed:", err);
    } finally {
      setAction(null);
    }
  }, [activePathId, clearActivePath, path.id, reload, reloadMaterials]);

  const card = (
    <Card className="group relative w-full max-w-[360px] nb-motion-fast motion-reduce:transition-none hover:border-foreground/20 hover:shadow-md">
      <div className="absolute right-4 top-4 z-10 opacity-0 transition-opacity nb-duration-micro nb-ease-out group-hover:opacity-100 group-focus-within:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
	            <button
	              type="button"
	              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/60 text-muted-foreground shadow-sm backdrop-blur-sm nb-motion-fast motion-reduce:transition-none hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
	              aria-label={t("paths.options")}
	              title={t("common.options")}
	              onClick={(e) => {
	                e.preventDefault();
	                e.stopPropagation();
	              }}
	            >
              <Ellipsis className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={10} className="w-44">
            {showFailedActions ? (
              <>
                <DropdownMenuItem
                  disabled={!canRetry || action !== null}
                  onSelect={(e) => {
                    e.preventDefault();
                    void handleRetry();
                  }}
	                >
	                  <RotateCcw className="h-4 w-4" />
	                  {t("common.retry")}
	                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!canTrash || action !== null}
                  onSelect={(e) => {
                    e.preventDefault();
                    void handleTrash();
                  }}
	                >
	                  <Trash2 className="h-4 w-4" />
	                  {t("common.trash")}
	                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem
                disabled
                onSelect={(e) => e.preventDefault()}
	              >
	                {t("common.moreActionsSoon")}
	              </DropdownMenuItem>
	            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CardHeader>
        <div className="space-y-3">
          <div className="flex min-h-[110px] items-start justify-between gap-3">
            <div className="flex-1 space-y-1.5">
	              <div className="flex items-center justify-start gap-2">
	                <Badge>{t("paths.path")}</Badge>
	                {isFailed && <Badge variant="destructive">{t("common.failed")}</Badge>}
	              </div>
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
                    className="text-primary transition-[stroke-dashoffset] nb-duration nb-ease-out motion-reduce:transition-none"
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

          {showMedia && (
            <div className="flex justify-center">
              <div className="w-full max-w-[320px] overflow-hidden rounded-2xl border border-border/60 bg-muted/30 shadow-sm">
                <div className="aspect-[16/9]">
                  {showCover && coverUrl ? (
                    <img
                      src={coverUrl}
                      alt={t("paths.coverFor", { title: path.title || t("paths.untitled") })}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transform-gpu transition-transform nb-duration nb-ease-out motion-reduce:transition-none group-hover:scale-[1.02]"
                      onError={() => setCoverError(true)}
                    />
                  ) : (
                    <div
                      className={cn(
                        "h-full w-full flex items-center justify-center",
                        "bg-gradient-to-br from-muted/60 via-muted/30 to-background/60"
                      )}
                      aria-label={t("paths.noCoverAvailable")}
                    >
                      <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/60 px-3 py-2 shadow-sm">
                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">{t("paths.path").toUpperCase()}</span>
                      </div>
                    </div>
                  )}
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
      className="block cursor-pointer !no-underline !text-foreground"
      aria-label={t("paths.openPath.aria", { title: path.title || t("paths.untitled") })}
    >
      {card}
    </Link>
  );
}
