import { expect, it } from 'vitest';

import { shouldRenderClipAudio } from '../media/audio';
import { syncVideoClipFrame } from './frame';
import { syncClipPlayback } from './playback';
import {
  shouldRenderClipAudio as facadeShouldRenderClipAudio,
  syncClipPlayback as facadeSyncClipPlayback,
  syncVideoClipFrame as facadeSyncVideoClipFrame,
} from './index';

it('re-exports media playback seams without wrapping', () => {
  expect(facadeShouldRenderClipAudio).toBe(shouldRenderClipAudio);
  expect(facadeSyncClipPlayback).toBe(syncClipPlayback);
  expect(facadeSyncVideoClipFrame).toBe(syncVideoClipFrame);
});
