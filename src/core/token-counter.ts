/**
 * Rough token estimation (4 chars ≈ 1 token for English, ~2 chars ≈ 1 token for CJK).
 * This is a heuristic — not exact.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Count CJK characters
  const cjkCount = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
  const nonCjkLength = text.length - cjkCount;
  return Math.ceil(nonCjkLength / 4) + Math.ceil(cjkCount / 2);
}

export function truncateToTokens(text: string, maxTokens: number): string {
  const estimated = estimateTokens(text);
  if (estimated <= maxTokens) return text;

  // Rough ratio
  const ratio = maxTokens / estimated;
  const targetChars = Math.floor(text.length * ratio * 0.9); // 10% safety margin
  return text.slice(0, targetChars) + '\n[... truncated]';
}
