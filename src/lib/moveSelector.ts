/**
 * The deterministic heart of the conversation engine.
 * Tako does not decide the flow — this code does. Every message Tako sends
 * is exactly one of ten moves, selected here from intent + verdict + state.
 */

export type Move =
  | "ASK"
  | "PUSH_MARKS"
  | "REWRITE"
  | "PROBE"
  | "CORRECT"
  | "ADVANCE"
  | "REVEAL_PARK"
  | "CLARIFY"
  | "NUDGE"
  | "REJECT_COPY";

export type MoveIntent =
  | "explanation"
  | "question"
  | "meta"
  | "disengaged"
  | "copied"
  | "off_topic";

export type Pace = "ok" | "behind";

export type MisconceptionHit = {
  studentClaim: string;
  correctFact: string;
  why: string;
} | null;

export type MoveBrief = {
  move: Move;
  concept: string;
  questionStem: string;
  marksAwarded: number;
  marksAvailable: number;
  attemptsLeft: number;
  diagnosis: string;
  hintCategory: string | null;
  blueprint: string | null;
  revealPoints: string[] | null; // populated ONLY on REVEAL_PARK
  misconception: MisconceptionHit;
  theirQuestion: string | null; // for CLARIFY
  nextQuestionStem: string | null;
  pace: Pace;
};

export function computePace(
  startedAtIso: string,
  conceptIndex: number,
  totalConcepts: number,
  durationSec: number
): Pace {
  const elapsed = (Date.now() - new Date(startedAtIso).getTime()) / 1000;
  const expected = conceptIndex * (durationSec / Math.max(1, totalConcepts));
  return elapsed > expected + 45 ? "behind" : "ok";
}

export interface SelectInput {
  intent: MoveIntent;
  full: boolean;
  misconception: boolean;
  ratio: number; // marksAwarded / marksAvailable
  commandWordMet: boolean;
  attempts: number; // attempts already consumed (including this one)
  budget: number; // 2 normally, 1 when behind pace
}

/** Priority order IS the pedagogy: wrong → incomplete → craft → coverage. */
export function selectMove(i: SelectInput): Move {
  if (i.intent === "copied") return "REJECT_COPY";
  if (i.intent === "question") return "CLARIFY";
  if (i.intent === "disengaged" || i.intent === "off_topic" || i.intent === "meta")
    return "NUDGE";
  if (i.full) return "ADVANCE";
  if (i.attempts >= i.budget) return "REVEAL_PARK";
  if (i.misconception) return "CORRECT";
  if (i.ratio <= 0.25) return "PROBE";
  if (!i.commandWordMet) return "REWRITE";
  return "PUSH_MARKS";
}

/** Category-level hint — never contains the withheld mark scheme text. */
export function categorizeMissed(content: string, keywords: string[]): string {
  const c = (content + " " + keywords.join(" ")).toLowerCase();
  if (/(over time|generations|per second|per hour|timescale|eventually|throughout)/.test(c))
    return "timescale";
  if (/(inherit|pass on|passed on|genes|genetic|heritab|offspring)/.test(c))
    return "inheritance";
  if (/(similar|both|difference|whereas|unlike|compared)/.test(c)) return "comparison";
  if (/(advantage|disadvantage|for and against|however|conclusion|weigh)/.test(c))
    return "balanced-judgement";
  if (/(equation|formula|calculate|number|ratio|%)/.test(c)) return "quantitative";
  if (/(because|therefore|causes|leads to|so that|results in|mechanism)/.test(c) ||
      /explain/.test(c))
    return "causal-link";
  return "key-detail";
}

export function hintFor(category: string): string {
  switch (category) {
    case "causal-link":
      return "the why — connect it with because / therefore";
    case "timescale":
      return "a timescale (over time / per second / across generations)";
    case "inheritance":
      return "whether it is passed on to offspring";
    case "comparison":
      return "both a similarity and a difference";
    case "balanced-judgement":
      return "both sides, then a conclusion";
    case "quantitative":
      return "the number / equation step";
    default:
      return "one key detail you left out";
  }
}

export function blueprintFor(commandWord: string): string {
  switch (commandWord) {
    case "explain":
      return "[what varies] BECAUSE [mechanism], THEREFORE [outcome].";
    case "describe":
      return "Stage 1: … Stage 2: … Stage 3: … (what happens, in order).";
    case "compare":
      return "Both …; however …, whereas …";
    case "evaluate":
      return "In favour: …; against: …; overall: …";
    case "discuss":
      return "On one hand …; on the other …; so …";
    default:
      return "It is … (one tight sentence).";
  }
}

export function diagnosisFor(move: Move, brief: Partial<MoveBrief>): string {
  switch (move) {
    case "REWRITE":
      return "Command word mismatch: the answer described, but the question asked for an explanation.";
    case "PROBE":
      return "Understanding is partial — a causal link is missing.";
    case "CORRECT":
      return "The answer contradicts the notes.";
    case "PUSH_MARKS":
      return "Understanding and structure are fine; a mark scheme category is missing.";
    case "REVEAL_PARK":
      return "Attempts exhausted — reveal missed points and move on.";
    case "REJECT_COPY":
      return "Verbatim copy from the notes detected.";
    case "CLARIFY":
      return "The student asked a question instead of answering.";
    case "NUDGE":
      return "No genuine attempt — shrink the question.";
    case "ADVANCE":
      return "Full marks — advance.";
    default:
      return "New question.";
  }
}

/** Offline fallback line per move — used when no AI key or the LLM fails. */
export function offlineLineFor(b: MoveBrief): string {
  const m = `${b.marksAwarded} of ${b.marksAvailable}`;
  switch (b.move) {
    case "ASK":
      return `Quick one. ${b.questionStem} ${markLabel(b.marksAvailable)}`;
    case "PUSH_MARKS":
      return `${m}. Missing ${b.hintCategory ? hintFor(b.hintCategory) : "one key detail"}. Add it.`;
    case "REWRITE":
      return `${m}. You described; this needs an explanation. ${b.blueprint ?? blueprintFor("explain")} Try again.`;
    case "PROBE":
      return `${m}. Why does that happen?`;
    case "CORRECT":
      return b.misconception
        ? `Not quite. Your notes say "${b.misconception.correctFact}" — you said "${b.misconception.studentClaim}". Which is it?`
        : `Not quite. That conflicts with your notes. Which part is wrong?`;
    case "ADVANCE":
      return b.nextQuestionStem
        ? `Nice. Next one. ${b.nextQuestionStem} ${markLabelFromStem(b.nextQuestionStem)}`
        : `${m}. Solid.`;
    case "REVEAL_PARK":
      return `Parking this at ${m}. Missed: ${(b.revealPoints ?? []).join("; ") || "see breakdown"}.${b.nextQuestionStem ? ` Next one. ${b.nextQuestionStem}` : ""}`;
    case "CLARIFY":
      return `Compare means similarities and differences. Same question.`;
    case "NUDGE":
      return `One idea: what starts it?`;
    case "REJECT_COPY":
      return `That's your notes, not you. Same question, your own words.`;
    default:
      return b.questionStem;
  }
}

function markLabel(n: number) {
  return `🎯 ${n} mark${n > 1 ? "s" : ""}`;
}

function markLabelFromStem(stem: string) {
  const m = stem.match(/\[(\d+)\s*marks?\]/i);
  if (!m) return "";
  const n = Number(m[1]);
  return markLabel(n);
}
