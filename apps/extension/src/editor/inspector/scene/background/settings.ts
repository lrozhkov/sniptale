import { resolveEditorFrameGradient } from '../../../../features/editor/document/frame-gradient';
import { getColorAlpha, normalizeColor } from '@sniptale/foundation/color';
import {
  DEFAULT_EDITOR_FRAME_SETTINGS,
  DEFAULT_EDITOR_IMAGE_SETTINGS,
  normalizeEditorFrameSettings,
} from '../../../../features/editor/document/constants';
import type { EditorFrameSettings } from '../../../../features/editor/document/types';

type FrameBackgroundMode = EditorFrameSettings['backgroundMode'] | 'none';

/** None uses the existing transparent, unpadded scene representation. */
export function isFrameBackgroundNone(frame: EditorFrameSettings): boolean {
  return (
    frame.backgroundMode === 'color' &&
    getColorAlpha(frame.backgroundColor) === 0 &&
    frame.paddingTop === 0 &&
    frame.paddingRight === 0 &&
    frame.paddingBottom === 0 &&
    frame.paddingLeft === 0
  );
}

export function disableFrameBackground(frame: EditorFrameSettings): EditorFrameSettings {
  return {
    ...frame,
    backgroundMode: 'color',
    backgroundColor: 'transparent',
    backgroundImageData: null,
    backgroundBlurAmount: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    sourceImage: { ...DEFAULT_EDITOR_IMAGE_SETTINGS },
  };
}

export function changeFrameBackgroundMode(
  frame: EditorFrameSettings,
  mode: FrameBackgroundMode
): EditorFrameSettings {
  if (mode === 'none') return disableFrameBackground(frame);
  const next = isFrameBackgroundNone(frame)
    ? {
        ...frame,
        layoutMode: 'expand-canvas' as const,
        paddingTop: 32,
        paddingRight: 32,
        paddingBottom: 32,
        paddingLeft: 32,
        sourceImage: {
          ...frame.sourceImage,
          ...DEFAULT_EDITOR_IMAGE_SETTINGS,
          radius: 12,
          shadow: 14,
        },
      }
    : frame;
  return {
    ...next,
    backgroundMode: mode,
    ...(mode === 'color' && getColorAlpha(next.backgroundColor) === 0
      ? { backgroundColor: '#ffffffff' }
      : {}),
  };
}

/** Reset the active background treatment while retaining the image and window header identity. */
export function resetFrameBackground(frame: EditorFrameSettings): EditorFrameSettings {
  if (isFrameBackgroundNone(frame)) return frame;
  const defaults = changeFrameBackgroundMode(disableFrameBackground(frame), frame.backgroundMode);
  return {
    ...defaults,
    backgroundColor: frame.backgroundMode === 'color' ? '#ffffff' : frame.backgroundColor,
    ...(frame.backgroundMode === 'gradient'
      ? {
          backgroundGradient: resolveEditorFrameGradient(DEFAULT_EDITOR_FRAME_SETTINGS),
          backgroundGradientFrom: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundGradientFrom,
          backgroundGradientTo: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundGradientTo,
          backgroundGradientStops: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundGradientStops,
          backgroundGradientColorStops: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundGradientColorStops,
          backgroundGradientAngle: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundGradientAngle,
        }
      : {}),
    backgroundImageData: frame.backgroundImageData,
    backgroundImageFit:
      frame.backgroundMode === 'image'
        ? DEFAULT_EDITOR_FRAME_SETTINGS.backgroundImageFit
        : frame.backgroundImageFit,
  };
}

function backgroundParameters(frame: EditorFrameSettings): string {
  const normalized = normalizeEditorFrameSettings(frame);
  const gradient =
    normalized.backgroundMode === 'gradient' ? resolveEditorFrameGradient(normalized) : null;
  const source = normalized.sourceImage ?? DEFAULT_EDITOR_IMAGE_SETTINGS;
  return JSON.stringify({
    mode: normalized.backgroundMode,
    padding: [
      normalized.paddingTop,
      normalized.paddingRight,
      normalized.paddingBottom,
      normalized.paddingLeft,
    ],
    layout: normalized.layoutMode,
    blur: normalized.backgroundBlurAmount,
    color:
      normalized.backgroundMode === 'color'
        ? (normalizeColor(normalized.backgroundColor) ?? normalized.backgroundColor)
        : undefined,
    gradient: gradient
      ? {
          type: gradient.type,
          angle: gradient.angle,
          interpolation: gradient.interpolation,
          repeat: { enabled: gradient.repeat.enabled, span: gradient.repeat.span },
          stops: gradient.stops.map((stop) => ({
            color: normalizeColor(stop.color) ?? stop.color,
            position: stop.position,
            midpoint: stop.midpoint,
          })),
        }
      : undefined,
    fit: normalized.backgroundMode === 'image' ? normalized.backgroundImageFit : undefined,
    source: {
      ...source,
      strokeColor: normalizeColor(source.strokeColor),
      shadowColor: normalizeColor(source.shadowColor ?? source.strokeColor),
    },
  });
}

/** Compare bounded treatment parameters; image bytes and gradient stop identities do not affect Reset. */
export function isFrameBackgroundDefault(frame: EditorFrameSettings): boolean {
  return backgroundParameters(frame) === backgroundParameters(resetFrameBackground(frame));
}
