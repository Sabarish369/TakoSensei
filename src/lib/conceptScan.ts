/**
 * Pre-Session Concept Scan
 * Extracts a structured "Mastery List" of concepts from the user's notes.
 * This gives Tako (the student) a hidden rubric to measure mastery against.
 */

export type MarkSchemePoint = {
  point: string;
  keywords: string[];
};

export type ScannedConcept = {
  name: string;
  status: "locked" | "mastered";
  weight?: number;
  why?: string;
  // Exam-focused fields (generated when notes are rich enough)
  questionStem?: string;
  commandWord?: "explain" | "describe" | "compare" | "evaluate" | "discuss";
  markValue?: number;
  markScheme?: MarkSchemePoint[];
  examTrap?: string;
  notesEvidence?: string;
};

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "of", "to", "in", "on",
  "for", "with", "as", "at", "by", "is", "are", "was", "were", "be", "been",
  "it", "this", "that", "these", "those", "you", "your", "i", "we", "they",
  "from", "about", "into", "which", "what", "when", "where", "how", "why",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
}

function extractHeuristicConcepts(notes: string, topic: string): ScannedConcept[] {
  const sentences = notes.split(/[.!?]\s+/).filter((s) => s.length > 25);
  const termFreq = new Map<string, number>();

  // Score sentences that look definitional or process-oriented
  const scored: { phrase: string; score: number }[] = [];

  for (const sentence of sentences.slice(0, 40)) {
    const tokens = tokenize(sentence);
    tokens.forEach((t) => termFreq.set(t, (termFreq.get(t) || 0) + 1));

    const lower = sentence.toLowerCase();
    let score = tokens.length * 0.6;

    if (/\b(is|are|refers to|defined as|means|process of|involves)\b/.test(lower)) score += 12;
    if (/\b(first|then|next|finally|step|cycle|stage|reaction|phase)\b/.test(lower)) score += 9;
    if (/\b(because|causes|results in|leads to|enables|produces)\b/.test(lower)) score += 7;
    if (/\d/.test(sentence)) score += 3;

    const main = sentence
      .replace(/^[^a-zA-Z]+/, "")
      .split(/[,;:]/)[0]
      .trim()
      .slice(0, 58);

    if (main.length > 4) {
      scored.push({ phrase: main, score });
    }
  }

  // Pick top unique phrases
  const seen = new Set<string>();
  const chosen: ScannedConcept[] = [];

  scored
    .sort((a, b) => b.score - a.score)
    .forEach(({ phrase }) => {
      const key = phrase.toLowerCase();
      if (!seen.has(key) && chosen.length < 7) {
        seen.add(key);
        chosen.push({
          name: phrase.charAt(0).toUpperCase() + phrase.slice(1),
          status: "locked",
          weight: 0.15 + Math.random() * 0.25,
        });
      }
    });

  // Fallback to key terms if we got too few
  if (chosen.length < 3) {
    const terms = [...termFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([t]) => t.charAt(0).toUpperCase() + t.slice(1));

    terms.forEach((t) => {
      if (chosen.length < 6 && !chosen.find((c) => c.name.toLowerCase().includes(t.toLowerCase()))) {
        chosen.push({ name: t, status: "locked", weight: 0.2 });
      }
    });
  }

  // Always guarantee a minimum of 4 concepts
  while (chosen.length < 4) {
    chosen.push({
      name: `${topic} ${["Basics", "Core Idea", "Process", "Impact"][chosen.length] || "Detail"}`,
      status: "locked",
      weight: 0.2,
    });
  }

  // Normalize weights to sum ~1
  const totalW = chosen.reduce((s, c) => s + (c.weight || 0.2), 0) || 1;
  return chosen.map((c) => ({ ...c, weight: Math.round(((c.weight || 0.2) / totalW) * 100) / 100 }));
}

export async function scanConcepts(notes: string, topic: string): Promise<ScannedConcept[]> {
  const sys = `You are an EXAM PREPARATION STRATEGIST. Analyze student notes and extract 3-5 high-yield concepts optimized for rapid exam revision.

SELECTION CRITERIA:
1. EXAMINABILITY: Prioritize concepts that appear in exams as written questions — mechanisms, cause-effect, comparisons, multi-step explanations.
2. SKIP: Pure definitions, isolated facts, simple recall items.
3. RANK by examWeight (1-5): 5 = always examined/high marks, 3 = frequently tested, 1 = rarely examined.
4. Maximum 5 concepts. Quality and speed over quantity.

FOR EACH CONCEPT, GENERATE:

A. questionStem: A realistic exam-style question using a command word (Explain, Describe, Compare, Evaluate, Discuss) with mark allocation, e.g. "Explain how natural selection leads to adaptation. [4 marks]"
B. commandWord: "explain" | "describe" | "compare" | "evaluate" | "discuss"
C. markValue: 2-6 (realistic marks for that concept's complexity)
D. markScheme: Break down EXACTLY what an examiner needs to see for full marks. Each point = 1 mark. Derive ONLY from the uploaded notes.
   Format: [{"point": "Required content", "keywords": ["key", "terms"]}]
   For "explain": cause → mechanism → effect chain.
   For "describe": stages/features in sequence.
   For "compare": similarities then differences.
E. examTrap: The #1 way students LOSE marks on this concept (structural/expression error, not just "they forget").
F. notesEvidence: Direct quote (2-3 sentences) from the notes supporting this concept.
G. why: One sentence explaining why this concept matters for understanding the rest.

Return ONLY valid JSON:
{
  "concepts": [
    {
      "name": "Concept name (2-6 words)",
      "weight": 1-5,
      "why": "One sentence.",
      "questionStem": "Explain how X leads to Y. [4 marks]",
      "commandWord": "explain",
      "markValue": 4,
      "markScheme": [{"point": "Description", "keywords": ["term1", "term2"]}],
      "examTrap": "Students often...",
      "notesEvidence": "Direct quote from notes."
    }
  ]
}

CONSTRAINTS:
- 3-5 concepts maximum
- Total combined markValue should be 12-20 marks (simulates a short exam section)
- Prioritize breadth over depth`;

  const prompt = `Extract exam-focused concepts from these notes about "${topic}":\n\n${notes.slice(0, 4200)}`;

  const { chatCompletionJSON } = await import("./ai");
  const parsed = await chatCompletionJSON<{
    concepts?: any[];
  }>({
    messages: [
      { role: "system", content: sys },
      { role: "user", content: prompt },
    ],
    temperature: 0.3,
    maxTokens: 1200,
  });

  if (parsed && Array.isArray(parsed.concepts) && parsed.concepts.length > 0) {
    return parsed.concepts.slice(0, 5).map((c: any) => {
      const markScheme: MarkSchemePoint[] = Array.isArray(c.markScheme)
        ? c.markScheme.slice(0, 8).map((ms: any) => ({
            point: String(ms?.point ?? "").slice(0, 200),
            keywords: Array.isArray(ms?.keywords)
              ? ms.keywords.filter((k: unknown) => typeof k === "string").slice(0, 6)
              : [],
          }))
        : [];

      return {
        name: String(c.name || "Key Idea").slice(0, 70),
        status: "locked" as const,
        weight: typeof c.weight === "number" ? Math.max(1, Math.min(5, Math.round(c.weight))) : 3,
        why: typeof c.why === "string" ? c.why.trim().slice(0, 200) : undefined,
        questionStem: typeof c.questionStem === "string" ? c.questionStem.trim().slice(0, 300) : undefined,
        commandWord:
          c.commandWord === "explain" || c.commandWord === "describe" ||
          c.commandWord === "compare" || c.commandWord === "evaluate" ||
          c.commandWord === "discuss"
            ? c.commandWord
            : "explain",
        markValue: typeof c.markValue === "number" ? Math.max(2, Math.min(6, Math.round(c.markValue))) : 4,
        markScheme: markScheme.length > 0 ? markScheme : undefined,
        examTrap: typeof c.examTrap === "string" ? c.examTrap.trim().slice(0, 300) : undefined,
        notesEvidence: typeof c.notesEvidence === "string" ? c.notesEvidence.trim().slice(0, 500) : undefined,
      };
    });
  }

  return extractHeuristicConcepts(notes, topic);
}
