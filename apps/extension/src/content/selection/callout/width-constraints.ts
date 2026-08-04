const MIN_CALLOUT_WRAP_WIDTH = 100;

export function clampCalloutWrapWidth(value: number) {
  return Math.max(MIN_CALLOUT_WRAP_WIDTH, Math.round(value));
}
