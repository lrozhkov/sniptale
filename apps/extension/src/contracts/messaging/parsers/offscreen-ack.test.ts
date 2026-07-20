import { expect, it } from 'vitest';

import {
  parseRuntimeRequestMessage,
  parseRuntimeResponseForMessage,
  parseRuntimeResponseForRequest,
} from './boundary';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

function createRecordingSettings() {
  return {
    autoFadeDelay: 300,
    countdownSeconds: 0,
    diagnosticsEnabled: true,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    openEditorAfterRecording: false,
    quality: '1080p',
    systemAudioEnabled: true,
    webcamDeviceId: null,
    webcamEnabled: false,
  };
}

it('parses accepted offscreen ack responses through the runtime response boundary', () => {
  const startRecordingMessage = parseRuntimeRequestMessage({
    type: VideoMessageType.OFFSCREEN_START_RECORDING,
    capabilityToken: 'test-capability',
    streamId: 'stream-1',
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
