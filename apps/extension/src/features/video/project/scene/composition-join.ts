/**
 * Evaluates an admitted composition seam on the caller's clock. All four values
 * use the same unit; this profile neither selects frames nor changes their time.
 * The start is included and the end is excluded, also for one-sided windows.
 */
export function evaluateCompositionJoin(time: number, seam: number, before: number, after: number) {
  if (!(time >= seam - before && time < seam + after) || before + after <= 0) return null;
  const incoming = (time - seam + before) / (before + after);
  const beforeSeam = time < seam;
  const black = beforeSeam ? 1 - (seam - time) / before : 1 - (time - seam) / after;
  return { incoming, beforeSeam, black: Math.max(0, Math.min(1, black)) };
}
