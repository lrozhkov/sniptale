import { expect, it } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { parseBackgroundRuntimeMessage } from './boundary';

const progress = {
  type: VideoMessageType.RECORDING_DURATION_UPDATED,
  recordingId: 'recording-1',
};
const activity = { status: 'ready', level: 0.25, warning: false };

it('accepts microphone activity without changing recording duration', () => {
  expect(parseBackgroundRuntimeMessage({ ...progress, microphoneActivity: activity })).toEqual({
    ...progress,
    microphoneActivity: activity,
  });
  expect(parseBackgroundRuntimeMessage({ ...progress, duration: 12 })).toEqual({
    ...progress,
    duration: 12,
  });
  expect(
    parseBackgroundRuntimeMessage({ ...progress, duration: 12, microphoneActivity: activity })
  ).toEqual({ ...progress, duration: 12, microphoneActivity: activity });
});

it.each([
  {},
  { microphoneActivity: { ...activity, level: NaN } },
  { microphoneActivity: { ...activity, level: Infinity } },
  { microphoneActivity: { ...activity, level: -1 } },
  { microphoneActivity: { ...activity, level: 1.1 } },
  { microphoneActivity: { ...activity, status: 'speaking' } },
  { microphoneActivity: { ...activity, warning: 'true' } },
])('rejects empty or malformed microphone progress %j', (patch) => {
  expect(() => parseBackgroundRuntimeMessage({ ...progress, ...patch })).toThrow();
});
