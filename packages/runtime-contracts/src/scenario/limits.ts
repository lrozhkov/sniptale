/** Resource ceilings for a guide document, excluding separately stored image bytes. */
export const GUIDE_LIMITS = {
  minBlockWidthPercent: 20,
  maxNumberLabelLength: 32,
  maxRestartNumber: 9999,
  maxItems: 300,
  maxBlocksPerStep: 200,
  maxParagraphs: 200,
  maxRunsPerParagraph: 200,
  maxIdLength: 160,
  maxLabelLength: 160,
  maxTextLength: 20_000,
  maxTags: 30,
  maxDimension: 7_680,
  maxCoordinate: 100_000,
  maxInputDepth: 16,
  maxInputVisits: 100_000,
  maxInputTextLength: 4_000_000,
} as const;
