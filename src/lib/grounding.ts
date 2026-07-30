/**
 * Deterministic source-grounding helpers.
 * A quote is displayable only when it can be found in the corpus it claims
 * to come from. Prompts are helpful, but code-level verification prevents
 * fabricated student quotes and invented note corrections.
 */
export function normalizeGroundedText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function quoteExistsInCorpus(quote: string, corpus: string[]): boolean {
  const normalized = normalizeGroundedText(quote);
  if (normalized.length < 12) return false;
  return corpus.some((source) =>
    normalizeGroundedText(source).includes(normalized)
  );
}
