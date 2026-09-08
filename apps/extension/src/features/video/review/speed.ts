/** Supported source-time rates, shared by UI, durable parsing and export. */
export const REVIEW_SPEED_RATES = [0.0625, 0.125, 0.25, 0.5, 0.75, 1.25, 1.5, 2, 4, 8, 16] as const;
export type ReviewSpeedRate = (typeof REVIEW_SPEED_RATES)[number];

export function isReviewSpeedRate(value: unknown): value is ReviewSpeedRate {
  return REVIEW_SPEED_RATES.some((rate) => rate === value);
}
