import { clamp } from '../types';

export function resolveSmoothingIterations(
  smoothingLevel: number,
  iterationLimit: number | undefined
): number {
  const iterations = Math.round(clamp(smoothingLevel, 0, 10) * 3);
  return typeof iterationLimit === 'number'
    ? Math.min(iterations, Math.max(0, Math.round(iterationLimit)))
    : iterations;
}
