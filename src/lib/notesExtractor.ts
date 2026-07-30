/**
 * Extracts relevant paragraphs from full notes for a given concept.
 */
export function extractRelevantNotes(
  fullNotes: string | null,
  conceptName: string,
  markSchemePoints?: { point: string; keywords: string[] }[]
): string {
  if (!fullNotes || !fullNotes.trim()) return "No notes uploaded for this session.";
  const paragraphs = fullNotes.split(/\n\n+/).filter(Boolean);
  if (paragraphs.length <= 1) return fullNotes;

  const keywords = [
    conceptName.toLowerCase(),
    ...(markSchemePoints ?? []).flatMap((m) =>
      (m.keywords ?? []).map((k) => k.toLowerCase())
    ),
  ];

  const scored = paragraphs.map((para) => {
    const lower = para.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score += 2;
    }
    return { para, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter((s) => s.score > 0).slice(0, 3);
  if (top.length === 0) return paragraphs.slice(0, 2).join("\n\n");
  return top.map((t) => t.para).join("\n\n");
}
