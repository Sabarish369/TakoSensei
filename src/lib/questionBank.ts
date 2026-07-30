/**
 * Fixed Question Bank types + a topic-agnostic bank builder.
 *
 * Every exam has EXACTLY 6 questions (2 easy · 2 medium · 1 medium/compare · 1 hard),
 * totalling ~20 marks. When notes are uploaded, the bank is generated from the
 * student's own notes (so the mark scheme is grounded), but the STRUCTURE is
 * always fixed and predictable.
 */

export type QuestionDifficulty = "easy" | "medium" | "hard";

export type CommandWord =
  | "define"
  | "state"
  | "describe"
  | "explain"
  | "compare"
  | "evaluate"
  | "discuss";

export type MarkSchemePoint = {
  id: string;
  content: string; // what the examiner needs to see
  keywords: string[]; // detection hints (not word-for-word required)
  maxMarks: number; // usually 1
  isEssential: boolean;
};

export type ExamQuestion = {
  id: string;
  order: number; // 1-6
  difficulty: QuestionDifficulty;
  commandWord: CommandWord;
  questionText: string;
  totalMarks: number;
  markScheme: MarkSchemePoint[];
  // A perfect, full-mark prose answer derived from the notes, shown in the
  // reveal phase so the student sees exactly what the examiner expects.
  modelAnswer?: string;
  examinerNotes?: string;
};

export type QuestionBank = {
  topicName: string;
  totalMarks: number;
  passThreshold: number; // marks needed to "pass"
  questions: ExamQuestion[]; // always length 6
};

export const EXAM_QUESTION_COUNT = 6;
// Bump this whenever the fixed paper blueprint changes so old local banks
// are regenerated instead of silently using stale question structures.
export const EXAM_BANK_VERSION = 3;

/** Difficulty → color/label helpers for the UI. */
export function difficultyMeta(d: QuestionDifficulty) {
  switch (d) {
    case "easy":
      return { label: "Easy", dot: "bg-emerald-400", text: "text-emerald-600" };
    case "medium":
      return { label: "Medium", dot: "bg-amber-400", text: "text-amber-600" };
    case "hard":
      return { label: "Hard", dot: "bg-rose-400", text: "text-rose-600" };
  }
}

/** Letter grade from a percentage — a clear, consistent scale. */
export function gradeFromPercent(pct: number): "A" | "B" | "C" | "D" {
  if (pct >= 70) return "A";
  if (pct >= 60) return "B";
  if (pct >= 50) return "C";
  return "D";
}
