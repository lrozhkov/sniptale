import { expect, it } from 'vitest';

import { isLiveVideoRecordingSettingsPatch } from './validators.live-settings';

it('accepts only optional live microphone and webcam boolean patches', () => {
  expect(isLiveVideoRecordingSettingsPatch({})).toBe(true);
  expect(isLiveVideoRecordingSettingsPatch({ microphoneEnabled: true })).toBe(true);
  expect(isLiveVideoRecordingSettingsPatch({ webcamEnabled: false })).toBe(true);
  expect(isLiveVideoRecordingSettingsPatch({ microphoneEnabled: 'yes' })).toBe(false);
  expect(isLiveVideoRecordingSettingsPatch([])).toBe(false);
  expect(isLiveVideoRecordingSettingsPatch(null)).toBe(false);
});
