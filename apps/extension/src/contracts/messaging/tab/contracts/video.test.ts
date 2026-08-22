import { describe, expect, it } from 'vitest';

import { MessageContractError } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  CONTENT_RUNTIME_PROTOCOL_VERSION,
  VideoMessageType,
} from '@sniptale/runtime-contracts/video/messages';
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

describe('tab-contracts/video tab runtime contracts', () => {
  it(
    'validates controlled cursor capture pause and resume contracts',
    verifyControlledCursorCaptureLifecycleContracts
  );
  it('validates region-selection request binding contracts', verifyRegionSelectionContracts);
});

describe('tab-contracts/video content runtime readiness', () => {
  it('accepts only the current content runtime protocol version when it is present', () => {
    const response = {
      success: true,
      contentRuntimeProtocolVersion: CONTENT_RUNTIME_PROTOCOL_VERSION,
      viewport: {
        devicePixelRatio: 1,
        height: 720,
        scrollX: 0,
        scrollY: 0,
        width: 1280,
      },
    };

    expect(
      tabVideoMessageContracts[VideoMessageType.GET_VIEWPORT_COORDS]?.parseResponse(response)
    ).toBe(response);
    expect(() =>
      tabVideoMessageContracts[VideoMessageType.GET_VIEWPORT_COORDS]?.parseResponse({
        ...response,
        contentRuntimeProtocolVersion: CONTENT_RUNTIME_PROTOCOL_VERSION + 1,
      })
    ).toThrow(MessageContractError);
  });
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
