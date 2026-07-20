import { expect, expectTypeOf, it } from 'vitest';

import {
  collectRenderableAudioClips,
  decodeClipAudioBuffer,
  type OfflineAudioRenderableClip,
} from './index';
import { collectRenderableAudioClips as collectRenderableAudioClipsImpl } from './index';
import { decodeClipAudioBuffer as decodeClipAudioBufferImpl } from './index';

it('keeps the clip-audio facade thin', () => {
  expect(collectRenderableAudioClips).toBe(collectRenderableAudioClipsImpl);
  expect(decodeClipAudioBuffer).toBe(decodeClipAudioBufferImpl);
});

it('keeps the renderable clip type stable', () => {
  expectTypeOf<OfflineAudioRenderableClip>().toMatchTypeOf<OfflineAudioRenderableClip>();
});
