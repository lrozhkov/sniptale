import { describe, expect, it } from 'vitest';

import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { runtimeActionCaptureMessageContracts } from './capture';

function createScenarioCaptureRequest() {
  return {
    actionType: 'copy' as const,
    scenarioCapture: {
      body: 'Body',
      captureSurface: 'visible' as const,
      cursorPoint: { x: 3, y: 4 },
      interactionPoint: { x: 1, y: 2 },
      page: {
        devicePixelRatio: 1,
        scrollX: 0,
        scrollY: 0,
        title: 'Page',
        url: 'https://example.com',
        viewport: { height: 720, width: 1280, x: 0, y: 0 },
      },
      sourceKind: 'manual' as const,
      target: null,
      title: 'Title',
    },
    type: CaptureMessageType.CAPTURE_VISIBLE,
  };
}

describe('runtimeActionCaptureMessageContracts', () => {
  it('parses visible/full capture requests with optional scenario payloads', () => {
    expect(
      runtimeActionCaptureMessageContracts[CaptureMessageType.CAPTURE_VISIBLE].parseRequest(
        createScenarioCaptureRequest()
      )
    ).toEqual(
      expect.objectContaining({
        actionType: 'copy',
        type: CaptureMessageType.CAPTURE_VISIBLE,
      })
    );

    expect(
      runtimeActionCaptureMessageContracts[CaptureMessageType.CAPTURE_FULL].parseResponse({
        action: 'download_default',
        dataUrl: 'data:image/png;base64,abc',
        success: true,
      })
    ).toEqual({
      action: 'download_default',
      dataUrl: 'data:image/png;base64,abc',
      success: true,
    });
  });

  it('parses crop requests and rejects malformed scenario capture payloads', () => {
    expect(
      runtimeActionCaptureMessageContracts[
        CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP
      ].parseRequest({
        type: CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP,
      })
    ).toEqual({ type: CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP });

    expect(() =>
      runtimeActionCaptureMessageContracts[CaptureMessageType.CAPTURE_VISIBLE].parseRequest({
        scenarioCapture: {
          captureSurface: 'invalid',
          page: { title: 'Page', url: 'https://example.com' },
          sourceKind: 'manual',
        },
        type: CaptureMessageType.CAPTURE_VISIBLE,
      })
    ).toThrow();
  });
});
