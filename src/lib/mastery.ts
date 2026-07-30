/**
 * Strict 3-condition mastery tracking + a per-concept ATTEMPT BUDGET,
 * persisted across turns in `sessions.concept_states`.
 *
 * Mastery conditions:
 *   1 — Logical accuracy: evaluator confirms a strong explanation.
 *   2 — Real follow-up: a later turn answers a deliberately different
 *       question type (mechanism / transfer / boundary).
 *   3 — Integrity: no uncorrected major error is on record.
 */

export const MAX_CONCEPT_ATTEMPTS = 4;
export type FollowUpKind = "mechanism" | "transfer" | "boundary";

export type ConceptState = {
  correctOnce: boolean;
  correctOnTurn: number | null; // message id of first strong pass
  followUpPassed: boolean;
  followUpKind: FollowUpKind | null;
  hadError: boolean;
  errorCorrected: boolean;
  attempts: number;
  skipped: boolean;
};

export type ConceptStates = Record<string, ConceptState>;

export function initConceptState(): ConceptState {
  return {
    correctOnce: false,
    correctOnTurn: null,
    followUpPassed: false,
    followUpKind: null,
    hadError: false,
    errorCorrected: false,
    attempts: 0,
    skipped: false,
  };
}

/** Tolerate persisted state from earlier versions of the state machine. */
export function normalizeConceptState(raw: unknown): ConceptState {
  const base = initConceptState();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<ConceptState>;
  const kind =
    r.followUpKind === "mechanism" ||
    r.followUpKind === "transfer" ||
    r.followUpKind === "boundary"
      ? r.followUpKind
      : null;
  return {
    correctOnce: r.correctOnce === true,
    correctOnTurn:
      typeof r.correctOnTurn === "number" ? r.correctOnTurn : null,
    followUpPassed: r.followUpPassed === true,
    followUpKind: kind,
    hadError: r.hadError === true,
    errorCorrected: r.errorCorrected === true,
    attempts: typeof r.attempts === "number" ? Math.max(0, r.attempts) : 0,
    skipped: r.skipped === true,
  };
}

export function isConceptMasteredFully(st: ConceptState | undefined): boolean {
  if (!st) return false;
  return (
    st.correctOnce &&
    st.followUpPassed &&
    (!st.hadError || st.errorCorrected)
  );
}

export function phaseForAttempts(attempts: number): 0 | 1 | 2 {
  return Math.min(Math.max(0, attempts), 2) as 0 | 1 | 2;
}

/**
 * Apply a grader outcome. `askedFollowUpKind` is read from the prior TAKO
 * message metadata, so a second strong answer only counts if it was truly a
 * response to a later, differently framed follow-up.
 */
export function applyJudgmentToState(
  st: ConceptState,
  passedRubric: boolean,
  accuracyScore: 0 | 1 | 2,
  turnIndex: number,
  askedFollowUpKind: FollowUpKind | null
): ConceptState {
  let next = { ...st };

  if (accuracyScore === 0) {
    // Major wrong claim: it remains on record until a later strong pass.
    return { ...next, hadError: true, errorCorrected: false };
  }

  if (!passedRubric) return next;

  // A strong answer can revive a parked concept if the user voluntarily
  // returns to it later. It gets one final chance, not a full reset.
  if (next.skipped) {
    next = {
      ...next,
      skipped: false,
      attempts: Math.max(0, MAX_CONCEPT_ATTEMPTS - 1),
    };
  }

  // First pass arms the retention check. It NEVER completes mastery itself.
  if (!next.correctOnce) {
    return {
      ...next,
      correctOnce: true,
      correctOnTurn: turnIndex,
      errorCorrected: next.hadError ? true : next.errorCorrected,
    };
  }

  // A real follow-up must happen on a later message AND be marked in the
  // preceding Tako message as a deliberately different question kind.
  const isLaterTurn =
    next.correctOnTurn !== null && turnIndex > next.correctOnTurn;
  if (isLaterTurn && askedFollowUpKind !== null) {
    return {
      ...next,
      followUpPassed: true,
      followUpKind: askedFollowUpKind,
      errorCorrected: next.hadError ? true : next.errorCorrected,
    };
  }

  return {
    ...next,
    errorCorrected: next.hadError ? true : next.errorCorrected,
  };
}

/** Consume an attempt only on a genuine evaluator-scored explanation. */
export function recordConceptAttempt(
  st: ConceptState,
  judgedThisTurn: boolean
): ConceptState {
  if (!judgedThisTurn) return st;
  const attempts = Math.min(st.attempts + 1, MAX_CONCEPT_ATTEMPTS);
  const next = { ...st, attempts };
  return {
    ...next,
    skipped:
      !isConceptMasteredFully(next) && attempts >= MAX_CONCEPT_ATTEMPTS,
  };
}

/**
 * Monotonic beat advancement for the FOCUS concept — guaranteed to fire on
 * every explanation turn regardless of whether the grader matched the
 * concept. This makes infinite loops structurally impossible: N explanation
 * turns on one concept → parked → forced pivot.
 */
export function advanceFocusBeat(st: ConceptState): ConceptState {
  if (st.skipped || isConceptMasteredFully(st)) return st;
  const attempts = Math.min(st.attempts + 1, MAX_CONCEPT_ATTEMPTS);
  return {
    ...st,
    attempts,
    skipped: attempts >= MAX_CONCEPT_ATTEMPTS && !isConceptMasteredFully(st),
  };
}
