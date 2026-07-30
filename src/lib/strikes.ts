/**
 * "Blabbing" detection — strike rules. Critical: strikes are NEVER for
 * genuine struggle. Only disengagement (filler, off-topic, copy-paste,
 * repetition loop) counts.
 */

import { COPY_THRESHOLD, verbatimOverlap } from "./copypaste";

export type StrikeVerdict = {
  isStrike: boolean;
  kind:
    | "filler"
    | "off_topic"
    | "copy_paste"
    | "repetition"
    | "none";
  reason: string | null;
};

const FILLER_PATTERNS = [
  /^\s*(i don'?t? know|idk|no idea|nope|nah|uh+h?|um+m?|lol|lmao|whatever|skip|next|you tell me|just (tell|give) me|i give up|meh|k|ok|okay|test|hi|hello|yo|yes|no)\s*[.!?\s]*$/i,
  /^\s*[.?\s]*$/,
];

const MIN_MEANINGFUL_WORDS = 4;

function wordCount(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function detectBlab(args: {
  userText: string;
  notes: string | null;
  recentUserTexts: string[]; // last few user turns (excluding current)
  relevantFromGrader: boolean | null; // grader's relevance if available
  rubric?: { relevanceScore?: number; accuracyScore?: number; causalScore?: number } | null;
}): StrikeVerdict {
  const { userText, notes, recentUserTexts, relevantFromGrader, rubric } = args;
  const text = userText.trim();

  // ── Filler non-answer (very short / habitual non-responses) ──
  if (wordCount(text) <= MIN_MEANINGFUL_WORDS) {
    for (const p of FILLER_PATTERNS) {
      if (p.test(text)) {
        return {
          isStrike: true,
          kind: "filler",
          reason: "Zero educational content in response.",
        };
      }
    }
    // Extremely short + grader says irrelevant → also a strike
    if (wordCount(text) <= 2 && relevantFromGrader === false) {
      return { isStrike: true, kind: "filler", reason: "Non-answer." };
    }
  }

  // ── Completely off-topic (grader-based: relevance=0 AND user text is substantive) ──
  if (
    rubric &&
    rubric.relevanceScore === 0 &&
    relevantFromGrader === false &&
    wordCount(text) >= MIN_MEANINGFUL_WORDS
  ) {
    return {
      isStrike: true,
      kind: "off_topic",
      reason: "Entirely unrelated to the study material.",
    };
  }

  // ── Copy-paste detection: 5-gram overlap, not shared vocabulary ──
  // This catches pasted long phrases while letting students correctly reuse
  // necessary domain terms such as "mitochondrial matrix".
  if (notes && text.length >= 80) {
    const overlap = verbatimOverlap(text, notes);
    if (overlap >= COPY_THRESHOLD) {
      return {
        isStrike: true,
        kind: "copy_paste",
        reason: "Response appears to reproduce long phrases from the notes instead of explaining them.",
      };
    }
  }

  // ── Repetition loop (same wrong explanation 3x+) ──
  if (recentUserTexts.length >= 2) {
    const norm = normalize(text);
    if (norm.length >= 12) {
      let repeats = 0;
      for (const prev of recentUserTexts.slice(-2)) {
        const p = normalize(prev);
        if (!p) continue;
        // near-identical = 90% prefix/either containment
        if (
          p === norm ||
          (norm.length > 0 && p.length > 0 && (norm.includes(p) || p.includes(norm)) &&
            Math.min(p.length, norm.length) / Math.max(p.length, norm.length) > 0.9)
        ) {
          repeats++;
        }
      }
      if (repeats >= 2) {
        return {
          isStrike: true,
          kind: "repetition",
          reason: "Same message repeated without change.",
        };
      }
    }
  }

  return { isStrike: false, kind: "none", reason: null };
}
