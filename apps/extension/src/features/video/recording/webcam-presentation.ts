import type { WebcamPresentationSettings } from '@sniptale/runtime-contracts/video/types/types';

export const DEFAULT_WEBCAM_APPEARANCE: NonNullable<WebcamPresentationSettings['appearance']> = {
  roundness: 12,
  zoom: 1,
  mirror: false,
  shadow: true,
  shadowColor: '#000000',
};

/** Camera controls send changed fields, not snapshots of unrelated parameters. */
export type WebcamPresentationPatch = Omit<
  Partial<WebcamPresentationSettings>,
  'appearance' | 'cropOffset' | 'center'
> & {
  appearance?: Partial<NonNullable<WebcamPresentationSettings['appearance']>>;
  cropOffset?: Partial<WebcamPresentationSettings['cropOffset']>;
  center?: Partial<WebcamPresentationSettings['center']>;
};

/** Applies one field intent to the current accepted or disposable presentation. */
export function applyWebcamPresentationPatch(
  current: WebcamPresentationSettings,
  patch: WebcamPresentationPatch
): WebcamPresentationSettings {
  const { appearance, cropOffset, center, ...fields } = patch;
  return {
    ...current,
    ...fields,
    ...(appearance
      ? { appearance: { ...DEFAULT_WEBCAM_APPEARANCE, ...current.appearance, ...appearance } }
      : {}),
    ...(cropOffset ? { cropOffset: { ...current.cropOffset, ...cropOffset } } : {}),
    ...(center ? { center: { ...current.center, ...center } } : {}),
  };
}

/** Resolves the camera silhouette without changing its normalized placement. */
export function webcamFrameStyle(
  presentation: Pick<WebcamPresentationSettings, 'shape' | 'appearance'>
) {
  const appearance = presentation.appearance ?? DEFAULT_WEBCAM_APPEARANCE;
  const rounded = presentation.shape === 'circle' || presentation.shape === 'ellipse';
  const soft = presentation.shape === 'soft';
  const points = soft
    ? Array.from({ length: 128 }, (_, index) => {
        const angle = (index * Math.PI * 2) / 128;
        const exponent = 5 - appearance.roundness * 0.02;
        const horizontal = Math.cos(angle);
        const vertical = Math.sin(angle);
        const horizontalPercent =
          50 * (1 + Math.sign(horizontal) * Math.abs(horizontal) ** (2 / exponent));
        const verticalPercent =
          50 * (1 + Math.sign(vertical) * Math.abs(vertical) ** (2 / exponent));
        return `${horizontalPercent}% ${verticalPercent}%`;
      }).join(',')
    : null;
  return {
    borderRadius: rounded ? '50%' : soft ? '0' : `${appearance.roundness}px`,
    clipPath: points ? `polygon(${points})` : undefined,
    filter: appearance.shadow ? `drop-shadow(0 0 14px ${appearance.shadowColor}66)` : undefined,
  };
}

/** Zoom preserves the configured framing; mirroring does not alter the underlying camera track. */
export function webcamVideoStyle(
  presentation: Pick<WebcamPresentationSettings, 'cropOffset' | 'appearance'>
) {
  const appearance = presentation.appearance ?? DEFAULT_WEBCAM_APPEARANCE;
  const mirrorTranslation = appearance.mirror ? -presentation.cropOffset.x * 100 : 0;
  const horizontalScale = appearance.mirror ? -appearance.zoom : appearance.zoom;
  const scale = `scale(${horizontalScale}, ${appearance.zoom})`;
  return {
    objectPosition: `${50 + presentation.cropOffset.x * 50}% ${50 + presentation.cropOffset.y * 50}%`,
    transform: `translateX(${mirrorTranslation}%) ${scale}`,
    transformOrigin: `${50 + presentation.cropOffset.x * 50}% ${50 + presentation.cropOffset.y * 50}%`,
  };
}
