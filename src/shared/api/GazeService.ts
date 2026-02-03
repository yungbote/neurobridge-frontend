import axiosClient from "./AxiosClient";

export type GazeHit = {
  block_id: string;
  line_id?: string;
  x: number;
  y: number;
  confidence: number;
  ts: string;
  dt_ms?: number;
  read_credit?: number;
  source?: string;
  screen_w?: number;
  screen_h?: number;
  line_index?: number;
  extra?: unknown;
};

export type GazeIngestRequest = {
  path_id?: string;
  node_id?: string;
  hits: GazeHit[];
};

export async function ingestGaze(req: GazeIngestRequest) {
  if (!req || !Array.isArray(req.hits) || req.hits.length === 0) return { ok: true, ingested: 0 };
  const res = await axiosClient.post("/gaze/ingest", req);
  return res.data;
}
