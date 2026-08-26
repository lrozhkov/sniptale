import { expect, it } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { runtimeVideoOffscreenViewportMessageContracts } from './viewport';

it('accepts only a window capture surface on recording start', () => {
  const contract =
    runtimeVideoOffscreenViewportMessageContracts[VideoMessageType.OFFSCREEN_START_RECORDING];
  const message = {
    capabilityToken: 'capability-1',
    generation: 1,
    recordingId: 'recording-1',
    settings: DEFAULT_VIDEO_SETTINGS,
    streamId: 'stream-1',
    streamInstanceId: 'instance-1',
    sourceContext: {
      favicon: 'https://example.com/favicon.ico',
      title: 'Example page',
      url: 'https://example.com/article',
    },
    surface: { height: 720, presetId: 'window-hd', target: 'window', width: 1280 },
    type: VideoMessageType.OFFSCREEN_START_RECORDING,
  } as const;
  expect(contract.parseRequest(message)).toEqual(message);
  expect(() =>
    contract.parseRequest({ ...message, surface: { ...message.surface, target: 'viewport' } })
  ).toThrow(/OFFSCREEN_START_RECORDING/);
  expect(() =>
    contract.parseRequest({ ...message, sourceContext: { ...message.sourceContext, url: 42 } })
  ).toThrow(/OFFSCREEN_START_RECORDING/);
});

it('requires an explicit acknowledgement for recording activation', () => {
  const contract =
    runtimeVideoOffscreenViewportMessageContracts[VideoMessageType.OFFSCREEN_BEGIN_RECORDING];
  expect(contract.parseResponse({ success: true })).toEqual({ success: true });
  expect(() => contract.parseResponse({})).toThrow(/OFFSCREEN_BEGIN_RECORDING/);
});
