/**
 * Quick Review Agent — a dedicated module that surfaces the exact relevant
 * portion of the student's own notes when they need help. It never gives
 * hints or partial answers; it never rewrites Tako's question. It simply
 * extracts and formats a short passage from the uploaded notes so the
 * student can refresh their memory and try answering the ORIGINAL question.
 */

import { chatCompletion } from "../ai";

const QUICK_REVIEW_PROMPT = `You are Tako's QUICK REVIEW module. Your ONLY job is to extract and format the most relevant passage from the student's uploaded notes for the current concept, so they can refresh their memory and attempt the ORIGINAL question again.

STRICT RULES:
1. Use ONLY the content in NOTES_EXCERPT — never invent facts, definitions, or examples of your own.
2. Do NOT hint, coach, outline, restructure, or paraphrase into an answer. Just present the relevant notes.
3. Do NOT restate, rewrite, or acknowledge the question. The question stays exactly as Tako asked it.
4. Keep it tight: under ~120 words. If notes are longer, choose the passage most relevant to CONCEPT_NAME.
5. Format for fast reading — short lines, bullet points, bold headings — but keep the exact wording from the notes.
6. End with a single short line that returns focus to the ORIGINAL question, e.g. "Read this, then try Tako's question in your own words."

OUTPUT: plain text (light markdown allowed). No preamble, no meta-commentary.`;

/**
 * Generate a Quick Review passage from the student's notes.
 * The response is ready to render directly inside the Mini-Lesson modal.
 */
export async function generateQuickReview(
  conceptName: string,
  notesExcerpt: string
): Promise<string> {
  const trimmedNotes = (notesExcerpt || "").trim();

  if (!trimmedNotes) {
    return `No notes were uploaded for this session, so there's nothing to review here. Take a breath, then try Tako's question in your own words.`;
  }

  const reply = await chatCompletion({
    messages: [
      { role: "system", content: QUICK_REVIEW_PROMPT },
      {
        role: "user",
        content: `CONCEPT_NAME: ${conceptName}\n\nNOTES_EXCERPT:\n${trimmedNotes}`,
      },
    ],
    temperature: 0.2,
    maxTokens: 320,
  });

  if (reply && reply.trim().length > 0) return reply.trim();

  // Deterministic fallback: return the notes excerpt unchanged, with a
  // gentle prompt back to the original question. No hints, no coaching.
  return `**Quick Review — ${conceptName}**\n\n${trimmedNotes}\n\nRead this, then try Tako's question in your own words.`;
}
