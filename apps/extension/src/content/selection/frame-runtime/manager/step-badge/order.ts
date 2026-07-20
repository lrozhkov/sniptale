import type { FrameData } from '../../../../../features/highlighter/contracts';

export function sortFramesByStoredStepBadgeOrder<T extends FrameData>(
  frames: readonly T[],
  orderMap: Map<string, number>,
  fallbackCompare: (a: T, b: T) => number
): T[] {
  return [...frames].sort((a, b) => {
    const orderA = orderMap.get(a.id);
    const orderB = orderMap.get(b.id);

    if (orderA != null && orderB != null && orderA !== orderB) {
      return orderA - orderB;
    }

    if (orderA != null && orderB == null) {
      return -1;
    }

    if (orderA == null && orderB != null) {
      return 1;
    }

    return fallbackCompare(a, b);
  });
}
