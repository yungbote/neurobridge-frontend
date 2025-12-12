import axiosClient from "./AxiosClient";

export function mapModule(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    courseId: raw.course_id ?? raw.courseId ?? null,
    index: typeof raw.index === "number" ? raw.index : 0,
    title: raw.title ?? "",
    description: raw.description ?? "",
    metadata: raw.metadata ?? null,
    createdAt: raw.created_at ?? raw.createdAt ?? null,
    updatedAt: raw.updated_at ?? raw.updatedAt ?? null,
  };
}

export async function listModulesForCourse(courseId) {
  if (!courseId) throw new Error("listModulesForCourse: missing courseId");
  const resp = await axiosClient.get(`/courses/${courseId}/modules`);
  const raws = resp.data?.modules || [];
  return raws.map(mapModule).filter(Boolean);
}










