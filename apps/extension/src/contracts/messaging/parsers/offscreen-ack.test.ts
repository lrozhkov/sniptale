import { expect, it } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

import {
  parseRuntimeRequestMessage,
  parseRuntimeResponseForMessage,
  parseRuntimeResponseForRequest,
} from './boundary';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

function createRecordingSettings() {
  return {
    ...DEFAULT_VIDEO_SETTINGS,
    autoFadeDelay: 300,
    countdownSeconds: 0,
    diagnosticsEnabled: true,
    openEditorAfterRecording: false,
  };
}

it('parses accepted offscreen ack responses through the runtime response boundary', () => {
  const startRecordingMessage = parseRuntimeRequestMessage({
    type: VideoMessageType.OFFSCREEN_START_RECORDING,
    capabilityToken: 'test-capability',
    generation: 1,
    recordingId: 'recording-1',
    streamId: 'stream-1',
    streamInstanceId: 'stream-instance-1',
    settings: createRecordingSettings(),
  });

  expect(
    parseRuntimeResponseForRequest(startRecordingMessage, {
      success: true,
      result: 'accepted',
    })
  ).toEqual({
    success: true,
    result: 'accepted',
  });
  expect(
    parseRuntimeResponseForMessage(VideoMessageType.GET_DESKTOP_MEDIA, {
      success: true,
      result: 'accepted',
    })
  ).toEqual({
    success: true,
    result: 'accepted',
  });
});
