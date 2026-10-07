import { expect, it } from 'vitest';
import {
  DEFAULT_EDITOR_FRAME_SETTINGS,
  DEFAULT_EDITOR_IMAGE_SETTINGS,
} from '../../../../features/editor/document/constants';
import {
  changeFrameBackgroundMode,
  disableFrameBackground,
  isFrameBackgroundNone,
} from './settings';

it('disables the background without changing window header fields, then restores usable defaults', () => {
  const frame = {
    ...DEFAULT_EDITOR_FRAME_SETTINGS,
    browserTitle: 'Title',
    browserUrl: 'https://example.com',
    backgroundImageData: 'data:image/png;base64,AA==',
  };
  const none = disableFrameBackground(frame);
  expect(isFrameBackgroundNone(none)).toBe(true);
  expect(none.backgroundImageData).toBeNull();
  expect(none.browserTitle).toBe('Title');
  expect(none.browserUrl).toBe(frame.browserUrl);
  for (const mode of ['color', 'gradient', 'image'] as const) {
    const active = changeFrameBackgroundMode(none, mode);
    expect(isFrameBackgroundNone(active)).toBe(false);
    expect(active).toMatchObject({
      backgroundMode: mode,
      paddingTop: 32,
      sourceImage: { radius: 12 },
    });
  }
});

it('keeps configured geometry and style when switching active background types', () => {
  const frame = {
    ...DEFAULT_EDITOR_FRAME_SETTINGS,
    paddingTop: 71,
    sourceImage: { ...DEFAULT_EDITOR_IMAGE_SETTINGS, radius: 23 },
  };
  expect(changeFrameBackgroundMode(frame, 'image')).toEqual({ ...frame, backgroundMode: 'image' });
});
