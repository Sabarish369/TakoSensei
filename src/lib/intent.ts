/**
 * Fast deterministic intent gate.
 *
 * Only "explanation" reaches the evaluator and consumes a concept attempt.
 * Clarification questions and app-level requests skip grading entirely.
 *
 * Critical: hedged explanations phrased as questions ("So is it because the
 * force increases?") are explanations, not questions. Missing this causes
 * infinite loops where real answers skip grading and Tako re-asks.
 *
 * With `opts`, two extra non-answer intents are detected:
 *  - "copied"    → verbatim notes paste (5-gram overlap above threshold)
 *  - "off_topic" → substantive text that shares almost nothing with the topic
 */
import { COPY_THRESHOLD, verbatimOverlap } from "./copypaste";

export type Intent =
  | "explanation"
  | "question"
  | "meta"
  | "disengaged"
  | "copied"
  | "off_topic";

const FILLER =
  /^(?:idk|i don'?t know|dunno|nothing|no idea|nope|nah|whatever|next|skip|i give up|you tell me|just tell me|just give me|\. +|\.+|\?+)$/i;
const META =
  /^(?:upload|re-?upload|restart|reset|start over|new session|new topic|change topic|exit|go back)\b/i;
const HEDGE =
  /^(?:so|i think|is it|would it be|does that mean|maybe|isn'?t it|because|it'?s because|that'?s because|i believe|i guess|from what i)\b/i;

const STOP = new Set([
  "the", "and", "that", "this", "with", "from", "have", "what", "when",
  "where", "which", "their", "there", "about", "into", "does", "will",
  "would", "could", "should", "because", "therefore",
]);

function looksLikeKeyboardMash(text: string) {
  const letters = text.replace(/[^a-z]/gi, "");
  if (letters.length < 4) return false;
  const vowels = (letters.match(/[aeiou]/gi) ?? []).length;
  return !/\s/.test(text) && vowels / letters.length < 0.14;
}

function topicOverlap(text: string, keywords: string[]): number {
  const kw = new Set(
    keywords
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3 && !STOP.has(w))
  );
  if (kw.size === 0) return 1; // nothing to compare → assume on-topic
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
  if (tokens.length === 0) return 0;
  const hits = tokens.filter((w) => kw.has(w)).length;
  return hits / tokens.length;
}

export function classifyIntent(
  text: string,
  opts?: { notes?: string | null; keywords?: string[] }
): Intent {
  const t = text.trim();
  if (!t || looksLikeKeyboardMash(t) || FILLER.test(t)) return "disengaged";
  if (META.test(t)) return "meta";

  const words = t.split(/\s+/).filter(Boolean).length;

  // A hedged or substantive "question" that carries content is an explanation
  // attempt, not a clarification query. This prevents real answers from
  // being silently skipped and causing Tako to loop.
  const baseExplanation = HEDGE.test(t) || words > 12;

  if (baseExplanation || words >= 4) {
    // Copy detection: verbatim notes paste is not an attempt.
    if (opts?.notes && verbatimOverlap(t, opts.notes) >= COPY_THRESHOLD) {
      return "copied";
    }
    // Off-topic detection: substantive text that barely touches the topic.
    if (
      baseExplanation &&
      opts?.keywords &&
      topicOverlap(t, opts.keywords) < 0.1
    ) {
      return "off_topic";
    }
  }

  if (baseExplanation) return "explanation";

  // Only short, pure clarification questions skip grading.
  const isQuestion = /\?$/.test(t);
  if (isQuestion && words <= 12) return "question";

  if (words < 4) return "disengaged";
  return "explanation";
}
