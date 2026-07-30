/**
 * Converts formal exam-style questions into conversational, study-buddy phrasing.
 * Keeps the rigor of the mark scheme while making Tako feel like a smart classmate.
 */
import type { ExamQuestion, CommandWord } from "@/lib/questionBank";

/** Turn a formal exam question into a conversational one, based on command word. */
export function makeConversational(question: ExamQuestion): string {
  const { commandWord, questionText } = question;
  let q = questionText
    // Strip trailing mark notation like "[4 marks]"
    .replace(/\s*\[\s*\d+\s*marks?\s*\]\s*$/i, "")
    .trim();

  q = q
    .replace(/^Define\s+/i, "What is ")
    .replace(/^State\s+/i, "")
    .replace(/^List\s+/i, "List ")
    .replace(/^Name\s+/i, "Name ")
    .replace(/^Identify\s+/i, "")
    .replace(/^Describe\s+/i, "")
    .replace(/^Explain\s+/i, "")
    .replace(/^Outline\s+/i, "")
    .replace(/^Discuss\s+/i, "Talk about ")
    .replace(/^Analyze\s+/i, "")
    .replace(/^Assess\s+/i, "");

  switch (commandWord as CommandWord) {
    case "define":
      if (!/^what is/i.test(q)) q = `What is ${q.toLowerCase()}`;
      break;

    case "state":
    case "describe":
      if (!/^(what|when|where|name|list)/i.test(q)) {
        q = `What happens ${q.toLowerCase()}`;
      }
      break;

    case "explain":
      if (!/\b(how|why)\b/i.test(q)) {
        q = `How does ${q.toLowerCase()}`;
      }
      break;

    case "compare":
      if (!/difference/i.test(q)) {
        q = `What's the difference between ${q.toLowerCase()}`;
      }
      break;

    case "evaluate":
    case "discuss":
      if (/statement|claim/i.test(q) && !/^is this true/i.test(q)) {
        q = `Is this true: ${q.replace(/^(this statement:|the claim that)/i, "").trim()}?`;
      } else if (!/\?$/.test(q)) {
        q = `${q.charAt(0).toUpperCase() + q.slice(1)}`;
      }
      break;

    default:
      break;
  }

  // Normalize spacing and ensure it ends as a question.
  q = q.replace(/\s+/g, " ").trim();
  if (!/[?]/.test(q)) q += "?";
  return q.charAt(0).toUpperCase() + q.slice(1);
}

/** Visual mark hint with the target emoji. */
export function markHint(totalMarks: number): string {
  return `🎯 ${totalMarks} mark${totalMarks > 1 ? "s" : ""}`;
}
