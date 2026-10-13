/** Four monotonic timestamps from one bounded request/reply, in milliseconds. */
export type RecordingClockExchange = Readonly<{ a0: number; b1: number; b2: number; a3: number }>;
export type RecordingClockOffset = Readonly<{
  lowerMs: number;
  upperMs: number;
  offsetMs: number;
  uncertaintyMs: number;
}>;
const MAX_EXCHANGES = 8;
// Chromium's non-isolated100µs timer resolution: allow both readings on each edge.
const TIMER_EDGE_ALLOWANCE_MS = 0.2;

/** B−A lies between B2−A3 and B1−A0; asymmetric delivery is uncertainty, not exact calibration. */
export function inferRecordingClockOffset(
  exchanges: readonly RecordingClockExchange[],
  maximumUncertaintyMs: number
): RecordingClockOffset | null {
  if (
    exchanges.length === 0 ||
    exchanges.length > MAX_EXCHANGES ||
    !Number.isFinite(maximumUncertaintyMs) ||
    maximumUncertaintyMs <= 0
  )
    return null;
  let lowerMs = -Infinity;
  let upperMs = Infinity;
  for (const { a0, b1, b2, a3 } of exchanges) {
    if (![a0, b1, b2, a3].every(Number.isFinite) || a3 < a0 || b2 < b1) return null;
    lowerMs = Math.max(lowerMs, b2 - a3 - TIMER_EDGE_ALLOWANCE_MS);
    upperMs = Math.min(upperMs, b1 - a0 + TIMER_EDGE_ALLOWANCE_MS);
  }
  const uncertaintyMs = (upperMs - lowerMs) / 2;
  if (lowerMs > upperMs || !Number.isFinite(uncertaintyMs) || uncertaintyMs > maximumUncertaintyMs)
    return null;
  return { lowerMs, upperMs, offsetMs: lowerMs + uncertaintyMs, uncertaintyMs };
}
