import { expect, it } from 'vitest';
import { parseBackgroundRuntimeMessage, parseOffscreenRuntimeMessage } from './boundary';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

it('accepts background recording settings updates', () => {
  const message = parseBackgroundRuntimeMessage({
    type: VideoMessageType.UPDATE_SETTINGS,
    controlToken: 'control-token-1',
    recordingId: 'recording-1',
    settings: { microphoneEnabled: false },
  });

  expect(message.type).toBe(VideoMessageType.UPDATE_SETTINGS);
});

it('accepts offscreen recording settings updates', () => {
  const message = parseOffscreenRuntimeMessage({
    type: VideoMessageType.OFFSCREEN_UPDATE_SETTINGS,
    capabilityToken: 'capability-token-1',
    settings: { webcamEnabled: false },
  });

  expect(message.type).toBe(VideoMessageType.OFFSCREEN_UPDATE_SETTINGS);
});
