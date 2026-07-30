/**
 * Verbatim-copy detection using 5-gram overlap.
 * Shared technical vocabulary is safe; long unbroken phrase reuse is not.
 */
function ngrams(text: string, n = 5): Set<string> {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) {
    out.add(words.slice(i, i + n).join(" "));
  }
  return out;
}

export function verbatimOverlap(userText: string, notes: string): number {
  const user = ngrams(userText);
  if (user.size < 6) return 0; // too short to judge fairly
  const source = ngrams(notes);
  let hits = 0;
  user.forEach((gram) => {
    if (source.has(gram)) hits++;
  });
  return hits / user.size;
}

export const COPY_THRESHOLD = 0.35;
