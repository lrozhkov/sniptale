import { expect, it } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { runtimeVideoOffscreenViewportMessageContracts } from './viewport';

it('binds viewport frame freezing to the active recording source', () => {
  const contract =
    runtimeVideoOffscreenViewportMessageContracts[
      VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE
    ];
  const message = {
    type: VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE,
    capabilityToken: 'capability-1',
    frozen: true,
    generation: 2,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-1',
  };

  expect(contract.parseRequest(message)).toEqual(message);
  expect(() => contract.parseRequest({ ...message, frozen: 'true' })).toThrow(
    /OFFSCREEN_SET_VIEWPORT_DRAW_STATE/
  );
  expect(contract.parseResponse({ success: true, result: 'accepted' })).toEqual({
    success: true,
    result: 'accepted',
  });
  expect(() => contract.parseResponse(undefined)).toThrow(/OFFSCREEN_SET_VIEWPORT_DRAW_STATE/);
});

it('requires an explicit acknowledgement after the first fresh viewport frame', () => {
  const contract =
    runtimeVideoOffscreenViewportMessageContracts[VideoMessageType.OFFSCREEN_BEGIN_RECORDING];

  expect(contract.parseResponse({ success: true })).toEqual({ success: true });
  expect(() => contract.parseResponse(undefined)).toThrow(/OFFSCREEN_BEGIN_RECORDING/);
  expect(() => contract.parseResponse({})).toThrow(/OFFSCREEN_BEGIN_RECORDING/);
});

it('carries the current viewport through source revalidation', () => {
  const contract =
    runtimeVideoOffscreenViewportMessageContracts[VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE];
  const message = {
    type: VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE,
    capabilityToken: 'capability-1',
    generation: 1,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-1',
    viewport: {
      devicePixelRatio: 2,
      height: 720,
      scrollX: 0,
      scrollY: 0,
      visualViewportScale: 1,
      width: 1280,
    },
  };

  expect(contract.parseRequest(message)).toEqual(message);
  expect(() =>
    contract.parseRequest({ ...message, viewport: { ...message.viewport, width: '1280' } })
  ).toThrow(/OFFSCREEN_REVALIDATE_SOURCE/);
});
