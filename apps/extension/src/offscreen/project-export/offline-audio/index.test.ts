import { expect, it } from 'vitest';

import {
  encodeOfflineAudioBuffer,
  renderOfflineAudioMix,
  scheduleOfflineAudioClipMix,
} from './index';
import { encodeOfflineAudioBuffer as encodeOfflineAudioBufferImpl } from './encode-buffer';
import {
  renderOfflineAudioMix as renderOfflineAudioMixImpl,
  scheduleOfflineAudioClipMix as scheduleOfflineAudioClipMixImpl,
} from './mix/index';

it('keeps the offline-audio owner barrel as a thin stable forwarding layer', () => {
  expect(encodeOfflineAudioBuffer).toBe(encodeOfflineAudioBufferImpl);
  expect(renderOfflineAudioMix).toBe(renderOfflineAudioMixImpl);
  expect(scheduleOfflineAudioClipMix).toBe(scheduleOfflineAudioClipMixImpl);
});
