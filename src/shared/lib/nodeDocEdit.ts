export interface NodeDocEditProposal {
  path_node_id?: string;
  path_id?: string;
  doc_id?: string;
  block_id?: string;
  block_index?: number;
  block_type?: string;
  action?: string;
  citation_policy?: string;
  instruction?: string;
  before_block_text?: string;
  after_block_text?: string;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonRecord(value: unknown): JsonRecord | null {
  if (!value) return null;
  if (isRecord(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function parseNodeDocEditProposal(metadata: unknown): NodeDocEditProposal | null {
  const md = parseJsonRecord(metadata);
  if (!md) return null;
  const proposalRaw = md.proposal ?? md.edit_proposal ?? null;
  const proposal = parseJsonRecord(proposalRaw);
  if (!proposal) return null;
  return proposal as NodeDocEditProposal;
}

export function messageKindFromMetadata(metadata: unknown): string {
  const md = parseJsonRecord(metadata);
  const kind = md ? String(md.kind ?? "") : "";
  return kind.trim().toLowerCase();
}

export function normalizeProposalText(value: unknown): string {
  return String(value || "").trim();
}

export function stringFromMetadata(metadata: unknown, keys: string[]): string {
  const md = parseJsonRecord(metadata);
  if (!md) return "";
  for (const k of keys) {
    const v = md[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export function asRecord(value: unknown): JsonRecord | null {
  return parseJsonRecord(value);
}
