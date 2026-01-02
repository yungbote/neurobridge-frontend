import axiosClient from "./AxiosClient";
import type { BackendJob } from "@/shared/types/backend";

export async function getJob(jobId: string): Promise<BackendJob | null> {
  if (!jobId) {
    throw new Error("getJob: missing jobId");
  }
  const resp = await axiosClient.get<{ job?: BackendJob | null }>(`/jobs/${jobId}`);
  const data = resp?.data ?? resp;
  return data?.job ?? null;
}

export async function cancelJob(jobId: string): Promise<BackendJob | null> {
  if (!jobId) throw new Error("cancelJob: missing jobId");
  const resp = await axiosClient.post<{ job?: BackendJob | null }>(`/jobs/${jobId}/cancel`);
  const data = resp?.data ?? resp;
  return data?.job ?? null;
}

export async function restartJob(jobId: string): Promise<BackendJob | null> {
  if (!jobId) throw new Error("restartJob: missing jobId");
  const resp = await axiosClient.post<{ job?: BackendJob | null }>(`/jobs/${jobId}/restart`);
  const data = resp?.data ?? resp;
  return data?.job ?? null;
}
