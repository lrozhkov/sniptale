import { expect, it } from 'vitest';

import { renderOfflineAudioMix, scheduleOfflineAudioClipMix } from './index';
import { renderOfflineAudioMix as renderOfflineAudioMixImpl } from './render/index';
import { scheduleOfflineAudioClipMix as scheduleOfflineAudioClipMixImpl } from './schedule';

it('keeps the offline-audio mix root facade as a thin stable forwarding layer', () => {
  expect(renderOfflineAudioMix).toBe(renderOfflineAudioMixImpl);
  expect(scheduleOfflineAudioClipMix).toBe(scheduleOfflineAudioClipMixImpl);
});
