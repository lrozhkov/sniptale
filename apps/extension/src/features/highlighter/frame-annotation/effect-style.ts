import type { FrameAnnotationVisualState } from './model';

export function getFrameAnnotationBlurBackdropStyle(
  frame: Pick<FrameAnnotationVisualState, 'blurSettings'>
) {
  const amount = frame.blurSettings?.amount ?? 8;
  switch (frame.blurSettings?.blurType ?? 'gaussian') {
    case 'distortion':
      return {
        backdropFilter: 'url(#sniptale-distortion-filter)',
        backgroundColor: 'transparent',
        imageRendering: 'auto',
        distortionScale: amount * 1.5,
      };
    case 'pixelate':
      return {
        backdropFilter: `blur(${Math.max(1, amount / 3)}px)`,
        backgroundColor: 'color-mix(in srgb, var(--sniptale-color-surface-panel) 8%, transparent)',
        imageRendering: 'pixelated',
      };
    case 'solid':
      return {
        backdropFilter: 'none',
        backgroundColor: `rgb(0 0 0 / ${Math.min(1, Math.max(0.08, amount / 25)).toFixed(3)})`,
        imageRendering: 'auto',
      };
    case 'gaussian':
      return {
        backdropFilter: `blur(${amount}px)`,
        backgroundColor: 'color-mix(in srgb, var(--sniptale-color-surface-panel) 4%, transparent)',
        imageRendering: 'auto',
      };
  }
}
