import axiosClient from "./AxiosClient";

export async function getJob(jobId) {
  if (!jobId) {
    throw new Error("getJob: missing jobId");
  }
  const resp = await axiosClient.get(`/jobs/${jobId}`);
  const data = resp?.data ?? resp;
  return data?.job ?? null;
}

