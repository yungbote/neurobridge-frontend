import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

function clampPct(n) {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(Math.max(v, 0), 100);
}

function normalizeStage(stage) {
  const s = String(stage || "").trim();
  if (!s) return "";
  if (s.toLowerCase().startsWith("waiting_child_")) {
    return s.slice("waiting_child_".length);
  }
  return s;
}

function stageLabel(stage) {
  const s = normalizeStage(stage).toLowerCase();
  if (!s) return null;
  if (s === "queued") return "Queued";

  if (s === "ingest_chunks") return "Ingesting";
  if (s === "embed_chunks") return "Embedding";
  if (s === "material_set_summarize") return "Summarizing materials";
  if (s === "concept_graph_build") return "Building concept graph";
  if (s === "concept_cluster_build") return "Clustering concepts";
  if (s === "chain_signature_build") return "Building signatures";
  if (s === "user_profile_refresh") return "Refreshing profile";
  if (s === "teaching_patterns_seed") return "Seeding teaching patterns";
  if (s === "path_plan_build") return "Planning path";
  if (s === "realize_activities") return "Generating activities";
  if (s === "coverage_coherence_audit") return "Auditing plan";
  if (s === "progression_compact") return "Finalizing progression";
  if (s === "variant_stats_refresh") return "Refreshing stats";
  if (s === "priors_refresh") return "Refreshing priors";
  if (s === "completed_unit_refresh") return "Finalizing";
  if (s === "done") return "Done";

  return stage;
}

export function PathCardLarge({ path }) {
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

  const progressPercentage = showGen
    ? jobProgress
    : String(path.status || "").toLowerCase() === "ready"
      ? 100
      : 0;

  const titleText = showGen
    ? isFailed
      ? "Generation failed"
      : stageLabel(jobStage) || "Generating path…"
    : path.title || "Untitled Path";

  const subText = showGen
    ? path.jobMessage || (isFailed ? "Unknown error" : null)
    : path.description || null;

  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset =
    circumference - (progressPercentage / 100) * circumference;

  const card = (
    <Card className="transition-all duration-200 hover:border-foreground/20 hover:shadow-md">
      <CardHeader>
        <div className="flex min-h-[120px] items-start justify-between gap-4">
          <div className="flex-1 space-y-1.5">
            <CardTitle className="line-clamp-2 text-balance text-xl leading-tight">
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

          <div className="flex h-20 w-20 shrink-0 items-center justify-center sm:h-[100px] sm:w-[100px]">
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










