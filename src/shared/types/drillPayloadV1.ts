import type { CitationRefV1 } from "./nodeDocV1";

export type FlashcardV1 = {
  front_md: string;
  back_md: string;
  concept_keys?: string[];
  citations: CitationRefV1[];
};

export type QuizOptionV1 = {
  id: string;
  text: string;
};

export type QuizQuestionV1 = {
  id: string;
  prompt_md: string;
  concept_keys?: string[];
  options: QuizOptionV1[];
  answer_id: string;
  explanation_md: string;
  citations: CitationRefV1[];
};

export type DrillPayloadV1 = {
  schema_version: 1;
  kind: "flashcards" | "quiz";
  cards: FlashcardV1[];
  questions: QuizQuestionV1[];
};
