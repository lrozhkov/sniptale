import type { CSSProperties } from 'react';

function clampVisualProgress(progress: number) {
  return Math.min(1, Math.max(0, progress));
}

export function createPartMotionStyle(
  progress: number,
  options: {
    scaleFrom?: number;
    transformOrigin?: string;
    translateX?: number;
    translateY?: number;
  } = {}
) {
  const normalizedProgress = clampVisualProgress(progress);
  const translateX = (1 - normalizedProgress) * (options.translateX ?? 0);
  const translateY = (1 - normalizedProgress) * (options.translateY ?? 12);
  const scaleFrom = options.scaleFrom ?? 0.96;
  const scale = scaleFrom + normalizedProgress * (1 - scaleFrom);

  return {
    opacity: normalizedProgress,
    transform: `translate3d(${translateX.toFixed(2)}px, ${translateY.toFixed(2)}px, 0) scale(${scale.toFixed(3)})`,
    transformOrigin: options.transformOrigin ?? 'left center',
  } satisfies CSSProperties;
}
