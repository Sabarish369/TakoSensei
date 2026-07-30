import { evaluate, evaluateLLM, type ReportData } from "@/lib/evaluator";
import { type Msg } from "@/lib/tako";
import { generateReportInsights, type PairedTurn } from "@/lib/reportInsights";

export const dynamic = "force-dynamic";

/** Stateless report generator — transcript in, full report out. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const topic = String(body?.topic ?? "Study Topic");
    const notes: string | null = body?.notes ?? null;
    const rawMessages: { role: "user" | "tako"; content: string; meta?: any }[] =
      Array.isArray(body?.messages) ? body.messages : [];
    const rawConcepts: any[] = Array.isArray(body?.concepts) ? body.concepts : [];

    const hist: Msg[] = rawMessages.map((m) => ({
      role: m.role === "tako" ? "tako" : "user",
      content: m.content,
    }));

    const conceptsWithMeta = rawConcepts.map((c: any) => ({
      name: String(c.name || c.label || ""),
      weight: typeof c.weight === "number" ? c.weight : 0.2,
      status: c.status === "mastered" ? "mastered" : "locked",
    }));

    // Pair each student turn with the auditor verdict stored on the reply.
    const pairedTurns: PairedTurn[] = [];
    for (let i = 0; i < rawMessages.length; i++) {
      const m = rawMessages[i];
      if (m.role !== "user") continue;
      const next = rawMessages[i + 1];
      const g = next && next.role === "tako" ? (next.meta as any)?.grade : null;
      const rawJudgments = Array.isArray(g?.judgments) ? g.judgments : [];
      pairedTurns.push({
        userText: m.content,
        audits: rawJudgments.map((j: any) => ({
          concept: typeof j?.concept === "string" ? j.concept : null,
          masteryLevel: typeof j?.masteryLevel === "number" ? j.masteryLevel : 0,
          awarded: j?.award === true,
          reason: typeof j?.reason === "string" ? j.reason : null,
          claimStatus: typeof j?.claimStatus === "string" ? j.claimStatus : undefined,
          contradictionFound: j?.contradictionFound === true,
          studentClaim: typeof j?.studentClaim === "string" ? j.studentClaim : null,
          notesEvidence: typeof j?.notesEvidence === "string" ? j.notesEvidence : null,
          conflictExplanation:
            typeof j?.conflictExplanation === "string" ? j.conflictExplanation : null,
          missingPieces: Array.isArray(j?.missingPieces)
            ? j.missingPieces.filter((p: unknown) => typeof p === "string")
            : [],
        })),
      });
    }

    const [llm, insights] = await Promise.all([
      evaluateLLM(topic, hist, notes ?? undefined),
      generateReportInsights({
        topic,
        notes,
        concepts: conceptsWithMeta,
        pairedTurns,
      }),
    ]);
    const local = evaluate(topic, hist);
    const data: ReportData = llm ?? local;

    return Response.json({
      report: {
        score: data.score,
        readiness: data.readiness,
        breakdown: data.breakdown,
        strengths: data.strengths,
        misunderstandings: data.misunderstandings,
        conceptStatuses: data.conceptStatuses,
        bestExplanation: data.bestExplanation,
        takoSummary: data.takoSummary,
        nextSteps: data.nextSteps,
        insights: insights ?? null,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    return Response.json(
      { error: "Failed to evaluate", detail: String(err) },
      { status: 500 }
    );
  }
}
