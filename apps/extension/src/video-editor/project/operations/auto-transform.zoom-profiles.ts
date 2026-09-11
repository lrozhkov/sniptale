export type AutoZoomProfile = {
  duration: number;
  motionBlurAmount: number;
  scale: number;
  zoomInDuration: number;
  zoomOutDuration: number;
};

/** Stable pacing; zoom strength is selected explicitly by the editor workflow. */
export function resolveAutoZoomProfileVariant(
  kind: 'default' | 'isolated' | 'typing',
  _clickId: string
): AutoZoomProfile {
  return {
    duration: kind === 'isolated' ? 3.6 : 3.2,
    motionBlurAmount: 0,
    scale: 1.4,
    zoomInDuration: 0.5,
    zoomOutDuration: 0.5,
  };
}
