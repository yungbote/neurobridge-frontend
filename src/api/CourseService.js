import axiosClient from "./AxiosClient";

export async function listCourses() {
  const resp = await axiosClient.get("/courses");
  const data = resp?.data ?? resp;        // handles interceptors
  return { courses: data?.courses ?? [] }; // provider-friendly shape
}

export async function uploadCourseMaterials(files) {
  if (!files || files.length === 0) {
    throw new Error("uploadCourseMaterials: no files provided");
  }

  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }

  // IMPORTANT: don't set Content-Type manually for multipart; axios will set boundary
  const resp = await axiosClient.post("/courses/upload", formData);
  return resp?.data ?? resp;
}









