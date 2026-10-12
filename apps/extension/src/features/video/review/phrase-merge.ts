/** Text/revision projection for a pair whose owner already admitted adjacency and origin. */
export function mergedReviewPhraseFields(
  left: { end: number; text: string; originalText: string; revision: number },
  right: { end: number; text: string; originalText: string; revision: number }
) {
  return {
    end: right.end,
    text: [left.text, right.text].filter(Boolean).join(' '),
    originalText: [left.originalText, right.originalText].filter(Boolean).join(' '),
    revision: Math.max(left.revision, right.revision) + 1,
  };
}
