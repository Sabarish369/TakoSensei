import { takoThink, takoThinkLLM } from "@/lib/tako";

export const dynamic = "force-dynamic";

/**
 * Stateless opening question. Called once when a Sensei session starts so the
 * student always has a real question waiting instead of a placeholder.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const topic = String(body?.topic ?? "Study Topic");
    const notes: string | null = body?.notes ?? null;
    const concepts: any[] = Array.isArray(body?.concepts) ? body.concepts : [];

    const names = concepts
      .map((c) => c?.name || c?.label)
      .filter((n): n is string => typeof n === "string" && n.length > 0);
    const focus = names[0] ?? null;

    // Prefer the LLM opening (warmer, notes-aware); fall back to the
    // deterministic engine so this endpoint can never fail.
    const llm = await takoThinkLLM(topic, [], {
      notes,
      concepts: names,
      mastered: [],
      active: names,
      skipped: [],
      focusConcept: focus,
      focusPhase: 0,
      intent: "explanation",
    });

    const opening = llm ?? takoThink(topic, [], notes ?? undefined);

    return Response.json({
      takoMessage: {
        role: "tako",
        content: opening.reply,
        meta: {
          gaps: opening.gaps,
          unlocked: [],
          focus,
          focusPhase: 0,
          opening: true,
        },
      },
    });
  } catch {
    return Response.json({ error: "Failed to open session" }, { status: 500 });
  }
}
