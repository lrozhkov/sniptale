import { expect, it } from 'vitest';

import { MessageContractError } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import { parseBackgroundRuntimeMessage, parseRuntimeResponseForMessage } from '../parsers/boundary';
import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/message-types';

function createScenarioCaptureRequest() {
  return {
    type: CaptureMessageType.CAPTURE_VISIBLE,
    actionType: 'download_default' as const,
    scenarioCapture: {
      captureSurface: 'visible' as const,
      sourceKind: 'manual' as const,
      page: {
        title: 'Page',
        url: 'https://example.com',
        viewport: { x: 0, y: 0, width: 1280, height: 720 },
        scrollX: 0,
        scrollY: 0,
        devicePixelRatio: 1,
      },
      target: null,
      interactionPoint: { x: 1, y: 2 },
      cursorPoint: { x: 3, y: 4 },
      title: 'Capture',
      body: 'Body',
    },
  };
}

it('parses capture requests with optional scenario metadata', () => {
  const request = parseBackgroundRuntimeMessage(createScenarioCaptureRequest());

  expect(request.type).toBe(CaptureMessageType.CAPTURE_VISIBLE);
  if (request.type !== CaptureMessageType.CAPTURE_VISIBLE) {
    throw new Error('Expected visible capture request');
  }

  expect(request.scenarioCapture?.cursorPoint).toEqual({ x: 3, y: 4 });
});

it('parses capture success responses', () => {
  expect(
    parseRuntimeResponseForMessage(CaptureMessageType.CAPTURE_FULL, {
      success: true,
      dataUrl: 'data:image/png;base64,1',
      action: 'download_default',
    })
  ).toEqual({
    success: true,
    dataUrl: 'data:image/png;base64,1',
    action: 'download_default',
  });
});

it('parses crop responses and rejects malformed scenario payloads', () => {
  expect(
    parseRuntimeResponseForMessage(CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP, {
      success: true,
      dataUrl: 'data:image/png;base64,crop',
    })
  ).toEqual({
    success: true,
    dataUrl: 'data:image/png;base64,crop',
  });

  expect(() =>
    parseBackgroundRuntimeMessage({
      type: CaptureMessageType.CAPTURE_FULL,
      scenarioCapture: {
        captureSurface: 'invalid',
        sourceKind: 'manual',
        page: {
          title: 'Page',
          url: 'https://example.com',
          viewport: { x: 0, y: 0, width: 1280, height: 720 },
          scrollX: 0,
          scrollY: 0,
          devicePixelRatio: 1,
        },
      },
    })
  ).toThrow(MessageContractError);
});
