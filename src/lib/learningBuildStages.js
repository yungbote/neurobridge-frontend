export function clampPct(n) {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(Math.max(v, 0), 100);
}

export function normalizeStage(stage) {
  const s = String(stage || "").trim();
  if (!s) return "";
  if (s.toLowerCase().startsWith("waiting_child_")) {
    return s.slice("waiting_child_".length);
  }
  return s;
}

export function stageLabel(stage) {
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
  if (s === "node_figures_plan_build") return "Planning figures";
  if (s === "node_figures_render") return "Rendering figures";
  if (s === "node_videos_plan_build") return "Planning videos";
  if (s === "node_videos_render") return "Rendering videos";
  if (s === "node_doc_build") return "Writing unit docs";
  if (s === "realize_activities") return "Writing node content";
  if (s === "coverage_coherence_audit") return "Auditing plan";
  if (s === "progression_compact") return "Finalizing progression";
  if (s === "variant_stats_refresh") return "Refreshing stats";
  if (s === "priors_refresh") return "Refreshing priors";
  if (s === "completed_unit_refresh") return "Finalizing";
  if (s === "done") return "Done";
  if (s.startsWith("timeout_")) return "Timed out";
  if (s.startsWith("stale_")) return "Stalled";
  return stage;
}

export const learningBuildStageOrder = [
  "ingest_chunks",
  "embed_chunks",
  "material_set_summarize",
  "concept_graph_build",
  "concept_cluster_build",
  "chain_signature_build",
  "user_profile_refresh",
  "teaching_patterns_seed",
  "path_plan_build",
  "node_figures_plan_build",
  "node_figures_render",
  "node_videos_plan_build",
  "node_videos_render",
  "node_doc_build",
  "realize_activities",
  "coverage_coherence_audit",
  "progression_compact",
  "variant_stats_refresh",
  "priors_refresh",
  "completed_unit_refresh",
];
