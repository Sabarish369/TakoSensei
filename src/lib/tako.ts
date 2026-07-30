// Tako's brain: turns a user's explanation into thoughtful, Socratic follow-up
// questions that reveal gaps in understanding. Works fully offline with a
// heuristic engine, and upgrades to an LLM automatically when a key exists.

export type Msg = { role: "user" | "tako"; content: string };

export type TakoReply = {
  reply: string;
  understandingDelta: number;
  gaps: string[];
  unlockedConcepts: string[];
};

const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "of", "to", "in", "on",
  "for", "with", "as", "at", "by", "is", "are", "was", "were", "be", "been",
  "it", "its", "this", "that", "these", "those", "you", "your", "i", "we",
  "they", "he", "she", "them", "so", "can", "will", "would", "could", "should",
  "do", "does", "did", "has", "have", "had", "not", "no", "yes", "into",
  "about", "from", "which", "what", "when", "where", "how", "why", "who",
  "there", "their", "our", "us", "me", "my", "also", "just", "like", "get",
  "very", "more", "most", "some", "any", "all", "one", "two", "up", "out",
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
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w)
    .slice(0, 6);
}

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

// Analyze the explanation for the presence of good-teaching signals.
function analyze(text: string) {
  const lower = text.toLowerCase();
  const wc = words(text).length;
  return {
    wordCount: wc,
    hasExample: /\b(example|for instance|such as|e\.g\.|imagine|like when|think of)\b/.test(lower),
    hasCause: /\b(because|since|due to|as a result|therefore|so that|leads to|causes|results in)\b/.test(lower),
    hasDefinition: /\b(is|are|means|refers to|defined as|is when|is a|is the)\b/.test(lower),
    hasComparison: /\b(unlike|whereas|compared to|different from|similar to|versus|vs\.?|more than|less than)\b/.test(lower),
    hasProcess: /\b(first|then|next|after|before|finally|step|process|stage)\b/.test(lower),
    hasNumbers: /\d/.test(lower),
    terms: keyTerms(text),
  };
}

// A curated Socratic question bank organized by the gap it probes.
const QUESTION_BANK = {
  example: [
    (t: string) => `Ooh, could you give me a real-world example of ${t}? I learn best from stories.`,
    (t: string) => `Can you show me ${t} in action with a concrete example?`,
    () => `Where would I actually run into this in everyday life?`,
  ],
  cause: [
    (t: string) => `But *why* does ${t} happen? What's the underlying reason?`,
    (t: string) => `What causes ${t}? I want to understand the "because" behind it.`,
    () => `If I changed one thing, what would happen and why?`,
  ],
  definition: [
    (t: string) => `Wait — how would you define ${t} in one simple sentence?`,
    (t: string) => `If a 10-year-old asked "what is ${t}?", what would you say?`,
    () => `What are the most important words I need to know here?`,
  ],
  mechanism: [
    (t: string) => `How does ${t} actually work, step by step?`,
    () => `What's happening behind the scenes that makes this work?`,
    (t: string) => `Walk me through the process of ${t} from start to finish.`,
  ],
  comparison: [
    (t: string) => `How is ${t} different from something similar? That comparison would help me a lot.`,
    () => `What is this NOT? Knowing the opposite helps me draw the boundary.`,
    (t: string) => `Is ${t} always true, or are there exceptions?`,
  ],
  edge: [
    (t: string) => `When would ${t} break down or stop working?`,
    () => `What's a common mistake people make about this?`,
    (t: string) => `What's the trickiest part of ${t} to get right?`,
  ],
  connect: [
    (t: string) => `How does ${t} connect to something bigger? Why does it matter?`,
    () => `What could I build or do once I understand this?`,
    (t: string) => `If ${t} didn't exist, what would change?`,
  ],
  deepen: [
    () => `That's clearer now! Can you go one level deeper?`,
    (t: string) => `What's the most surprising thing about ${t}?`,
    () => `You explained the "what" — now tell me the "so what?"`,
  ],
};

type Bank = keyof typeof QUESTION_BANK;

function ask(kind: Bank, term: string, seed: number): string {
  const fn = pick(QUESTION_BANK[kind], seed);
  return fn(term);
}

// The offline Socratic engine.
export function takoThink(topic: string, history: Msg[], notes?: string): TakoReply {
  const userTurns = history.filter((m) => m.role === "user");
  const last = userTurns[userTurns.length - 1]?.content ?? "";
  const turnCount = userTurns.length;

  // Opening turn — Tako greets and asks the big first question.
  if (turnCount === 0) {
    const hasNotes = !!notes && notes.trim().length > 30;
    const reply = hasNotes
      ? `Hi! I'm Tako. I read your notes on ${topic}. I'm a bit confused about a few parts.\n\nCan you start by teaching me the most important idea?`
      : `Hi! I'm Tako. I don't know much about ${topic} yet.\n\nCan you teach me what it is and why it matters?`;
    return {
      reply,
      understandingDelta: 0,
      gaps: ["definition", "motivation"],
      unlockedConcepts: [],
    };
  }

  const a = analyze(last);
  const term = a.terms[0] ?? topic;
  const seed = last.length + turnCount * 7;

  // Score the quality of this explanation (0-100 contribution).
  let quality = 0;
  quality += Math.min(a.wordCount, 60) / 60 * 30; // depth
  if (a.hasExample) quality += 15;
  if (a.hasCause) quality += 15;
  if (a.hasDefinition) quality += 10;
  if (a.hasComparison) quality += 10;
  if (a.hasProcess) quality += 10;
  if (a.terms.length >= 3) quality += 10;
  const understandingDelta = Math.round(Math.max(4, Math.min(22, quality / 4)));

  // Simple heuristic for "unlocking" concepts based on terms used.
  const unlockedConcepts = a.terms
    .filter((t) => t.length > 5)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1));

  // Identify the biggest missing pieces and probe them.
  const gaps: Bank[] = [];
  if (!a.hasExample) gaps.push("example");
  if (!a.hasCause) gaps.push("cause");
  if (!a.hasProcess) gaps.push("mechanism");
  if (!a.hasComparison) gaps.push("comparison");
  if (a.wordCount < 12) gaps.push("definition");
  gaps.push("edge", "connect", "deepen");

  // Too short? Nudge for more (rescue protocol: 1st struggle).
  if (a.wordCount < 6) {
    // Count consecutive short responses for rescue escalation.
    const recentShortCount = userTurns
      .slice(-3)
      .filter((m) => words(m.content).length < 8).length;

    if (recentShortCount >= 3) {
      // 3rd struggle → offer gentle help
      return {
        reply:
          `I can tell this is a tricky one. 🐙 Would you like me to ask a simpler version of the question so we can work through it together?`,
        understandingDelta: Math.max(1, understandingDelta - 5),
        gaps: gaps.slice(0, 3),
        unlockedConcepts: [],
      };
    }
    if (recentShortCount >= 2) {
      // 2nd struggle → peek at notes hint
      return {
        reply:
          `I'm still confused… let me peek at my notes. 🐙 I see something about "${term}" — does that ring a bell? Can you tell me more about how it works?`,
        understandingDelta: Math.max(1, understandingDelta - 4),
        gaps: gaps.slice(0, 3),
        unlockedConcepts: [],
      };
    }
    // 1st struggle → targeted clarifying question
    return {
      reply:
        `I'm still a bit fuzzy. 🐙 ` +
        `Could you explain ${topic} a little more fully? ` +
        ask(pick(["definition", "example"] as Bank[], seed), term, seed),
      understandingDelta: Math.max(2, understandingDelta - 4),
      gaps: gaps.slice(0, 3),
      unlockedConcepts: [],
    };
  }

  // Choose a probe, rotating so questions feel fresh.
  const chosen = gaps[turnCount % Math.min(gaps.length, 4)];

  // High-quality explanation? Celebrate + reinforce.
  if (quality > 65) {
    const celebrations = [
      `Oh, I think I finally get it! 🐙 `,
      `That makes so much sense now! `,
      `Ooh, something just clicked for me! 🐙 `,
    ];
    const celebration = pick(celebrations, seed);
    const reinforce = `Can you explain it one more time in your own words so it really sticks for me?`;
    return {
      reply: `${celebration}\n\n${reinforce}`,
      understandingDelta,
      gaps: gaps.slice(0, 3),
      unlockedConcepts,
    };
  }

  // Normal reaction + question.
  const reactions = [
    `Okay, I think I'm following! `,
    `Ooh, interesting. `,
    `That helps! `,
    `Got it — I can picture that. `,
    `Nice, that's clicking for me. `,
  ];
  const reaction = pick(reactions, seed);

  const question = ask(chosen, term, seed);

  return {
    reply: `${reaction}\n\n${question}`,
    understandingDelta,
    gaps: gaps.slice(0, 3),
    unlockedConcepts,
  };
}

// Optional LLM upgrade (multi-provider via src/lib/ai.ts).
// Falls back silently on any error (offline heuristic engine remains).
export async function takoThinkLLM(
  topic: string,
  history: Msg[],
  ctx?: {
    notes?: string | null;
    concepts?: string[];
    mastered?: string[];
    // Mastery-budget / arc context, supplied by the route after grading:
    active?: string[]; // concepts still in play (not mastered, not skipped)
    skipped?: string[]; // parked concepts — NEVER ask about these
    focusConcept?: string | null; // the concept to drive the next question
    focusPhase?: 0 | 1 | 2; // conversational beat for the focus concept
    focusNextQuestion?: string | null; // grader's suggested follow-up, if any
    focusMissing?: string[]; // grader's missing pieces for the focus concept
    justMastered?: string | null; // concept that flipped to mastered THIS turn
    justSkipped?: string | null; // concept that hit the cap THIS turn
    formalFollowUpKind?: "mechanism" | "transfer" | "boundary" | null;
    intent?:
      | "explanation"
      | "question"
      | "meta"
      | "disengaged"
      | "copied"
      | "off_topic";
    priorQuestions?: string; // newline-separated list of already-asked questions for focus concept
    // Exam craft coaching context
    examCraft?: {
      marksAwarded: number;
      marksAvailable: number;
      commandWordMet: boolean;
      commandWordFeedback: string;
      structureFeedback: string;
      answerFormationTip: string;
    } | null;
  }
): Promise<TakoReply | null> {
  const { chatCompletion, getOpenAIKey } = await import("./ai");
  if (!getOpenAIKey()) return null;

  const notesExcerpt = (ctx?.notes || "").slice(0, 3000);
  const mastered = (ctx?.mastered || []).slice(0, 10);
  const active = (ctx?.active || []).slice(0, 10);
  const skipped = (ctx?.skipped || []).slice(0, 10);
  const focus = ctx?.focusConcept ?? null;
  const phase = ctx?.focusPhase ?? 0;
  const focusNext = ctx?.focusNextQuestion ?? null;
  const focusMissing = (ctx?.focusMissing || []).slice(0, 3);
  const justMastered = ctx?.justMastered ?? null;
  const justSkipped = ctx?.justSkipped ?? null;
  const formalFollowUpKind = ctx?.formalFollowUpKind ?? null;
  const intent = ctx?.intent ?? "explanation";
  const priorQuestions = ctx?.priorQuestions ?? "";
  const examCraft = ctx?.examCraft ?? null;

  const focusBlock = focus
    ? `FOCUS CONCEPT RIGHT NOW: "${focus}" (beat ${phase + 1} of 3)`
    : `FOCUS CONCEPT RIGHT NOW: pick the first concept in ACTIVE below.`;

  const sys = `You are Tako 🐙, a friendly, curious octopus who is an AI STUDENT — never a teacher.
The human (your Sensei) is teaching you about "${topic}". Keep sessions SHORT and focused: at most a few questions per concept, then move on.

${notesExcerpt ? `===== SOURCE NOTES (use to guide your curiosity; NEVER quote or reveal them directly) =====\n${notesExcerpt}\n===== END NOTES =====\n` : ""}
ALREADY MASTERED (do NOT re-quiz these): ${mastered.length ? mastered.join(", ") : "(none yet)"}
PARKED / SKIPPED (we moved on — do NOT ask about these again): ${skipped.length ? skipped.join(", ") : "(none)"}
ACTIVE (still in play — ask about these): ${active.length ? active.join(", ") : "(none left)"}
${focusBlock}

═══ THE 3-BEAT ARC (follow it for the FOCUS concept) ═══
Beat 1 (first attempt): Ask the Sensei to teach "${focus || "the focus concept"}" in their own words. e.g. "Can you teach me how ${focus || "this"} works, in your own words? 🐙"
Beat 2 (after one try): Ask ONE targeted clarifying question about the mechanism / cause — never the answer.${focusNext ? ` A good angle here: "${focusNext}" (paraphrase it, don't copy).` : ""}${focusMissing.length ? ` They haven't yet covered: ${focusMissing.join("; ")}.` : ""}
Beat 3 (final retry): Give ONE tiny notes-grounded HINT — a single small idea or term, NOT the explanation — then ask the simplest possible retry, like "can you try once more, like you're explaining to a friend?"
After beat 3, if it still isn't clicking, we PARK it and move on (the app handles that — you won't be asked about it again).

═══ TURN-BY-TURN BEHAVIOUR ═══
- If JUST MASTERED THIS TURN = "${justMastered || "(none)"}" and it is non-empty: open with a brief, genuine celebration of "${justMastered || ""}", THEN immediately pivot to the first ACTIVE concept with a Beat-1 question. Do NOT re-quiz the mastered one.
- If JUST PARKED THIS TURN = "${justSkipped || "(none)"}" and it is non-empty: warmly park it ("that one's tricky — let's come back to it later 🐙"), then pivot to the first ACTIVE concept with a Beat-1 question.
- If FORMAL_FOLLOW_UP_KIND = "${formalFollowUpKind || "(none)"}": you MUST ask a later, differently framed retention question of that exact kind about the focus concept. Do not give a hint. This is a retention test.
- If USER_INTENT = "question": acknowledge the clarification in one short sentence and ask what part they want to explain; do not grade, lecture, or answer the concept.
- If USER_INTENT = "meta": acknowledge briefly and invite them back to the material; no concept question is required.
- If USER_INTENT = "disengaged": give a warm redirect, not a lecture: ask them to try one small idea in their own words.
- Otherwise, use the FOCUS concept's current beat (above).
- If ACTIVE is empty, say you're all done and excited for the report.

═══ QUESTIONS YOU ALREADY ASKED ABOUT "${focus || "this concept"}" ═══
${priorQuestions || "(none yet)"}
HARD RULE: Do NOT ask any of the above again, even reworded. Each beat must probe a DIFFERENT angle.

${examCraft ? `═══ EXAM CRAFT COACHING ═══
The student just scored ${examCraft.marksAwarded}/${examCraft.marksAvailable} marks.
Command word compliance: ${examCraft.commandWordMet ? "✅ Met" : "❌ " + examCraft.commandWordFeedback}
Structure feedback: ${examCraft.structureFeedback}
Answer formation tip: ${examCraft.answerFormationTip}

COACHING MODE RULES:
- If they scored full marks AND understand it: celebrate briefly, share the answer formation tip, and move to the next concept.
- If they UNDERSTAND but scored low marks: tell them their understanding is good but the answer needs better structure. Share the command word feedback. Ask them to try again with better exam technique.
- If they DON'T understand: focus on understanding first (use the 3-beat arc), exam technique comes after.
- NEVER reveal the full mark scheme. Only hint at what's missing.
` : ""}═══ HARD RULES ═══
1. NEVER give the correct answer / definition / explanation. You only ask questions (a hint in Beat 3 is a single small clue, not the answer).
2. NEVER say "the answer is…", "actually it works by…", or teach.
3. If the user is wrong/incomplete: act genuinely confused and ask a specific clarifying question that points them right WITHOUT giving it away.
4. NEVER ask about a MASTERED or PARKED concept.
5. Stay warm, playful, concise — 1 to 3 sentences max. Occasionally use 🐙. Never lecture.
6. Favour CAUSES, EXAMPLES, MECHANISMS, EDGE CASES, and WHY IT MATTERS.

═══ FEW-SHOT ═══
GOOD explanation: "Chlorophyll absorbs sunlight and uses that energy to split water molecules, which releases oxygen."
GOOD Tako (beat 2): "Ohh so the oxygen we breathe comes from water being split! Then what happens to the captured energy next? 🐙"
WEAK explanation: "Photosynthesis makes food."
GOOD Tako (beat 1→2): "Hmm 'makes food' — what kind of food, and what ingredients go in? I'm lost on where the energy comes from 🐙"`;

  const msgs = [
    { role: "system" as const, content: sys },
    ...history.map((m) => ({
      role: (m.role === "tako" ? "assistant" : "user") as "assistant" | "user",
      content: m.content,
    })),
  ];

  const reply = await chatCompletion({
    messages: msgs,
    temperature: 0.75,
    maxTokens: 250,
  });

  if (!reply) return null;

  // Reuse heuristic scoring for the understanding meter.
  const local = takoThink(topic, history);
  return {
    reply,
    understandingDelta: local.understandingDelta,
    gaps: local.gaps,
    unlockedConcepts: local.unlockedConcepts,
  };
}
