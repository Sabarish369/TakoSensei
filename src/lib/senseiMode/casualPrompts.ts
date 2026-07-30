/**
 * Generates the friendly setup line that precedes each question in Sensei Mode,
 * based on the student's current phase/performance.
 */
import type { ExamQuestion } from "@/lib/questionBank";

export type Performance = "strong" | "average" | "struggling";
export type Phase = "foundation" | "application" | "synthesis" | "mastery";

const PHASE_INTROS: Record<Phase, string[]> = {
  foundation: [
    "Alright, let's start with the basics",
    "Quick foundation check",
    "Okay, fundamentals first",
    "Let's get the core concepts down",
  ],
  application: [
    "Now let's dig deeper",
    "Alright, time to apply this",
    "Okay, next level",
    "Let's see how this works in practice",
  ],
  synthesis: [
    "This one's a bit trickier",
    "Now we're connecting things",
    "Alright, let's think bigger picture",
    "Time to put it all together",
  ],
  mastery: [
    "Final stretch, this is the big one",
    "Alright, show me what you've got",
    "Last question, make it count",
    "Okay, ultimate challenge",
  ],
};

const ENCOURAGEMENT: Record<Performance, string[]> = {
  strong: [
    "You're crushing this",
    "You're on fire",
    "Nailing it so far",
    "You've got this",
  ],
  average: [
    "You're doing well",
    "Good progress",
    "Solid work",
    "Keep it up",
  ],
  struggling: [
    "Let's take this step by step",
    "No rush, think it through",
    "You've got this, take your time",
    "Let's work through this one",
  ],
};

const TRANSITIONS = [
  "Next up:",
  "Alright:",
  "Quick one:",
  "Here's the thing:",
  "So:",
  "Right:",
  "Okay:",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function getPhase(questionOrder: number, totalQuestions: number): Phase {
  const ratio = questionOrder / Math.max(1, totalQuestions);
  if (ratio <= 0.5) return "foundation";
  if (ratio <= 0.66) return "application";
  if (ratio <= 0.83) return "synthesis";
  return "mastery";
}

export function generateCasualPrompt(
  question: ExamQuestion,
  phase: Phase,
  performance: Performance,
  isRelatedToPrevious: boolean
): string {
  const parts: string[] = [];

  if (question.order === 1) {
    parts.push(pickRandom(PHASE_INTROS[phase]));
  } else if (phase === "mastery") {
    parts.push(pickRandom(PHASE_INTROS[phase]));
  } else if (isRelatedToPrevious) {
    parts.push("Building on that");
  } else if (question.order % 7 === 0) {
    parts.push(pickRandom(ENCOURAGEMENT[performance]));
  } else {
    parts.push(pickRandom(TRANSITIONS));
  }

  return parts.join(" • ");
}

/** Detect if two questions share enough overlap to warrant a "Building on that" tag. */
export function areRelated(
  current: ExamQuestion,
  previous: ExamQuestion
): boolean {
  const ck = current.markScheme.flatMap((m) => m.keywords.map((x) => x.toLowerCase()));
  const pk = previous.markScheme.flatMap((m) => m.keywords.map((x) => x.toLowerCase()));
  const set: Set<string> = new Set(pk);
  const overlap = ck.filter((k) => set.has(k));
  return overlap.length >= 2;
}
