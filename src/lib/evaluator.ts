// Evaluator: scores a teaching session transcript and produces a learning
// report. The local heuristic engine works offline; with an OPENAI_API_KEY
// present it upgrades to an LLM grader for richer strengths/misunderstandings.

import type { Msg } from "./tako";

export type ReportData = {
  score: number; // 0-100
  readiness: "Not Ready" | "Building" | "Almost Ready" | "Ready";
  breakdown: {
    accuracy: number;
    coverage: number;
    clarity: number;
    misconceptions: number;
    questionResponse: number;
  };
  strengths: string[];
  misunderstandings: { issue: string; better: string }[];
  conceptStatuses: { name: string; status: "mastered" | "needs_review" | "missed" }[];
  bestExplanation: string;
  takoSummary: string;
  nextSteps: string[];
};

const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "of", "to", "in", "on",
  "for", "with", "as", "at", "by", "is", "are", "was", "were", "be", "been",
  "it", "its", "this", "that", "these", "those", "you", "your", "i", "we",
  "they", "them", "so", "can", "will", "would", "could", "should", "do",
  "does", "did", "has", "have", "had", "not", "no", "yes", "into", "about",
  "from", "which", "what", "when", "where", "how", "why", "who", "there",
  "their", "our", "us", "me", "my", "also", "just", "like", "get", "very",
  "more", "most", "some", "any", "all", "one", "two", "up", "out", "than",
  "then", "because", "since", "using", "use", "used", "uses", "make", "makes",
  "made", "thing", "things", "way", "ways", "really", "know", "knows", "think",
  "okay", "oh", "hmm", "yeah", "well", "say", "said", "go", "going", "come",
]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function keyTerms(text: string): string[] {
  const counts = new Map<string, number>();
  for (const w of words(text)) {
    if (w.length < 4 || STOP.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
}

// Curated, commonly-tested concepts per topic. The LLM path returns richer
// coverage but these are the safety net so the report never looks empty.
const TOPIC_CONCEPTS: Record<string, string[]> = {
  photosynthesis: [
    "plants make their own food",
    "sunlight provides energy",
    "water and carbon dioxide are inputs",
    "glucose is the food plants make",
    "chlorophyll absorbs light",
    "oxygen is released",
  ],
  fractions: [
    "a fraction represents part of a whole",
    "numerator is the top number",
    "denominator is the bottom number",
    "equivalent fractions have the same value",
    "adding fractions needs a common denominator",
    "multiplying fractions multiplies numerators and denominators",
  ],
  "newton's laws": [
    "first law: an object stays at rest unless acted on by force",
    "second law: force equals mass times acceleration",
    "third law: every action has an equal and opposite reaction",
    "inertia is the tendency to resist change in motion",
    "force is measured in newtons",
  ],
  "the water cycle": [
    "water evaporates from oceans, lakes, and rivers",
    "water vapor condenses into clouds",
    "precipitation returns water to the surface",
    "collection happens in bodies of water",
    "the sun powers the entire cycle",
  ],
  "the stock market": [
    "shares represent partial ownership of a company",
    "stock prices reflect supply and demand",
    "the market is shaped by investor sentiment",
    "indices track a basket of stocks",
    "risk and return are linked",
  ],
  "supply and demand": [
    "demand is the quantity buyers want at a given price",
    "supply is the quantity sellers offer at a given price",
    "equilibrium is where supply meets demand",
    "price rises when demand exceeds supply",
    "elasticity measures how sensitive demand is to price",
  ],
  "how vaccines work": [
    "vaccines train the immune system",
    "they use a harmless form of the pathogen",
    "antibodies are produced in response",
    "memory cells provide long-term protection",
    "herd immunity protects the unvaccinated",
  ],
  "binary numbers": [
    "binary uses only 0 and 1",
    "each digit is a power of 2",
    "binary powers double from right to left",
    "binary is the language of computers",
    "bits are grouped into bytes",
  ],
  "the french revolution": [
    "it began in 1789",
    "caused by inequality and financial crisis",
    "the storming of the bastille was a turning point",
    "led to the rise of napoleon",
    "established ideas of liberty and equality",
  ],
  "how neural networks learn": [
    "neural networks are inspired by the brain",
    "they learn from labeled examples",
    "weights are adjusted to reduce error",
    "backpropagation sends error backwards through the network",
    "more data generally improves accuracy",
  ],
  "compound interest": [
    "interest is earned on principal and accumulated interest",
    "it grows exponentially over time",
    "the rule of 72 estimates doubling time",
    "compounding frequency matters",
    "starting early multiplies long-term gains",
  ],
  "plate tectonics": [
    "the earth's crust is split into plates",
    "plates move slowly over the mantle",
    "earthquakes happen at plate boundaries",
    "volcanoes form where plates collide or separate",
    "continental drift explains similar fossils across continents",
  ],
  "how the internet works": [
    "data is broken into packets",
    "packets travel via routers",
    "TCP/IP governs how data moves",
    "DNS translates names to ip addresses",
    "the web is a layer on top of the internet",
  ],
  "natural selection": [
    "individuals in a population vary",
    "traits are partly heritable",
    "organisms produce more offspring than survive",
    "better-adapted traits become more common over generations",
    "selection acts on existing variation, not new traits",
  ],
};

function lookupConcepts(topic: string): string[] {
  const t = topic.toLowerCase();
  // Direct match
  for (const key of Object.keys(TOPIC_CONCEPTS)) {
    if (t.includes(key)) return TOPIC_CONCEPTS[key];
  }
  // Heuristic fallback: 6 generic placeholder concepts
  return [
    `${topic} has a clear definition`,
    `${topic} follows a process or mechanism`,
    `${topic} can be illustrated with examples`,
    `${topic} connects to other related ideas`,
    `${topic} has practical applications`,
    `${topic} involves trade-offs or limits`,
  ];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

export function evaluate(topic: string, history: Msg[]): ReportData {
  const userTurns = history.filter((m) => m.role === "user");
  const takoTurns = history.filter((m) => m.role === "tako");
  const allUserText = userTurns.map((m) => m.content).join(" ");
  const lower = allUserText.toLowerCase();

  // ---- Per-turn quality signals ----
  let totalWords = 0;
  let exampleCount = 0;
  let causeCount = 0;
  let definitionCount = 0;
  let comparisonCount = 0;
  let processCount = 0;
  let questionResponseHits = 0;
  const allTerms: string[] = [];

  for (let i = 0; i < userTurns.length; i++) {
    const t = userTurns[i].content;
    const w = words(t);
    totalWords += w.length;
    if (/\b(example|for instance|such as|imagine|like when|think of|e\.g\.)\b/i.test(t)) exampleCount++;
    if (/\b(because|since|due to|as a result|therefore|so that|leads to|causes|results in)\b/i.test(t)) causeCount++;
    if (/\b(is|are|means|refers to|defined as|is when|is a|is the)\b/i.test(t)) definitionCount++;
    if (/\b(unlike|whereas|compared to|different from|similar to|versus|vs\.?|more than|less than)\b/i.test(t)) comparisonCount++;
    if (/\b(first|then|next|after|before|finally|step|process|stage)\b/i.test(t)) processCount++;
    allTerms.push(...keyTerms(t));

    // Question response: if a Tako question preceded this turn, see if the
    // user's response addressed one of the gap kinds implied by the question.
    if (i > 0) {
      const prevTako = takoTurns[takoTurns.length - (userTurns.length - i)]?.content || "";
      const lastQ = prevTako.toLowerCase();
      if (lastQ.includes("example") && /\b(example|for instance|such as|imagine)\b/i.test(t)) questionResponseHits++;
      else if (lastQ.includes("why") && /\b(because|since|causes|results in)\b/i.test(t)) questionResponseHits++;
      else if (lastQ.includes("how") && /\b(first|then|next|process|step|by)\b/i.test(t)) questionResponseHits++;
      else if (lastQ.includes("compare") && /\b(unlike|whereas|compared|different|more than)\b/i.test(t)) questionResponseHits++;
      else if (w.length > 8) questionResponseHits++;
    }
  }

  const depth = clamp((totalWords / Math.max(1, userTurns.length * 30)) * 100, 0, 100);
  const examplePenalty = userTurns.length === 0 ? 0 : clamp(100 - exampleCount * 25, 20, 100);
  const causePenalty = userTurns.length === 0 ? 0 : clamp(100 - causeCount * 25, 20, 100);

  // ---- Accuracy ----
  // Heuristic: penalize obviously wrong phrasings; reward length and
  // distinct terms; reward presence of a definition, cause, or process.
  const distinctTerms = new Set(allTerms);
  let accuracy = 0;
  if (userTurns.length === 0) accuracy = 0;
  else {
    accuracy = clamp(
      30 +
        Math.min(totalWords, 200) * 0.2 + // length matters up to a point
        Math.min(distinctTerms.size, 30) * 1.4 + // vocabulary
        (definitionCount > 0 ? 8 : 0) +
        (causeCount > 0 ? 8 : 0) +
        (processCount > 0 ? 5 : 0) -
        // Soft penalty for vague "thing" type terms
        (allTerms.includes("thing") || allTerms.includes("stuff") ? 8 : 0)
    );
  }

  // ---- Concept Coverage ----
  const concepts = lookupConcepts(topic);
  const conceptStatuses: ReportData["conceptStatuses"] = concepts.map((c) => {
    const tokens = c.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3);
    const hits = tokens.filter((t) => lower.includes(t)).length;
    const ratio = hits / Math.max(1, tokens.length);
    if (ratio >= 0.7) return { name: capitalize(c), status: "mastered" };
    if (ratio >= 0.35) return { name: capitalize(c), status: "needs_review" };
    return { name: capitalize(c), status: "missed" };
  });
  const mastered = conceptStatuses.filter((c) => c.status === "mastered").length;
  const coverage = clamp(Math.round((mastered / Math.max(1, conceptStatuses.length)) * 100));

  // ---- Clarity ----
  const clarity = clamp(
    Math.round(
      50 +
        Math.min(depth, 100) * 0.25 +
        (processCount > 0 ? 10 : 0) +
        (comparisonCount > 0 ? 8 : 0) +
        (definitionCount > 0 ? 7 : 0)
    )
  );

  // ---- Misconception correction ----
  // Compare the first user turn to the last. If the last turn has
  // substantially more depth and uses new terms, reward improvement.
  let misconceptions = 60;
  if (userTurns.length >= 2) {
    const firstW = words(userTurns[0].content);
    const lastW = words(userTurns[userTurns.length - 1].content);
    const firstTerms = new Set(keyTerms(userTurns[0].content));
    const lastTerms = new Set(keyTerms(userTurns[userTurns.length - 1].content));
    let newTerms = 0;
    lastTerms.forEach((t) => { if (!firstTerms.has(t)) newTerms++; });
    const grew = lastW.length > firstW.length * 1.2;
    if (grew && newTerms >= 2) misconceptions = 90;
    else if (grew) misconceptions = 80;
    else if (newTerms >= 3) misconceptions = 78;
    else if (lastW.length > firstW.length) misconceptions = 70;
  } else if (userTurns.length === 1) {
    misconceptions = 55;
  } else {
    misconceptions = 0;
  }

  // ---- Question Response ----
  const questionResponse = userTurns.length === 0
    ? 0
    : clamp(Math.round((questionResponseHits / Math.max(1, takoTurns.length - 1)) * 100), 0, 100);

  // Weighted total
  const score = Math.round(
    accuracy * 0.35 +
      coverage * 0.25 +
      clarity * 0.2 +
      misconceptions * 0.1 +
      questionResponse * 0.1
  );
  const finalScore = clamp(score, 0, 100);

  const readiness: ReportData["readiness"] =
    finalScore >= 85 ? "Ready" :
    finalScore >= 70 ? "Almost Ready" :
    finalScore >= 50 ? "Building" :
    "Not Ready";

  // ---- Strengths (positive facts the user mentioned) ----
  const strengths: string[] = [];
  if (mastered > 0) strengths.push(`Covered ${mastered} of the ${conceptStatuses.length} core ideas for ${topic}.`);
  if (definitionCount > 0) strengths.push("Defined the topic clearly in your own words.");
  if (exampleCount > 0) strengths.push("Used a concrete example to illustrate the idea.");
  if (causeCount > 0) strengths.push("Explained the cause-and-effect behind the topic.");
  if (processCount > 0) strengths.push("Walked through the process step by step.");
  if (comparisonCount > 0) strengths.push("Compared the topic to something else to clarify it.");
  if (userTurns.length >= 3) strengths.push("Adapted your explanation as Tako asked new questions.");
  if (questionResponse >= 70) strengths.push("Directly addressed Tako's questions instead of dodging them.");
  if (strengths.length === 0 && userTurns.length > 0) {
    strengths.push("You attempted to explain the topic in your own words.");
  }
  if (strengths.length === 0) {
    strengths.push("Get started and Tako will find what you understand.");
  }

  // ---- Misunderstandings (constructive) ----
  const misunderstandings: ReportData["misunderstandings"] = [];
  const needsReview = conceptStatuses.filter((c) => c.status === "needs_review");
  const missed = conceptStatuses.filter((c) => c.status === "missed");
  for (const m of needsReview) {
    misunderstandings.push({
      issue: `${m.name.toLowerCase()} was only partially covered.`,
      better: `Make sure your explanation explicitly mentions ${m.name.toLowerCase()}.`,
    });
  }
  for (const m of missed.slice(0, 2)) {
    misunderstandings.push({
      issue: `${m.name.toLowerCase()} was missing from your explanation.`,
      better: `Try to add ${m.name.toLowerCase()} next time and connect it to the rest of the topic.`,
    });
  }
  if (misunderstandings.length === 0) {
    misunderstandings.push({
      issue: "No major gaps detected.",
      better: "Tackle edge cases or compare this topic to something similar to go deeper.",
    });
  }

  // ---- Best explanation: pick the longest user turn that looks coherent ----
  let best = "";
  for (let i = userTurns.length - 1; i >= 0; i--) {
    const c = userTurns[i].content.trim();
    if (c.length >= 30 && c.length >= best.length) best = c;
  }
  if (!best && userTurns[0]) best = userTurns[0].content.trim();
  if (!best) best = `I haven't formed a clear explanation of ${topic} yet.`;

  // ---- Tako's final summary ----
  const takoSummary = buildTakoSummary(topic, conceptStatuses);

  // ---- Next steps ----
  const nextSteps: string[] = [];
  if (missed.length > 0) nextSteps.push(`Cover the basics you missed: ${missed.map((m) => m.name).join(", ")}.`);
  if (needsReview.length > 0) nextSteps.push(`Strengthen ${needsReview.map((m) => m.name).join(" and ")} with examples.`);
  if (clarity < 70) nextSteps.push("Practice a 60-second summary out loud to tighten clarity.");
  if (userTurns.length < 3) nextSteps.push("Try teaching Tako in at least 3 short turns next time.");
  if (nextSteps.length === 0) nextSteps.push(`Try teaching ${topic} again in under 2 minutes.`);

  return {
    score: finalScore,
    readiness,
    breakdown: {
      accuracy: clamp(Math.round(accuracy)),
      coverage,
      clarity,
      misconceptions: clamp(Math.round(misconceptions)),
      questionResponse,
    },
    strengths: strengths.slice(0, 5),
    misunderstandings: misunderstandings.slice(0, 4),
    conceptStatuses,
    bestExplanation: best,
    takoSummary,
    nextSteps,
  };
}

function buildTakoSummary(topic: string, statuses: ReportData["conceptStatuses"]): string {
  const mastered = statuses.filter((s) => s.status === "mastered").map((s) => s.name);
  if (mastered.length === 0) {
    return `I only caught fragments about ${topic}. I need a clearer, fuller explanation before I really get it.`;
  }
  const list = mastered.slice(0, 4).join(", ").toLowerCase();
  const tail = mastered.length > 4 ? " and more" : "";
  return `I now understand that ${topic} is about ${list}${tail}. I'm still working on the parts we didn't get to.`;
}

// Optional LLM grader. If it succeeds, we use its richer output. Otherwise
// we fall back to the local heuristic above.
export async function evaluateLLM(topic: string, history: Msg[], notes?: string): Promise<ReportData | null> {
  const { chatCompletion } = await import("./ai");

  const transcript = history
    .map((m) => `${m.role === "user" ? "STUDENT" : "TAKO"}: ${m.content}`)
    .join("\n");

  const notesSection = notes && notes.trim().length > 30
    ? `\n\n===== SOURCE NOTES (ground truth — judge accuracy against this) =====\n${notes.slice(0, 3200)}\n===== END NOTES =====`
    : "";

  const sys = `You are an objective, encouraging evaluator for a learning-by-teaching app.
You will receive a transcript where a human STUDENT is teaching an AI student called TAKO about "${topic}".
${notesSection ? "You also have the student's original study notes below — use them as ground truth when judging accuracy." : ""}

GRADING PRINCIPLES:
- Only mark concepts "mastered" if the student demonstrated CORRECT CAUSAL LINKS in their own words — not just buzzwords.
- "needs_review" = they mentioned it but the reasoning was incomplete, backwards, or too vague.
- "missed" = they never addressed it.
- Be strict on accuracy: repeating notes verbatim is NOT understanding.
- The "takoSummary" should be written from Tako's point of view: "Thanks Sensei! Because of you I now understand…" followed by mastered concepts in simple language.

Produce a JSON report (no markdown fences) with EXACTLY this shape:
{
  "score": number 0-100,
  "readiness": "Not Ready" | "Building" | "Almost Ready" | "Ready",
  "breakdown": { "accuracy": 0-100, "coverage": 0-100, "clarity": 0-100, "misconceptions": 0-100, "questionResponse": 0-100 },
  "strengths": string[] (3-5 short, specific, positive observations),
  "misunderstandings": [{ "issue": string, "better": string }] (2-4 items, constructive, not harsh),
  "conceptStatuses": [{ "name": string, "status": "mastered" | "needs_review" | "missed" }] (5-8 items),
  "bestExplanation": string (the single clearest STUDENT turn, quoted exactly),
  "takoSummary": string (1-2 sentences from Tako's POV: "Thanks Sensei! Because of you I now understand…"),
  "nextSteps": string[] (2-3 specific things to review)
}
Score mapping: 0-49 Not Ready, 50-69 Building, 70-84 Almost Ready, 85-100 Ready.`;

  const raw = await chatCompletion({
    messages: [
      { role: "system", content: sys },
      { role: "user", content: `Transcript:\n${transcript}${notesSection}` },
    ],
    temperature: 0.4,
    json: true,
  });

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);

    // Light validation + clamping
    const clampN = (n: unknown, d = 0) => {
      const x = Number(n);
      if (!Number.isFinite(x)) return d;
      return Math.max(0, Math.min(100, Math.round(x)));
    };
    const score = clampN(parsed.score, 60);
    const readiness =
      score >= 85 ? "Ready" :
      score >= 70 ? "Almost Ready" :
      score >= 50 ? "Building" :
      "Not Ready";

    return {
      score,
      readiness,
      breakdown: {
        accuracy: clampN(parsed.breakdown?.accuracy),
        coverage: clampN(parsed.breakdown?.coverage),
        clarity: clampN(parsed.breakdown?.clarity),
        misconceptions: clampN(parsed.breakdown?.misconceptions),
        questionResponse: clampN(parsed.breakdown?.questionResponse),
      },
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 5) : [],
      misunderstandings: Array.isArray(parsed.misunderstandings)
        ? parsed.misunderstandings.slice(0, 4).map((m: { issue: string; better: string }) => ({
            issue: String(m.issue ?? ""),
            better: String(m.better ?? ""),
          }))
        : [],
      conceptStatuses: Array.isArray(parsed.conceptStatuses)
        ? parsed.conceptStatuses.slice(0, 8).map((c: { name: string; status: string }) => ({
            name: String(c.name ?? ""),
            status:
              c.status === "mastered" || c.status === "needs_review" || c.status === "missed"
                ? c.status
                : "needs_review",
          }))
        : [],
      bestExplanation: String(parsed.bestExplanation ?? ""),
      takoSummary: String(parsed.takoSummary ?? ""),
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps.slice(0, 3).map(String) : [],
    };
  } catch {
    return null;
  }
}
