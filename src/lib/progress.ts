import {
  initConceptState,
  isConceptMasteredFully,
  normalizeConceptState,
  type ConceptState,
  type ConceptStates,
} from "./mastery";

export type ProgressConcept = {
  name: string;
  weight?: number;
  status?: string;
};

export type PerConceptProgress = {
  name: string;
  value: number;
  state: "mastered" | "developing" | "parked" | "attempted" | "new";
};

function weightOf(concept: ProgressConcept): number {
  const w = typeof concept.weight === "number" ? concept.weight : 0.2;
  return Number.isFinite(w) && w > 0 ? w : 0.2;
}

function stateFor(concept: ProgressConcept, states: ConceptStates): ConceptState {
  return normalizeConceptState(states?.[concept.name] ?? initConceptState());
}

/**
 * Mastery progress: "How much does the user truly understand?"
 * This moves continuously on partial proof, but only reaches 100 when every
 * concept is fully mastered. Parked concepts receive partial credit only.
 */
export function conceptProgress(st: ConceptState): number {
  if (isConceptMasteredFully(st)) return 1.0;
  if (st.skipped) return 0.5;
  if (st.followUpPassed) return 0.85;
  if (st.correctOnce) return 0.6;
  if (st.hadError && st.errorCorrected) return 0.4;
  if (st.attempts > 0 && !st.hadError) return 0.3;
  if (st.attempts > 0) return 0.15;
  return 0;
}

/** A concept is resolved when the session is done asking about it. */
export function isResolved(st: ConceptState): boolean {
  return isConceptMasteredFully(st) || st.skipped;
}

/**
 * Completion progress: "How far through the session are we?"
 * A resolved concept (mastered OR parked) counts as full completion weight.
 * Therefore if all concepts are resolved, this is exactly 100.
 */
export function completionProgress(
  concepts: ProgressConcept[],
  states: ConceptStates
): number {
  const totalWeight = concepts.reduce((sum, c) => sum + weightOf(c), 0);
  if (totalWeight <= 0) return 0;

  const doneWeight = concepts.reduce((sum, c) => {
    const st = stateFor(c, states);
    return sum + (isResolved(st) ? weightOf(c) : 0);
  }, 0);

  return Math.round((doneWeight / totalWeight) * 100);
}

export function sessionProgress(
  concepts: ProgressConcept[],
  states: ConceptStates
): number {
  const totalWeight = concepts.reduce((sum, c) => sum + weightOf(c), 0);
  if (totalWeight <= 0) return 0;

  const earned = concepts.reduce((sum, c) => {
    const st = stateFor(c, states);
    return sum + conceptProgress(st) * weightOf(c);
  }, 0);

  return Math.round((earned / totalWeight) * 100);
}

export function masteredCount(
  concepts: ProgressConcept[],
  states: ConceptStates
): number {
  return concepts.filter((c) => isConceptMasteredFully(stateFor(c, states))).length;
}

export function resolvedCount(
  concepts: ProgressConcept[],
  states: ConceptStates
): number {
  return concepts.filter((c) => isResolved(stateFor(c, states))).length;
}

export function labelState(st: ConceptState): PerConceptProgress["state"] {
  if (isConceptMasteredFully(st)) return "mastered";
  if (st.skipped) return "parked";
  if (st.correctOnce || st.followUpPassed) return "developing";
  if (st.attempts > 0) return "attempted";
  return "new";
}

export function buildProgress(concepts: ProgressConcept[], states: ConceptStates) {
  const normalizedStates: ConceptStates = states ?? {};
  const completion = completionProgress(concepts, normalizedStates);
  const mastery = sessionProgress(concepts, normalizedStates);
  const allResolved = concepts.length > 0 && resolvedCount(concepts, normalizedStates) === concepts.length;

  return {
    completion: allResolved ? 100 : completion,
    mastery,
    resolvedCount: resolvedCount(concepts, normalizedStates),
    masteredCount: masteredCount(concepts, normalizedStates),
    totalConcepts: concepts.length,
    perConcept: concepts.map((c) => {
      const st = stateFor(c, normalizedStates);
      return {
        name: c.name,
        value: Math.round(conceptProgress(st) * 100),
        state: labelState(st),
      } satisfies PerConceptProgress;
    }),
  };
}
