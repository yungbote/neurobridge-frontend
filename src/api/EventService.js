import axiosClient from "./AxiosClient";

export async function ingestEvents(events) {
  const arr = Array.isArray(events) ? events.filter(Boolean) : [];
  if (arr.length === 0) return { ok: true, ingested: 0 };
  const resp = await axiosClient.post("/events", { events: arr });
  return resp?.data ?? resp;
}

