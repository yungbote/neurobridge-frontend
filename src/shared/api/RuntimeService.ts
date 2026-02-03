import axiosClient from "./AxiosClient";

export async function getPathRuntime(pathId: string) {
  const id = String(pathId || "").trim();
  if (!id) throw new Error("missing_path_id");
  const res = await axiosClient.get(`/paths/${id}/runtime`);
  return res.data;
}
