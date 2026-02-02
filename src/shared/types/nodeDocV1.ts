export type CitationLocV1 = {
  page: number;
  start: number;
  end: number;
};

export type CitationRefV1 = {
  chunk_id: string;
  quote: string;
  loc: CitationLocV1;
};

export type MediaRefV1 = {
  url: string;
  material_file_id: string;
  storage_key: string;
  mime_type: string;
  file_name: string;
  source: "upload" | "derived" | "external" | "";
};

export type NodeDocBlockHeadingV1 = {
  type: "heading";
  level: 2 | 3 | 4;
  text: string;
};

export type NodeDocBlockParagraphV1 = {
  type: "paragraph";
  md: string;
  citations: CitationRefV1[];
};

export type NodeDocBlockCalloutV1 = {
  type: "callout";
  variant: "info" | "tip" | "warning";
  title: string;
  md: string;
  citations: CitationRefV1[];
};

export type NodeDocBlockCodeV1 = {
  type: "code";
  language: string;
  filename: string;
  code: string;
};

export type NodeDocBlockFigureV1 = {
  type: "figure";
  asset: MediaRefV1;
  caption: string;
  citations: CitationRefV1[];
};

export type NodeDocBlockVideoV1 = {
  type: "video";
  url: string;
  start_sec: number;
  caption: string;
};

export type NodeDocBlockDiagramV1 = {
  type: "diagram";
  kind: "svg" | "mermaid";
  source: string;
  caption: string;
};

export type NodeDocBlockTableV1 = {
  type: "table";
  caption: string;
  columns: string[];
  rows: string[][];
};

export type NodeDocBlockEquationV1 = {
  type: "equation";
  latex: string;
  display: boolean;
  caption: string;
  citations: CitationRefV1[];
};

export type NodeDocBlockQuickCheckV1 = {
  type: "quick_check";
  prompt_md: string;
  answer_md: string;
  citations: CitationRefV1[];
};

export type NodeDocBlockFlashcardV1 = {
  type: "flashcard";
  front_md: string;
  back_md: string;
  concept_keys?: string[];
  citations: CitationRefV1[];
};

export type NodeDocBlockDividerV1 = {
  type: "divider";
};

export type NodeDocBlockV1 =
  | NodeDocBlockHeadingV1
  | NodeDocBlockParagraphV1
  | NodeDocBlockCalloutV1
  | NodeDocBlockCodeV1
  | NodeDocBlockFigureV1
  | NodeDocBlockVideoV1
  | NodeDocBlockDiagramV1
  | NodeDocBlockTableV1
  | NodeDocBlockEquationV1
  | NodeDocBlockQuickCheckV1
  | NodeDocBlockFlashcardV1
  | NodeDocBlockDividerV1;

export type NodeDocV1 = {
  schema_version: 1;
  title: string;
  summary: string;
  concept_keys: string[];
  estimated_minutes: number;
  blocks: NodeDocBlockV1[];
};
