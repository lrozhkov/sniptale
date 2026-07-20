// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  CaptureModeSelector,
  VideoMicrophoneSelector,
  VideoPresetSelector,
  VideoWebcamSelector,
} from './';

describe('video-setup-sections facade', () => {
  it('re-exports the section owner modules', () => {
    expect(CaptureModeSelector).toBeTypeOf('function');
    expect(VideoPresetSelector).toBeTypeOf('function');
    expect(VideoMicrophoneSelector).toBeTypeOf('function');
    expect(VideoWebcamSelector).toBeTypeOf('function');
  });
});
