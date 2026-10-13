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

it('normalizes malformed advisory BEGIN lease without rejecting strict primary admission', async () => {
  const { RECORDING_FRAME_CLOCK_PURPOSE } =
    await import('../../../../../video/recording-frame-clock');
  const contract =
    runtimeVideoOffscreenViewportMessageContracts[VideoMessageType.OFFSCREEN_BEGIN_RECORDING];
  const primary = {
    type: VideoMessageType.OFFSCREEN_BEGIN_RECORDING,
    capabilityToken: 'capability',
    recordingId: 'recording',
    generation: 2,
    streamInstanceId: 'source',
  } as const;
  const lease = {
    recordingId: 'recording',
    generation: 2,
    streamInstanceId: 'source',
    purpose: RECORDING_FRAME_CLOCK_PURPOSE,
    nonce: 'ba289176-c099-44d5-8f18-174e05565080',
    expiresAtEpochMs: 1,
  };
  expect(contract.parseRequest({ ...primary, frameClockLease: lease }).frameClockLease).toEqual(
    lease
  );
  for (const frameClockLease of [
    {},
    null,
    { ...lease, purpose: 'other' },
    { ...lease, generation: 3 },
  ]) {
    expect(contract.parseRequest({ ...primary, frameClockLease })).toEqual({
      ...primary,
      frameClockLease: null,
    });
  }
  expect(() =>
    contract.parseRequest({ ...primary, capabilityToken: 42, frameClockLease: lease })
  ).toThrow();
  expect(() =>
    contract.parseRequest({ ...primary, unexpected: true, frameClockLease: lease })
  ).toThrow();
});
