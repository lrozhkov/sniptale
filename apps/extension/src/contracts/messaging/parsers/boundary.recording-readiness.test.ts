import { expect, it } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { parseBackgroundRuntimeMessage, parseOffscreenRuntimeMessage } from './boundary';

const offer = {
  type: VideoMessageType.COUNTDOWN_CAMERA_OFFER,
  controlToken: 'control',
  recordingId: 'recording',
  peerGeneration: 0,
  sdp: 'offer',
};

it('parses popup camera offer and close with recording capability and generation', () => {
  expect(parseBackgroundRuntimeMessage(offer)).toEqual(offer);
  const close = {
    type: VideoMessageType.COUNTDOWN_CAMERA_CLOSE,
    controlToken: offer.controlToken,
    recordingId: offer.recordingId,
    peerGeneration: 0,
  };
  expect(parseBackgroundRuntimeMessage(close)).toEqual(close);
});

it.each([
  { peerGeneration: -1 },
  { peerGeneration: 0.5 },
  { peerGeneration: Infinity },
  { peerGeneration: Number.MAX_SAFE_INTEGER + 1 },
  { controlToken: '' },
  { recordingId: '' },
  { sdp: '' },
  { settings: DEFAULT_VIDEO_SETTINGS },
])('rejects invalid camera capability or generation %j', (patch) => {
  expect(() => parseBackgroundRuntimeMessage({ ...offer, ...patch })).toThrow();
});

it('parses strictly separated surface and countdown offscreen sources', () => {
  const command = {
    type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_OFFER,
    capabilityToken: 'capability',
    peerId: 'peer',
    sdp: 'offer',
  };
  expect(
    parseOffscreenRuntimeMessage({
      ...command,
      source: { kind: 'surface', settings: DEFAULT_VIDEO_SETTINGS },
    })
  ).toBeTruthy();
  expect(
    parseOffscreenRuntimeMessage({
      ...command,
      source: {
        kind: 'countdown',
        recordingId: 'recording',
        generation: 1,
        streamInstanceId: 'stream',
      },
    })
  ).toBeTruthy();
  expect(() =>
    parseOffscreenRuntimeMessage({ ...command, settings: DEFAULT_VIDEO_SETTINGS })
  ).toThrow();
  expect(() =>
    parseOffscreenRuntimeMessage({
      ...command,
      source: {
        kind: 'countdown',
        recordingId: 'recording',
        generation: 1,
        streamInstanceId: 'stream',
        settings: DEFAULT_VIDEO_SETTINGS,
      },
    })
  ).toThrow();
});
