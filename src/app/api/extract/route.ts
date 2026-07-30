import { scanConcepts } from "@/lib/conceptScan";

export const dynamic = "force-dynamic";

// POST /api/extract — Brain Map Builder.
// Body: { notes: string, topic?: string }
// Returns: { concepts: [{ name, status: "locked", weight }] }
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const notes = String(body?.notes ?? "").trim();
    const topic = String(body?.topic ?? "").trim() || "Study Topic";

    if (!notes) {
      return Response.json({ error: "Notes are required" }, { status: 400 });
    }

    const concepts = await scanConcepts(notes, topic);
    return Response.json({ concepts });
  } catch {
    return Response.json({ error: "Failed to extract concepts" }, { status: 500 });
  }
}
