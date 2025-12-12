import axiosClient from "./AxiosClient";

export async function uploadMaterialSet(files) {
  if (!files || files.length === 0) {
    throw new Error("uploadMaterialSet: no files provided");
  }
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }

  // IMPORTANT: don't set Content-Type manually for multipart; axios will set boundary
  const resp = await axiosClient.post("/material-sets/upload", formData);
  return resp.data;
}










