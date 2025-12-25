import axiosClient from "./AxiosClient";

export async function getJob(jobId) {
  if (!jobId) {
    throw new Error("getJob: missing jobId");
  }
  const resp = await axiosClient.get(`/jobs/${jobId}`);
  const data = resp?.data ?? resp;
  return data?.job ?? null;
}

export async function cancelJob(jobId) {
  if (!jobId) throw new Error("cancelJob: missing jobId");
  const resp = await axiosClient.post(`/jobs/${jobId}/cancel`);
  const data = resp?.data ?? resp;
  return data?.job ?? null;
}

export async function restartJob(jobId) {
  if (!jobId) throw new Error("restartJob: missing jobId");
  const resp = await axiosClient.post(`/jobs/${jobId}/restart`);
  const data = resp?.data ?? resp;
  return data?.job ?? null;
}
