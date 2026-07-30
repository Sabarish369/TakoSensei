/** Deterministic hint-echo guard for transfer scoring. */
const STOP = new Set([
  "the", "a", "an", "of", "and", "or", "to", "is", "in", "that", "it",
  "this", "because", "for", "with", "from", "as", "on", "by", "are", "be",
]);

function contentTokens(text: string) {
  return (text.toLowerCase().match(/[a-z][a-z-]{2,}/g) ?? []).filter(
    (token) => !STOP.has(token)
  );
}

/**
 * Share of user content words that appeared in Tako's immediately preceding
 * turn. A high score after a hint means the user likely repeated the clue.
 */
export function echoShare(userText: string, takoText: string): number {
  const user = contentTokens(userText);
  if (user.length < 8) return 0;
  const tako = new Set(contentTokens(takoText));
  return user.filter((word) => tako.has(word)).length / user.length;
}
