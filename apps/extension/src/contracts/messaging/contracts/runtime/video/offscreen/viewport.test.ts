import { expect, it } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { runtimeVideoOffscreenViewportMessageContracts } from './viewport';

it('accepts both viewport and window preset surfaces on recording start', () => {
  const contract =
    runtimeVideoOffscreenViewportMessageContracts[VideoMessageType.OFFSCREEN_START_RECORDING];
  const message = {
    type: VideoMessageType.OFFSCREEN_START_RECORDING,
    capabilityToken: 'capability-1',
    generation: 2,
    recordingId: 'recording-1',
    streamId: 'stream-1',
    streamInstanceId: 'stream-instance-1',
    settings: {
      ...DEFAULT_VIDEO_SETTINGS,
      autoFadeDelay: 1,
      countdownSeconds: 0,
      openEditorAfterRecording: true,
    },
  };

  for (const target of ['viewport', 'window'] as const) {
    const request = {
      ...message,
      surface: { height: 720, presetId: 'preset-1', target, width: 1280 },
    };
    expect(contract.parseRequest(request)).toEqual(request);
  }
});

it('rejects legacy recording settings on offscreen start requests', () => {
  const contract =
    runtimeVideoOffscreenViewportMessageContracts[VideoMessageType.OFFSCREEN_START_RECORDING];
  const message = {
    type: VideoMessageType.OFFSCREEN_START_RECORDING,
    capabilityToken: 'capability-1',
    generation: 2,
    recordingId: 'recording-1',
    streamId: 'stream-1',
    streamInstanceId: 'stream-instance-1',
  };

  for (const settings of [
    { ...DEFAULT_VIDEO_SETTINGS, quality: 'HIGH' },
    { ...DEFAULT_VIDEO_SETTINGS, output: {} },
  ]) {
    expect(() => contract.parseRequest({ ...message, settings })).toThrow(
      /OFFSCREEN_START_RECORDING/
    );
  }
});

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
    transitionId: 'transition-1',
  };

  expect(contract.parseRequest(message)).toEqual(message);
  expect(() => contract.parseRequest({ ...message, frozen: 'true' })).toThrow(
    /OFFSCREEN_SET_VIEWPORT_DRAW_STATE/
  );
  expect(() => contract.parseRequest({ ...message, transitionId: undefined })).toThrow(
    /OFFSCREEN_SET_VIEWPORT_DRAW_STATE/
  );
  expect(contract.parseResponse({ success: true, result: 'applied' })).toEqual({
    success: true,
    result: 'applied',
  });
  expect(contract.parseResponse({ success: true, result: 'stale' })).toEqual({
    success: true,
    result: 'stale',
  });
  expect(() => contract.parseResponse({ success: true })).toThrow(
    /OFFSCREEN_SET_VIEWPORT_DRAW_STATE/
  );
  expect(contract.parseResponse({ error: 'draw state unavailable', success: false })).toEqual({
    error: 'draw state unavailable',
    success: false,
  });
  expect(() => contract.parseResponse({ success: true, result: 'accepted' })).toThrow(
    /OFFSCREEN_SET_VIEWPORT_DRAW_STATE/
  );
  expect(() => contract.parseResponse(undefined)).toThrow(/OFFSCREEN_SET_VIEWPORT_DRAW_STATE/);
});

it('requires an explicit acknowledgement for recording activation', () => {
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
    transitionId: 'navigation-1',
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
  expect(() => contract.parseRequest({ ...message, transitionId: 1 })).toThrow(
    /OFFSCREEN_REVALIDATE_SOURCE/
  );
});
