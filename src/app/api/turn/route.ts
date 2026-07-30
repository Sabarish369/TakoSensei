import { takoThink, takoThinkLLM, type Msg } from "@/lib/tako";
import { gradeTurn } from "@/lib/grader";
import { classifyIntent } from "@/lib/intent";
import { detectBlab } from "@/lib/strikes";
import {
  advanceFocusBeat,
  applyJudgmentToState,
  isConceptMasteredFully,
  normalizeConceptState,
  phaseForAttempts,
  recordConceptAttempt,
  type ConceptStates,
} from "@/lib/mastery";
import { echoShare } from "@/lib/echo";
import { buildProgress } from "@/lib/progress";

export const dynamic = "force-dynamic";

function normalizeConcepts(concepts: any[]) {
  return (concepts || []).map((c: any) => ({
    ...c,
    name: c.name || c.label || "Concept",
    status: c.status || (c.unlocked ? "mastered" : "locked"),
    weight: c.weight ?? 0.2,
  }));
}

function findMatchingConceptIndex(
  concepts: { name: string }[],
  target: string
): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);

  const targetTokens = new Set(norm(target));
  if (targetTokens.size === 0) return -1;

  let bestIdx = -1;
  let bestScore = 0;

  concepts.forEach((c, i) => {
    const nameLower = c.name.toLowerCase();
    const targetLower = target.toLowerCase();
    let score = 0;
    if (nameLower === targetLower) score = 1;
    else if (nameLower.includes(targetLower) || targetLower.includes(nameLower))
      score = 0.9;
    else {
      const cTokens = norm(c.name);
      if (cTokens.length === 0) return;
      const overlap = cTokens.filter((t) => targetTokens.has(t)).length;
      score = overlap / Math.max(cTokens.length, targetTokens.size);
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  });

  return bestScore >= 0.34 ? bestIdx : -1;
}

/**
 * Stateless teaching turn. The client sends the full session state; we
 * compute the next state and hand it straight back. No database.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const content = String(body?.content ?? "").trim();
    if (!content) {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }

    const topic = String(body?.topic ?? "Study Topic");
    const notes: string | null = body?.notes ?? null;
    const sessionComplete = body?.sessionComplete === true;
    const priorMessages: { role: "user" | "tako"; content: string; meta?: any }[] =
      Array.isArray(body?.messages) ? body.messages : [];

    const intent = classifyIntent(content);

    const lastTakoRecord = [...priorMessages].reverse().find((m) => m.role === "tako");
    const lastTakoMeta = (lastTakoRecord?.meta ?? {}) as {
      focus?: string | null;
      followUpKind?: "mechanism" | "transfer" | "boundary" | null;
      hintGiven?: boolean;
    };

    const hist: Msg[] = [
      ...priorMessages.map((m) => ({
        role: (m.role === "tako" ? "tako" : "user") as "tako" | "user",
        content: m.content,
      })),
      { role: "user" as const, content },
    ];

    const currentConcepts = normalizeConcepts(body?.concepts ?? []);
    const ctxConcepts = currentConcepts.map((c) => c.name);
    const alreadyMastered = currentConcepts
      .filter((c) => c.status === "mastered")
      .map((c) => c.name);

    // ── 1) INTENT GATE → EVALUATOR ──
    const preFocus = lastTakoMeta.focus ?? null;
    const focusConceptData = preFocus
      ? (currentConcepts.find((c) => c.name === preFocus) as any)
      : null;

    const grade =
      sessionComplete || intent !== "explanation"
        ? null
        : await gradeTurn({
            topic,
            notes,
            concepts: ctxConcepts,
            alreadyMastered,
            userText: content,
            lastTakoText: lastTakoRecord?.content ?? "",
            hintGivenThisConcept: lastTakoMeta.hintGiven === true,
            recentContext: hist.slice(-6, -1),
            markScheme: focusConceptData?.markScheme ?? undefined,
            commandWord: focusConceptData?.commandWord ?? undefined,
          });

    // ── 2) PER-CONCEPT STATE MACHINE ──
    const prevStates: ConceptStates = (body?.conceptStates as ConceptStates) ?? {};
    const conceptStates: ConceptStates = {};
    for (const c of currentConcepts) {
      conceptStates[c.name] = normalizeConceptState(prevStates[c.name]);
    }

    type Judg = {
      name: string;
      award: boolean;
      accuracy: 0 | 1 | 2;
      nextQuestion: string | null;
      missing: string[];
    };
    const judgedByConcept = new Map<string, Judg>();
    for (const j of grade?.judgments ?? []) {
      const idx = findMatchingConceptIndex(currentConcepts, j.concept);
      if (idx < 0) continue;
      const name = currentConcepts[idx].name;
      judgedByConcept.set(name, {
        name,
        award: j.award,
        accuracy: j.accuracyScore,
        nextQuestion: j.nextQuestion ?? null,
        missing: j.missingPieces ?? [],
      });
    }

    const newlyMastered: string[] = [];
    const newlySkipped: string[] = [];
    const nextTurnIndex = priorMessages.length + 1;

    for (const c of currentConcepts) {
      let st = conceptStates[c.name];
      const j = judgedByConcept.get(c.name);
      if (j) {
        const askedFollowUpKind =
          lastTakoMeta.focus === c.name ? lastTakoMeta.followUpKind ?? null : null;
        st = applyJudgmentToState(
          st,
          j.award,
          j.accuracy,
          nextTurnIndex,
          askedFollowUpKind
        );
        st = recordConceptAttempt(st, true);
      }
      const wasMastered = isConceptMasteredFully(
        normalizeConceptState(prevStates[c.name])
      );
      if (!wasMastered && isConceptMasteredFully(st)) newlyMastered.push(c.name);
      if (!normalizeConceptState(prevStates[c.name]).skipped && st.skipped) {
        newlySkipped.push(c.name);
      }
      conceptStates[c.name] = st;
    }

    const updatedConcepts = currentConcepts.map((c) => {
      const st = conceptStates[c.name];
      if (isConceptMasteredFully(st) && c.status !== "mastered") {
        return { ...c, status: "mastered" as const };
      }
      return c;
    });

    let progress = buildProgress(updatedConcepts, conceptStates);
    let newUnderstanding = progress.completion;

    // ── 3) STRIKES ──
    const recentUserTexts = hist
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .slice(-3, -1);
    const primaryJudgment = grade?.judgments?.[0] ?? null;
    const verdict =
      sessionComplete || intent === "question" || intent === "meta"
        ? { isStrike: false, kind: "none" as const, reason: null }
        : intent === "disengaged"
        ? { isStrike: true, kind: "filler" as const, reason: "Non-answer." }
        : detectBlab({
            userText: content,
            notes,
            recentUserTexts,
            relevantFromGrader: grade ? grade.relevant : null,
            rubric: primaryJudgment,
          });

    const totalStrongPass = (grade?.judgments ?? []).some(
      (j) => j.masteryLevel === 3
    );
    let strikes = Number(body?.strikes ?? 0);
    if (totalStrongPass) strikes = Math.max(0, strikes - 1);
    else if (verdict.isStrike) strikes = Math.min(3, strikes + 1);

    // ── 4) END-STATE ──
    const allMastered =
      currentConcepts.length > 0 &&
      currentConcepts.every((c) => isConceptMasteredFully(conceptStates[c.name]));
    const allResolved =
      currentConcepts.length > 0 &&
      currentConcepts.every((c) => {
        const s = conceptStates[c.name];
        return isConceptMasteredFully(s) || s.skipped;
      });

    type EndState = "victory" | "disqualified" | "completed" | null;
    let endState: EndState = null;
    let endMessage: string | null = null;

    if (allResolved) {
      progress = { ...progress, completion: 100 };
      newUnderstanding = 100;
    }

    if (!sessionComplete && allMastered) {
      endState = "victory";
      endMessage = `Sensei… I think I actually understand everything now! You taught me every concept on the list — my brain is full! 🐙 I'm ready for the test!`;
    } else if (!sessionComplete && strikes >= 3) {
      endState = "disqualified";
      endMessage = `Sensei… I think maybe today isn't the best day for studying. That's okay! Come back when you're ready and we'll pick up where we left off. I'll save your progress! 🐙`;
    } else if (!sessionComplete && allResolved) {
      endState = "completed";
      const gotNames = currentConcepts
        .filter((c) => isConceptMasteredFully(conceptStates[c.name]))
        .map((c) => c.name);
      const parkNames = currentConcepts
        .filter((c) => conceptStates[c.name].skipped)
        .map((c) => c.name);
      if (gotNames.length > 0) {
        endMessage = `We covered a lot today, Sensei! You helped me really get ${
          gotNames.length <= 2
            ? gotNames.join(" and ")
            : gotNames.slice(0, -1).join(", ") + " and " + gotNames.slice(-1)
        }. ${
          parkNames.length
            ? `The trickier bits can wait for next time — that's totally normal. 🐙`
            : `🐙`
        }`;
      } else {
        endMessage = `You gave it a real go today, Sensei, and that matters. Nothing fully clicked yet, and that's okay — your report pinpoints the perfect place to start next time. 🐙`;
      }
    }

    // ── 5) TAKO'S REPLY ──
    let takoContent: string;
    let gapsOut: string[] = [];
    let unlockedOut: string[] = [];
    let focusOut: string | null = null;
    let focusPhaseOut: 0 | 1 | 2 = 0;
    let formalFollowUpKind: "mechanism" | "transfer" | "boundary" | null = null;
    let hintGiven = false;
    const priorAskedList: { conceptName?: string; beat?: number; text?: string }[] =
      Array.isArray(body?.askedQuestions) ? body.askedQuestions : [];
    let updatedAskedQuestions = priorAskedList;

    if (endState) {
      takoContent = endMessage as string;
    } else {
      const activeList = currentConcepts
        .filter((c) => {
          const s = conceptStates[c.name];
          return !isConceptMasteredFully(s) && !s.skipped;
        })
        .map((c) => c.name);
      const skippedList = currentConcepts
        .filter((c) => conceptStates[c.name].skipped)
        .map((c) => c.name);
      const masteredList = currentConcepts
        .filter((c) => isConceptMasteredFully(conceptStates[c.name]))
        .map((c) => c.name);

      let focus: string | null = null;
      if (grade?.conceptAddressed) {
        const idx = findMatchingConceptIndex(currentConcepts, grade.conceptAddressed);
        const nm = idx >= 0 ? currentConcepts[idx].name : null;
        if (nm && activeList.includes(nm)) focus = nm;
      }
      if (!focus) focus = activeList[0] ?? null;

      // Monotonic beat advancement — makes infinite loops impossible.
      if (focus && intent === "explanation" && !judgedByConcept.has(focus)) {
        conceptStates[focus] = advanceFocusBeat(conceptStates[focus]);
        if (conceptStates[focus].skipped) {
          newlySkipped.push(focus);
          const nextActive = activeList.filter((n) => n !== focus);
          focus = nextActive[0] ?? null;
        }
      }

      const focusState = focus ? conceptStates[focus] : null;
      focusPhaseOut = focusState ? phaseForAttempts(focusState.attempts) : 0;
      const focusJudg = focus ? judgedByConcept.get(focus) : undefined;
      focusOut = focus;

      const needsRetentionFollowUp =
        !!focus &&
        !!focusState?.correctOnce &&
        !focusState.followUpPassed &&
        !focusState.skipped;
      formalFollowUpKind = needsRetentionFollowUp
        ? lastTakoMeta.followUpKind === "transfer"
          ? "boundary"
          : "transfer"
        : null;
      hintGiven = !formalFollowUpKind && focusPhaseOut === 2;

      const priorAsked = priorAskedList
        .filter((q) => q.conceptName === focus)
        .map((q) => `- (beat ${q.beat ?? "?"}) "${(q.text ?? "").slice(0, 120)}"`)
        .join("\n");

      if (intent === "question") {
        takoContent = `Good question, Sensei. 🐙 I don't want to give the answer away — which part would you like to try explaining in your own words?`;
      } else if (intent === "meta") {
        takoContent = `No problem, Sensei. Whenever you're ready, teach me one small idea from the material in your own words. 🐙`;
      } else if (intent === "disengaged") {
        takoContent = `I'm still here with you, Sensei. 🐙 Try just one small idea in your own words — even a rough start is enough.`;
      } else {
        const llm = await takoThinkLLM(topic, hist, {
          notes,
          concepts: ctxConcepts,
          mastered: masteredList,
          active: activeList,
          skipped: skippedList,
          focusConcept: focus,
          focusPhase: focusPhaseOut,
          focusNextQuestion: focusJudg?.nextQuestion ?? null,
          focusMissing: focusJudg?.missing ?? [],
          justMastered: newlyMastered[0] ?? null,
          justSkipped: newlySkipped[0] ?? null,
          formalFollowUpKind,
          intent,
          priorQuestions: priorAsked || undefined,
          examCraft: grade?.examCraft ?? null,
        });
        const think = llm ?? takoThink(topic, hist);
        takoContent = think.reply;
        gapsOut = think.gaps;
        unlockedOut = think.unlockedConcepts;

        // Loop detector — force a pivot if Tako repeats himself.
        const lastTakoContent = lastTakoRecord?.content ?? "";
        if (
          lastTakoContent.length > 20 &&
          echoShare(takoContent, lastTakoContent) > 0.7
        ) {
          if (focus) {
            conceptStates[focus] = advanceFocusBeat(conceptStates[focus]);
            if (conceptStates[focus].skipped && !newlySkipped.includes(focus)) {
              newlySkipped.push(focus);
            }
          }
          const nextActive = currentConcepts
            .filter((c) => {
              const s = conceptStates[c.name];
              return !isConceptMasteredFully(s) && !s.skipped;
            })
            .map((c) => c.name)
            .filter((n) => n !== focus);
          const pivotTarget = nextActive[0] ?? null;
          takoContent = pivotTarget
            ? `Hmm, I think I keep asking the same thing. Let me switch gears! 🐙 Can you teach me about ${pivotTarget} instead?`
            : `I think we've covered everything I can ask about right now! 🐙 Let's see how we did.`;
          focusOut = pivotTarget;
        }
      }

      const newAskedEntry = focus
        ? { conceptName: focus, beat: focusPhaseOut, text: takoContent.slice(0, 200) }
        : null;
      updatedAskedQuestions = [
        ...priorAskedList,
        ...(newAskedEntry ? [newAskedEntry] : []),
      ].slice(-15) as any;
    }

    const gradeMeta = grade
      ? {
          concept: grade.conceptAddressed,
          masteryLevel: grade.masteryLevel,
          awarded: grade.shouldAwardProgress,
          awardedConcepts: grade.awardedConcepts,
          reason: grade.reason,
          missingPieces: grade.missingPieces,
          nextQuestion: grade.nextQuestion,
          judgments: grade.judgments,
          examCraft: grade.examCraft,
          status: grade.status,
        }
      : undefined;

    return Response.json({
      // The two new chat bubbles for the client to append.
      userMessage: { role: "user", content },
      takoMessage: {
        role: "tako",
        content: takoContent,
        meta: {
          gaps: gapsOut,
          unlocked: unlockedOut,
          grade: gradeMeta,
          focus: focusOut,
          focusPhase: focusPhaseOut,
          followUpKind: formalFollowUpKind,
          hintGiven,
          intent,
          ...(endState ? { ending: endState } : {}),
        },
      },
      // Next state for the client to persist.
      state: {
        concepts: updatedConcepts,
        conceptStates,
        askedQuestions: updatedAskedQuestions,
        strikes,
        understanding: newUnderstanding,
        endState,
        status: endState ? "completed" : "active",
      },
      understanding: newUnderstanding,
      progress,
      gaps: gapsOut,
      concepts: updatedConcepts,
      grade: gradeMeta ?? null,
      strikes,
      strikeWarning: verdict.isStrike ? strikes : 0,
      strikeVerdict: verdict.isStrike ? verdict.kind : null,
      endState,
      endMessage,
      sessionComplete: sessionComplete || !!endState,
      newlyMastered,
      newlySkipped,
    });
  } catch {
    return Response.json({ error: "Failed to reply" }, { status: 500 });
  }
}
