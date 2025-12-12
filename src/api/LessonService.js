import axiosClient from "./AxiosClient";

export function mapLesson(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    moduleId: raw.module_id ?? raw.moduleId ?? null,
    index: typeof raw.index === "number" ? raw.index : 0,

    title: raw.title ?? "",
    kind: raw.kind ?? "reading",

    estimatedMinutes:
      typeof raw.estimated_minutes === "number"
        ? raw.estimated_minutes
        : raw.estimatedMinutes ?? null,

    metadata: raw.metadata ?? null,

    createdAt: raw.created_at ?? raw.createdAt ?? null,
    updatedAt: raw.updated_at ?? raw.updatedAt ?? null,
  };
}

export async function listLessonsForModule(moduleId) {
  if (!moduleId) throw new Error("listLessonsForModule: missing moduleId");
  const resp = await axiosClient.get(`/modules/${moduleId}/lessons`);
  const raws = resp.data?.lessons || [];
  return raws.map(mapLesson).filter(Boolean);
}










