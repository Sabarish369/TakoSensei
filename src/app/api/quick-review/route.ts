import { generateQuickReview } from "@/lib/agents/helpAgent";
import { extractRelevantNotes } from "@/lib/notesExtractor";

export const dynamic = "force-dynamic";

/** Stateless Quick Review — notes in, review text out. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const notes: string | null = body?.notes ?? null;
    const topic = String(body?.topic ?? "this topic");
    const concepts: { name: string; status?: string }[] = Array.isArray(
      body?.concepts
    )
      ? body.concepts
      : [];

    const active = concepts.filter((c) => c.status !== "mastered");
    const focusConceptName = active[0]?.name || concepts[0]?.name || topic;
    const notesExcerpt = extractRelevantNotes(notes, focusConceptName);
    const review = await generateQuickReview(focusConceptName, notesExcerpt);

    return Response.json({
      quickReview: review,
      showMiniLesson: true,
      miniLessonContent: review,
    });
  } catch {
    return Response.json({ error: "Failed to build review" }, { status: 500 });
  }
}
