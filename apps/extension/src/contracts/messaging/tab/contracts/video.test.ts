import { describe, expect, it } from 'vitest';

import { MessageContractError } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { tabVideoMessageContracts } from './video';

function verifyControlledCursorCaptureLifecycleContracts() {
  expect(
    tabVideoMessageContracts[VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE]?.parseRequest({
      type: VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE,
    })
  ).toEqual({
    type: VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE,
  });
  expect(
    tabVideoMessageContracts[VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE]?.parseRequest({
      type: VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE,
    })
  ).toEqual({
    type: VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE,
  });
}

function verifyViewportCursorProjectionContracts() {
  for (const type of [
    VideoMessageType.ENABLE_VIEWPORT_CURSOR_PROJECTION,
    VideoMessageType.DISABLE_VIEWPORT_CURSOR_PROJECTION,
  ]) {
    expect(
      tabVideoMessageContracts[type]?.parseRequest({
        generation: 4,
        recordingId: 'recording-1',
        type,
      })
    ).toEqual({ generation: 4, recordingId: 'recording-1', type });
    expect(() => tabVideoMessageContracts[type]?.parseRequest({ type })).toThrow(
      MessageContractError
    );
    expect(tabVideoMessageContracts[type]?.parseResponse({ success: true })).toEqual({
      success: true,
    });
  }
}

function verifyViewportCalibrationContracts() {
  const pattern = {
    edgeThicknessCss: 8,
    colors: {
      top: { red: 236, green: 32, blue: 58 },
      right: { red: 38, green: 220, blue: 75 },
      bottom: { red: 42, green: 72, blue: 232 },
      left: { red: 226, green: 42, blue: 214 },
    },
  };
  const authority = { generation: 4, recordingId: 'recording-1', transitionId: 'transition-1' };
  expect(
    tabVideoMessageContracts[VideoMessageType.SHOW_VIEWPORT_CALIBRATION]?.parseRequest({
      ...authority,
      pattern,
      type: VideoMessageType.SHOW_VIEWPORT_CALIBRATION,
    })
  ).toMatchObject({ ...authority, pattern });
  expect(
    tabVideoMessageContracts[VideoMessageType.HIDE_VIEWPORT_CALIBRATION]?.parseRequest({
      ...authority,
      type: VideoMessageType.HIDE_VIEWPORT_CALIBRATION,
    })
  ).toMatchObject(authority);
  expect(
    tabVideoMessageContracts[VideoMessageType.SHOW_VIEWPORT_CALIBRATION]?.parseResponse({
      result: 'applied',
      success: true,
    })
  ).toEqual({ result: 'applied', success: true });
  expect(
    tabVideoMessageContracts[VideoMessageType.HIDE_VIEWPORT_CALIBRATION]?.parseResponse({
      result: 'stale',
      success: true,
    })
  ).toEqual({ result: 'stale', success: true });
  expect(() =>
    tabVideoMessageContracts[VideoMessageType.SHOW_VIEWPORT_CALIBRATION]?.parseRequest({
      ...authority,
      generation: 0,
      pattern,
      type: VideoMessageType.SHOW_VIEWPORT_CALIBRATION,
    })
  ).toThrow(MessageContractError);
  expect(() =>
    tabVideoMessageContracts[VideoMessageType.HIDE_VIEWPORT_CALIBRATION]?.parseRequest({
      ...authority,
      transitionId: 1,
      type: VideoMessageType.HIDE_VIEWPORT_CALIBRATION,
    })
  ).toThrow(MessageContractError);
}

function verifyRegionSelectionContracts() {
  const binding = {
    regionSelectionCapabilityToken: 'token-1',
    regionSelectionRequestGeneration: 'generation-1',
    regionSelectionRequestId: 'request-1',
  };
  const captureViewport = {
    devicePixelRatio: 2,
    height: 720,
    scrollX: 0,
    scrollY: 0,
    visualViewportScale: 1,
    width: 1280,
  };

  expect(
    tabVideoMessageContracts[VideoMessageType.SHOW_REGION_SELECTOR]?.parseRequest({
      type: VideoMessageType.SHOW_REGION_SELECTOR,
      ...binding,
    })
  ).toEqual({ type: VideoMessageType.SHOW_REGION_SELECTOR, ...binding });
  expect(() =>
    tabVideoMessageContracts[VideoMessageType.SHOW_REGION_SELECTOR]?.parseRequest({
      type: VideoMessageType.SHOW_REGION_SELECTOR,
    })
  ).toThrow(MessageContractError);
  expect(
    tabVideoMessageContracts[VideoMessageType.REGION_SELECTED]?.parseRequest({
      type: VideoMessageType.REGION_SELECTED,
      ...binding,
      region: { height: 20, width: 10, x: 1, y: 2 },
      captureViewport,
    })
  ).toEqual({
    type: VideoMessageType.REGION_SELECTED,
    ...binding,
    region: { height: 20, width: 10, x: 1, y: 2 },
    captureViewport,
  });
  expect(
    tabVideoMessageContracts[VideoMessageType.REGION_SELECTION_CANCELLED]?.parseRequest({
      type: VideoMessageType.REGION_SELECTION_CANCELLED,
      ...binding,
    })
  ).toEqual({ type: VideoMessageType.REGION_SELECTION_CANCELLED, ...binding });
  expect(() =>
    tabVideoMessageContracts[VideoMessageType.REGION_SELECTION_CANCELLED]?.parseRequest({
      type: VideoMessageType.REGION_SELECTION_CANCELLED,
    })
  ).toThrow(MessageContractError);
}

describe('tab-contracts/video region capture contracts', () => {
  it(
    'validates controlled cursor capture pause and resume contracts',
    verifyControlledCursorCaptureLifecycleContracts
  );
  it(
    'validates viewport cursor projection lifecycle contracts',
    verifyViewportCursorProjectionContracts
  );
  it('validates viewport calibration lifecycle contracts', verifyViewportCalibrationContracts);
  it('validates region-selection request binding contracts', verifyRegionSelectionContracts);
});

describe('tab-contracts/video recording surface lifecycle', () => {
  it('validates recording state sync sent from background to the owning content tab', () => {
    const message = {
      type: VideoMessageType.RECORDING_STATE_SYNC,
      state: {
        captureMode: null,
        captureSource: null,
        countdownEndsAt: null,
        duration: 12,
        error: null,
        liveMedia: null,
        status: VideoRecordingStatus.RECORDING,
        viewportPresetId: null,
      },
    };

    expect(
      tabVideoMessageContracts[VideoMessageType.RECORDING_STATE_SYNC]?.parseRequest(message)
    ).toEqual(message);
    expect(
      tabVideoMessageContracts[VideoMessageType.RECORDING_STATE_SYNC]?.parseResponse({
        success: true,
      })
    ).toEqual({ success: true });
    expect(() =>
      tabVideoMessageContracts[VideoMessageType.RECORDING_STATE_SYNC]?.parseRequest({
        ...message,
        state: { ...message.state, duration: '12' },
      })
    ).toThrow(MessageContractError);
  });
});
