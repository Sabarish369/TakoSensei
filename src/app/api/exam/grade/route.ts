import { gradeAgainstMarkScheme } from "@/lib/agents/markSchemeGrader";
import { classifyIntent } from "@/lib/intent";
import {
  blueprintFor,
  categorizeMissed,
  computePace,
  diagnosisFor,
  selectMove,
  type MoveBrief,
} from "@/lib/moveSelector";
import { performMove } from "@/lib/takoVoice";
import type { ExamQuestion } from "@/lib/questionBank";

export const dynamic = "force-dynamic";

/**
 * Stateless exam grading turn. Client sends the question + its current state;
 * we grade, pick the move, voice it, and return the next question state.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const question: ExamQuestion | null = body?.question ?? null;
    const answer = String(body?.answer ?? "").trim();
    if (!question) {
      return Response.json({ error: "Question is required" }, { status: 400 });
    }
    if (!answer) {
      return Response.json({ error: "Answer is required" }, { status: 400 });
    }

    const notes: string | null = body?.notes ?? null;
    const prevAttempts = Number(body?.attempts ?? 0);
    const prevMarks = Number(body?.marksEarned ?? 0);
    const prevCopy = Number(body?.copyOffenses ?? 0);
    const index = Number(body?.index ?? 0);
    const total = Number(body?.total ?? 6);
    const startedAt = String(body?.startedAt ?? new Date().toISOString());
    const nextQuestionStem: string | null = body?.nextQuestionStem ?? null;

    // ── 1) INTENT ROUTER ──
    const questionKeywords = question.markScheme.flatMap((p) => p.keywords);
    const intent = classifyIntent(answer, { notes, keywords: questionKeywords });

    const consumesAttempt =
      intent === "explanation" || (intent === "copied" && prevCopy >= 1);

    // ── 2) EVALUATOR ──
    const result =
      intent === "explanation"
        ? await gradeAgainstMarkScheme(question, answer)
        : null;

    const attempts = prevAttempts + (consumesAttempt ? 1 : 0);
    const marksAwarded = result?.marksAwarded ?? 0;
    const marksEarned = Math.max(prevMarks, marksAwarded);

    // ── Pace-aware attempt budget ──
    const pace = computePace(startedAt, index, total, 600);
    const budget = pace === "behind" ? 1 : 2;

    // ── 3) MOVE SELECTOR ──
    const move = selectMove({
      intent,
      full: !!result && result.marksAwarded === result.maxMarks,
      misconception: !!result?.misconception,
      ratio: result ? result.marksAwarded / Math.max(1, result.maxMarks) : 0,
      commandWordMet: result?.commandWordMet ?? true,
      attempts,
      budget,
    });

    // ── 4) SANITIZED MOVE BRIEF ──
    const missedPoints = (result?.breakdown ?? []).filter((b) => b.awarded === 0);
    const firstMissed = missedPoints[0];
    const hintCategory = firstMissed
      ? categorizeMissed(
          firstMissed.content,
          question.markScheme.find((p) => p.id === firstMissed.pointId)?.keywords ?? []
        )
      : null;
    const blueprint = move === "REWRITE" ? blueprintFor(question.commandWord) : null;
    const revealPoints =
      move === "REVEAL_PARK" ? missedPoints.map((p) => p.content) : null;

    const brief: MoveBrief = {
      move,
      concept: question.questionText.slice(0, 60),
      questionStem: question.questionText,
      marksAwarded,
      marksAvailable: question.totalMarks,
      attemptsLeft: Math.max(0, budget - attempts),
      diagnosis: diagnosisFor(move, { questionStem: question.questionText }),
      hintCategory,
      blueprint,
      revealPoints,
      misconception: result?.misconception ?? null,
      theirQuestion: intent === "question" ? answer : null,
      nextQuestionStem,
      pace,
    };

    // ── 5) TAKO IS THE VOICE ONLY ──
    const takoLine = await performMove(brief);

    const passed =
      move === "ADVANCE" || marksEarned >= Math.ceil(question.totalMarks * 0.6);
    const advance = move === "ADVANCE" || move === "REVEAL_PARK" || passed;

    return Response.json({
      result,
      move,
      takoLine,
      brief: {
        marksAwarded,
        marksAvailable: question.totalMarks,
        diagnosis: brief.diagnosis,
        blueprint,
        revealPoints,
        hintCategory,
        attemptsLeft: brief.attemptsLeft,
        pace,
      },
      // Next per-question state for the client to persist.
      questionState: {
        attempts,
        marksEarned,
        maxMarks: result?.maxMarks ?? question.totalMarks,
        status: passed ? "passed" : advance ? "failed" : "not_attempted",
        copyOffenses: intent === "copied" ? prevCopy + 1 : prevCopy,
      },
      attempts,
      maxAttempts: budget,
      marksEarned,
      passed,
      resolved: advance,
      advanced: advance,
      strike: move === "NUDGE",
    });
  } catch (err) {
    return Response.json(
      { error: "Failed to grade answer", detail: String(err) },
      { status: 500 }
    );
  }
}
