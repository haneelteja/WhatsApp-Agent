export function heuristicConfidence(response: string): number | null {
  const lower = response.toLowerCase();

  const highUncertaintyPhrases = [
    "i don't know", "i do not know", "i'm not sure", "i am not sure",
    "i cannot answer", "i can't answer", "i don't have information",
    "i don't have that information", "i'm unable to", "i am unable to",
    "please contact", "please speak to", "i'll connect you",
  ];

  const partialUncertaintyPhrases = [
    "i'm not certain", "i believe", "i think", "as far as i know",
    "you may want to verify", "i'd recommend checking",
  ];

  if (highUncertaintyPhrases.some(p => lower.includes(p))) return 0.3;
  if (partialUncertaintyPhrases.some(p => lower.includes(p))) return 0.6;

  return null; // no heuristic signal — use the API scorer
}
