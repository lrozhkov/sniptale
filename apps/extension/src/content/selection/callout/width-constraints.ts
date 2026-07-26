export const MIN_CALLOUT_MAX_WIDTH = 100;
export const MAX_CALLOUT_MAX_WIDTH = 500;

export function clampCalloutMaxWidth(value: number) {
  return Math.max(MIN_CALLOUT_MAX_WIDTH, Math.min(MAX_CALLOUT_MAX_WIDTH, Math.round(value)));
}
