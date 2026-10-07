import { getColorAlpha } from '@sniptale/foundation/color';
import { DEFAULT_EDITOR_IMAGE_SETTINGS } from '../../../../features/editor/document/constants';
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
