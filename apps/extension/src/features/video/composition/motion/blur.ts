/** Camera exposure in seconds: 100% spans one 30 FPS frame, independent of playback refresh. */
export function motionBlurSamples(time: number, strength: number, start: number, end: number) {
  const amount = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0;
  if (amount === 0 || end <= start) return [{ time, alpha: 1 }];
  const exposure = amount / 30;
  const weights = [1, 2, 3, 2, 1];
  return weights.map((weight, index) => ({
    time: Math.max(start, Math.min(end, time + (index / 4 - 0.5) * exposure)),
    alpha: weight / 9,
  }));
}
