/**
 * Fixed 20-mark Exam Paper generator.
 *
 * This is deliberately NOT an open-ended question generator. Every paper has
 * exactly six slots and the slots are enforced in code:
 *   Q1 define (2) · Q2 state (2) · Q3 describe (2) ·
 *   Q4 explain (4) · Q5 compare/explain (4) · Q6 evaluate/discuss (6)
 *
 * The LLM supplies notes-grounded content inside this fixed exam blueprint.
 */
import { chatCompletionJSON, hasAIProvider } from "../ai";
import {
  EXAM_BANK_VERSION,
  type CommandWord,
  type ExamQuestion,
  type MarkSchemePoint,
  type QuestionBank,
  type QuestionDifficulty,
} from "../questionBank";

export { EXAM_BANK_VERSION };

type Slot = {
  order: number;
  difficulty: QuestionDifficulty;
  commandWord: CommandWord;
  marks: number;
  role: string;
};

export const FIXED_EXAM_SLOTS: Slot[] = [
  { order: 1, difficulty: "easy", commandWord: "define", marks: 2, role: "core definition" },
  { order: 2, difficulty: "easy", commandWord: "state", marks: 2, role: "raw materials, components, or key facts" },
  { order: 3, difficulty: "easy", commandWord: "describe", marks: 2, role: "location, feature, or basic stage" },
  { order: 4, difficulty: "medium", commandWord: "explain", marks: 4, role: "cause-and-effect mechanism" },
  { order: 5, difficulty: "medium", commandWord: "compare", marks: 4, role: "process comparison or applied mechanism" },
  { order: 6, difficulty: "hard", commandWord: "evaluate", marks: 6, role: "whole-notes synthesis, judgement, or trade-off" },
];

const GEN_PROMPT = `You are a Cambridge/IB EXAM PAPER CREATOR.
Build ONE fixed 20-mark paper from the student's uploaded notes.

SYLLABUS COVERAGE RULE:
Divide the notes into SIX DISTINCT conceptual zones. Across all six questions, cover the full notes breadth. Do not ask the same idea twice.

FIXED PAPER BLUEPRINT — EXACTLY THESE SIX QUESTIONS:
Q1: Easy · DEFINE · 2 marks · core definition.
Q2: Easy · STATE · 2 marks · raw materials/components/key facts.
Q3: Easy · DESCRIBE · 2 marks · location/basic stage/feature.
Q4: Medium · EXPLAIN · 4 marks · causal mechanism (must include a because/therefore chain).
Q5: Medium · COMPARE · 4 marks · similarities AND differences, or a second applied mechanism if a true comparison is not supported by notes.
Q6: Hard · EVALUATE or DISCUSS · 6 marks · full synthesis across multiple zones of the notes, balanced judgement and conclusion.
TOTAL = EXACTLY 20 MARKS.

FOR EVERY QUESTION GENERATE:
1. questionText: an exact exam question using the required command term. End it with [N marks].
2. markScheme: EXACTLY N individual awardable points, each worth one mark.
   - Every point must be directly grounded in the notes.
   - Each point has content, keywords, isEssential.
   - Do not add generic textbook knowledge absent from notes.
3. modelAnswer: a full-mark prose answer that hits every point.
   - DEFINE/STATE: concise and exact.
   - EXPLAIN: explicit causal links (because / therefore).
   - COMPARE: explicit similarities and differences.
   - EVALUATE/DISCUSS: balanced evidence plus conclusion.
4. examinerNotes: the most likely mark-losing trap.

Return ONLY JSON:
{
  "questions": [
    {
      "questionText": "Define ... [2 marks]",
      "markScheme": [
        { "content": "awardable point", "keywords": ["term"], "isEssential": true }
      ],
      "modelAnswer": "perfect prose answer",
      "examinerNotes": "common mistake"
    }
  ]
}
Exactly six objects in Q1-Q6 order. Never change the mark values or command words from the blueprint.`;

function cleanQuestionText(text: unknown, slot: Slot, topic: string) {
  const raw = String(text ?? "").trim().replace(/\s*\[\s*\d+\s*marks?\s*\]\s*$/i, "");
  const fallback = `${slot.commandWord.charAt(0).toUpperCase() + slot.commandWord.slice(1)} ${topic}.`;
  return `${raw || fallback} [${slot.marks} marks]`;
}

function normalizedPoint(
  raw: any,
  order: number,
  index: number,
  fallback: string
): MarkSchemePoint {
  const content = String(raw?.content ?? raw?.point ?? fallback).trim().slice(0, 260);
  return {
    id: `q${order}_m${index + 1}`,
    content,
    keywords: Array.isArray(raw?.keywords)
      ? raw.keywords.filter((x: unknown) => typeof x === "string").slice(0, 8)
      : content
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((x) => x.length > 3)
          .slice(0, 5),
    maxMarks: 1,
    isEssential: raw?.isEssential !== false,
  };
}

function fallbackPoint(topic: string, slot: Slot, index: number, concept?: any): string {
  const name = concept?.name || topic;
  const why = typeof concept?.why === "string" ? concept.why : "";
  const evidence = typeof concept?.notesEvidence === "string" ? concept.notesEvidence : "";
  const library = [
    `States the central idea of ${name}.`,
    why || `Identifies a second relevant feature of ${name}.`,
    evidence || `Explains how ${name} connects to the wider topic.`,
    `Makes a clear link required by the ${slot.commandWord} command word.`,
    `Applies the idea accurately to the question.`,
    `Gives a balanced conclusion grounded in the notes.`,
  ];
  return library[index] || `Adds another accurate notes-based point about ${name}.`;
}

function coerceQuestion(raw: any, slot: Slot, topic: string, concept?: any): ExamQuestion {
  const sourcePoints = Array.isArray(raw?.markScheme) ? raw.markScheme : [];
  const markScheme: MarkSchemePoint[] = [];
  // Exactly one awardable point per mark. This code, not the LLM, enforces it.
  for (let i = 0; i < slot.marks; i++) {
    markScheme.push(
      normalizedPoint(sourcePoints[i], slot.order, i, fallbackPoint(topic, slot, i, concept))
    );
  }

  const modelAnswer =
    typeof raw?.modelAnswer === "string" && raw.modelAnswer.trim().length > 12
      ? raw.modelAnswer.trim().slice(0, 1400)
      : markScheme.map((point) => point.content).join(" ");

  return {
    id: `q${slot.order}`,
    order: slot.order,
    difficulty: slot.difficulty,
    commandWord: slot.commandWord,
    questionText: cleanQuestionText(raw?.questionText, slot, topic),
    totalMarks: slot.marks,
    markScheme,
    modelAnswer,
    examinerNotes:
      typeof raw?.examinerNotes === "string"
        ? raw.examinerNotes.trim().slice(0, 300)
        : `Match the ${slot.commandWord.toUpperCase()} command word and cover each distinct point.`,
  };
}

function fallbackRaw(slot: Slot, topic: string, concept?: any) {
  const name = concept?.name || topic;
  const stems: Record<CommandWord, string> = {
    define: `Define ${name}.`,
    state: `State two key facts about ${name}.`,
    describe: `Describe a key feature, location, or stage of ${name}.`,
    explain: `Explain how ${name} works or why it produces its main effect.`,
    compare: `Compare two important aspects of ${name}.`,
    evaluate: `Evaluate why ${name} matters within ${topic}.`,
    discuss: `Discuss the importance of ${name} within ${topic}.`,
  };
  return {
    questionText: stems[slot.commandWord],
    markScheme: [],
    modelAnswer: "",
    examinerNotes: "Use the command word and make each required link explicit.",
  };
}

/** Always returns a valid EXACT 6-question, EXACT 20-mark bank. */
export function buildFallbackExamBank(topic: string, concepts: any[] = []): QuestionBank {
  const zones = concepts.length > 0 ? concepts : [{ name: topic }];
  const questions = FIXED_EXAM_SLOTS.map((slot, i) => {
    const concept = zones[i % zones.length];
    return coerceQuestion(fallbackRaw(slot, topic, concept), slot, topic, concept);
  });
  return {
    topicName: topic,
    totalMarks: 20,
    passThreshold: 12,
    questions,
  };
}

export async function generateQuestionBank(
  topic: string,
  notes: string | null,
  fallbackConcepts: any[] = []
): Promise<QuestionBank> {
  if (!hasAIProvider() || !notes || notes.trim().length < 40) {
    return buildFallbackExamBank(topic, fallbackConcepts);
  }

  const parsed = await chatCompletionJSON<{ questions?: any[] }>({
    messages: [
      { role: "system", content: GEN_PROMPT },
      {
        role: "user",
        content: `TOPIC: ${topic}\n\nUPLOADED NOTES:\n${notes.slice(0, 6000)}\n\nCreate the exact six-question, 20-mark paper.`,
      },
    ],
    temperature: 0.2,
    // Six questions + twenty mark points + six model answers needs room.
    // A short budget truncates JSON and silently triggers the fallback bank.
    maxTokens: 6500,
  });

  const rawQuestions = Array.isArray(parsed?.questions) ? parsed.questions : [];
  const questions = FIXED_EXAM_SLOTS.map((slot, i) =>
    coerceQuestion(rawQuestions[i] ?? fallbackRaw(slot, topic, fallbackConcepts[i % Math.max(1, fallbackConcepts.length)]), slot, topic, fallbackConcepts[i % Math.max(1, fallbackConcepts.length)])
  );

  // Invariant: exactly 6 questions / exactly 20 marks.
  return {
    topicName: topic,
    totalMarks: 20,
    passThreshold: 12,
    questions,
  };
}
