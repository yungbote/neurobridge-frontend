import axiosClient from "./AxiosClient";

function safeParseJSON(v) {
  if (!v) return null;
  if (typeof v === "object") return v; // jsonb usually arrives as object
  if (typeof v !== "string") return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

export function mapCourse(raw) {
  if (!raw) return null;

  const metadata = safeParseJSON(raw.metadata);

  return {
    id: raw.id,
    userId: raw.user_id ?? raw.userId ?? null,
    materialSetId: raw.material_set_id ?? raw.materialSetId ?? null,

    title: raw.title ?? "",
    description: raw.description ?? "",

    level: raw.level ?? null,
    subject: raw.subject ?? null,

    metadata: metadata ?? raw.metadata ?? null,

    progress: typeof raw.progress === "number" ? raw.progress : 0,

    createdAt: raw.created_at ?? raw.createdAt ?? null,
    updatedAt: raw.updated_at ?? raw.updatedAt ?? null,
  };
}

export function mapGenerationRun(raw) {
  if (!raw) return null;

  const metadata = safeParseJSON(raw.metadata);

  return {
    id: raw.id,
    userId: raw.user_id ?? raw.userId ?? null,
    courseId: raw.course_id ?? raw.courseId ?? null,
    materialSetId: raw.material_set_id ?? raw.materialSetId ?? null,

    status: raw.status ?? null,
    stage: raw.stage ?? null,
    progress: typeof raw.progress === "number" ? raw.progress : 0,

    attempts: typeof raw.attempts === "number" ? raw.attempts : 0,
    error: raw.error ?? null,
    lastErrorAt: raw.last_error_at ?? raw.lastErrorAt ?? null,
    lockedAt: raw.locked_at ?? raw.lockedAt ?? null,
    heartbeatAt: raw.heartbeat_at ?? raw.heartbeatAt ?? null,

    metadata: metadata ?? raw.metadata ?? null,

    createdAt: raw.created_at ?? raw.createdAt ?? null,
    updatedAt: raw.updated_at ?? raw.updatedAt ?? null,
  };
}

export async function listCourses() {
  const resp = await axiosClient.get("/courses");
  const raws = resp.data?.courses || [];
  return raws.map(mapCourse).filter(Boolean);
}

// NEW: latest run for a course
export async function getCourseGeneration(courseId) {
  if (!courseId) throw new Error("getCourseGeneration: missing courseId");
  const resp = await axiosClient.get(`/courses/${courseId}/generation`);
  return mapGenerationRun(resp.data?.run);
}

// NEW: get a run by id
export async function getGenerationRun(runId) {
  if (!runId) throw new Error("getGenerationRun: missing runId");
  const resp = await axiosClient.get(`/course-generation-runs/${runId}`);
  return mapGenerationRun(resp.data?.run);
}

// Helper: decide if a course is still generating (handles your mixed metadata shapes)
export function isCourseGenerating(course) {
  const status =
    course?.metadata?.status ??
    (typeof course?.metadata === "string" ? course.metadata : null);

  if (status === "generating") return true;
  if (status === "ready") return false;

  // fallback heuristic
  if ((course?.title || "").toLowerCase().includes("generating")) return true;
  return false;
}










