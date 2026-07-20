import { expect, it } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../features/editor/document/constants';
import { resetFrameBackgroundDraft } from './draft';

it('resets only frame background draft fields to editor defaults', () => {
  expect(resetFrameBackgroundDraft()).toEqual({
    backgroundColor: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundColor,
    backgroundGradientAngle: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundGradientAngle,
    backgroundGradientColorStops: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundGradientColorStops,
    backgroundGradientFrom: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundGradientFrom,
    backgroundGradientStops: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundGradientStops,
    backgroundGradientTo: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundGradientTo,
    backgroundImageData: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundImageData,
    backgroundImageFit: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundImageFit,
    backgroundMode: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundMode,
  });
});
