/**
 * Strict mark-scheme grader. Compares a student's answer to a fixed mark
 * scheme point-by-point and — crucially — JUSTIFIES every decision, including
 * an explicit reason WHY a point was NOT awarded.
 *
 * Deterministic (temperature 0). The LLM only reports point-by-point matches;
 * the total marks and pass/fail are recomputed in code so the score can never
 * drift from the awarded points.
 */
import { chatCompletionJSON, hasAIProvider } from "../ai";
import type { ExamQuestion } from "../questionBank";

export type MarkPointResult = {
  pointId: string;
  content: string;
  maxMarks: number;
  awarded: number; // 0..maxMarks
  evidence: string | null; // quote from the student's answer if awarded
  justification: string; // WHY awarded, and WHY NOT if not awarded
};

export type MarkSchemeResult = {
  marksAwarded: number;
  maxMarks: number;
  percentage: number;
  breakdown: MarkPointResult[];
  commandWordMet: boolean;
  commandWordFeedback: string;
  overallFeedback: string;
  // A hidden verdict for the move engine: an explicit student claim that
  // directly contradicts the mark scheme / notes. null when none.
  misconception: {
    studentClaim: string;
    correctFact: string;
    why: string;
  } | null;
  status: "graded" | "no_provider" | "error";
};

const GRADER_PROMPT = `You are a STRICT EXAM GRADER working from a fixed mark scheme. Grade point-by-point.

RULES:
1. SEMANTIC MATCHING: award a point if the student expresses the IDEA, even with different words/synonyms. Keyword lists are hints, not requirements.
2. For EACH mark-scheme point, decide "awarded" (0 or its maxMarks) and give a "justification".
3. The justification MUST explain the decision:
   - If awarded: quote the exact phrase from the student that earns it.
   - If NOT awarded: state precisely what was missing or wrong, and what they needed to say. THIS IS REQUIRED for every un-awarded point.
4. COMMAND-WORD COMPLIANCE:
   - define → must state what it IS.
   - state → identify/list.
   - describe → what happens (stages/features).
   - explain → WHY (causal links: because/therefore).
   - compare → similarities AND differences.
   - evaluate/discuss → balanced judgement (for + against) + conclusion.
   Report commandWordMet + a one-line reason.
5. Never award marks for content not in the mark scheme. If unsure, do NOT award (strict is fair).
6. Never invent evidence. evidence must be a real substring/paraphrase of the student's answer or null.

7. MISCONCEPTION CHECK: if the student makes an explicit claim that directly contradicts the mark scheme (e.g. reverses a relationship), report it. Only when there is a genuine contradiction — a missing point is NOT a misconception.

Return ONLY valid JSON:
{
  "breakdown": [
    {"pointId": "q4_m1", "awarded": 1, "evidence": "student's phrase or null", "justification": "why / why not"}
  ],
  "commandWordMet": true,
  "commandWordFeedback": "one line",
  "overallFeedback": "one line summary of what's missing",
  "misconception": {"studentClaim": "their exact claim", "correctFact": "what the mark scheme says", "why": "one line"} | null
}`;

export async function gradeAgainstMarkScheme(
  question: ExamQuestion,
  studentAnswer: string
): Promise<MarkSchemeResult> {
  const maxMarks = question.markScheme.reduce((s, p) => s + p.maxMarks, 0) || question.totalMarks;

  const emptyBreakdown = (): MarkPointResult[] =>
    question.markScheme.map((p) => ({
      pointId: p.id,
      content: p.content,
      maxMarks: p.maxMarks,
      awarded: 0,
      evidence: null,
      justification: "Not graded (no AI grader available).",
    }));

  if (!hasAIProvider()) {
    return {
      marksAwarded: 0,
      maxMarks,
      percentage: 0,
      breakdown: emptyBreakdown(),
      commandWordMet: false,
      commandWordFeedback: "Grading requires an AI provider.",
      overallFeedback: "No AI grader configured.",
      misconception: null,
      status: "no_provider",
    };
  }

  const parsed = await chatCompletionJSON<{
    breakdown?: {
      pointId?: string;
      awarded?: number;
      evidence?: string | null;
      justification?: string;
    }[];
    commandWordMet?: boolean;
    commandWordFeedback?: string;
    overallFeedback?: string;
    misconception?: {
      studentClaim?: string;
      correctFact?: string;
      why?: string;
    } | null;
  }>({
    messages: [
      { role: "system", content: GRADER_PROMPT },
      {
        role: "user",
        content: `QUESTION: ${question.questionText}
COMMAND WORD: ${question.commandWord}
TOTAL MARKS: ${question.totalMarks}

MARK SCHEME:
${JSON.stringify(
  question.markScheme.map((p) => ({
    pointId: p.id,
    content: p.content,
    keywords: p.keywords,
    maxMarks: p.maxMarks,
    isEssential: p.isEssential,
  })),
  null,
  2
)}

STUDENT ANSWER:
"${studentAnswer.slice(0, 2000)}"

Grade point-by-point and justify every decision.`,
      },
    ],
    temperature: 0,
    maxTokens: 1400,
  });

  if (!parsed || !Array.isArray(parsed.breakdown)) {
    return {
      marksAwarded: 0,
      maxMarks,
      percentage: 0,
      breakdown: emptyBreakdown(),
      commandWordMet: false,
      commandWordFeedback: "The grader could not evaluate this answer.",
      overallFeedback: "Grading failed — please try rephrasing your answer.",
      misconception: null,
      status: "error",
    };
  }

  // Map the model's decisions back onto our authoritative mark scheme.
  const byId = new Map(parsed.breakdown.map((b) => [b.pointId, b]));
  const breakdown: MarkPointResult[] = question.markScheme.map((p) => {
    const got = byId.get(p.id);
    const awardedRaw = typeof got?.awarded === "number" ? got.awarded : 0;
    const awarded = Math.max(0, Math.min(p.maxMarks, Math.round(awardedRaw)));
    return {
      pointId: p.id,
      content: p.content,
      maxMarks: p.maxMarks,
      awarded,
      evidence:
        awarded > 0 && typeof got?.evidence === "string" && got.evidence.trim()
          ? got.evidence.trim().slice(0, 200)
          : null,
      justification:
        typeof got?.justification === "string" && got.justification.trim()
          ? got.justification.trim().slice(0, 300)
          : awarded > 0
          ? "Point demonstrated in the answer."
          : "This point was not found in your answer.",
    };
  });

  // Command-word enforcement happens in code, not just prompt feedback.
  // An EXPLAIN answered as a description cannot earn causal marks; a COMPARE
  // without the required structure cannot earn the full comparison score.
  const commandWordMet = parsed.commandWordMet === true;
  const command = question.commandWord;
  const cap = !commandWordMet
    ? command === "explain"
      ? Math.floor(maxMarks * 0.5)
      : command === "compare"
      ? Math.floor(maxMarks * 0.75)
      : maxMarks
    : maxMarks;

  let marksAwarded = breakdown.reduce((s, b) => s + b.awarded, 0);
  if (marksAwarded > cap) {
    // Remove marks from the last awarded points first, leaving a clear
    // justifying note in the same point-by-point breakdown the student sees.
    let toRemove = marksAwarded - cap;
    for (let i = breakdown.length - 1; i >= 0 && toRemove > 0; i--) {
      const point = breakdown[i];
      if (point.awarded <= 0) continue;
      const reduction = Math.min(point.awarded, toRemove);
      point.awarded -= reduction;
      toRemove -= reduction;
      point.evidence = null;
      point.justification = `Content was present, but this mark is withheld because the ${command.toUpperCase()} command word was not met. ${parsed.commandWordFeedback ?? "Use the required answer structure."}`;
    }
    marksAwarded = cap;
  }
  const percentage = maxMarks > 0 ? Math.round((marksAwarded / maxMarks) * 100) : 0;

  // Misconception is only trusted when all three fields are present strings.
  const rawM = parsed.misconception;
  const misconception =
    rawM &&
    typeof rawM.studentClaim === "string" &&
    typeof rawM.correctFact === "string" &&
    rawM.studentClaim.trim() &&
    rawM.correctFact.trim()
      ? {
          studentClaim: rawM.studentClaim.trim().slice(0, 240),
          correctFact: rawM.correctFact.trim().slice(0, 240),
          why:
            typeof rawM.why === "string" && rawM.why.trim()
              ? rawM.why.trim().slice(0, 240)
              : "",
        }
      : null;

  return {
    marksAwarded,
    maxMarks,
    percentage,
    breakdown,
    commandWordMet: parsed.commandWordMet === true,
    commandWordFeedback:
      typeof parsed.commandWordFeedback === "string"
        ? parsed.commandWordFeedback.slice(0, 240)
        : "",
    overallFeedback:
      typeof parsed.overallFeedback === "string"
        ? parsed.overallFeedback.slice(0, 300)
        : "",
    misconception,
    status: "graded",
  };
}
