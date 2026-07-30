import {
  EXAM_BANK_VERSION,
  generateQuestionBank,
} from "@/lib/agents/questionBankGenerator";

export const dynamic = "force-dynamic";

/**
 * Stateless Exam Mode builder.
 * Every call returns the same invariant paper shape:
 * Q1/Q2/Q3 = 2 marks, Q4/Q5 = 4 marks, Q6 = 6 marks → 20 total.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const topic = String(body?.topic ?? "Study Topic");
    const notes: string | null = body?.notes ?? null;
    const concepts: any[] = Array.isArray(body?.concepts) ? body.concepts : [];

    // The generator itself falls back deterministically when notes are thin
    // or an AI request fails, so Exam Mode never dead-ends.
    const generated = await generateQuestionBank(topic, notes, concepts);

    return Response.json({
      bank: {
        version: EXAM_BANK_VERSION,
        topicName: generated.topicName,
        totalMarks: 20,
        passThreshold: 12,
        questions: generated.questions,
        questionStates: {},
        currentIndex: 0,
        totalEarned: 0,
        adjustments: {},
        completed: "no",
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    return Response.json(
      { error: "Failed to build exam", detail: String(err) },
      { status: 500 }
    );
  }
}
