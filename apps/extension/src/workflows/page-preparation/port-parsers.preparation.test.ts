import { expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  WEB_SNAPSHOT_VIEWER_PREPARATION_REQUEST,
  WEB_SNAPSHOT_VIEWER_PREPARATION_RESPONSE,
} from './contracts';
import {
  parseViewerPreparationPortRequest,
  parseViewerPreparationPortResponse,
} from './port-parsers';

it('parses correlated preparation request envelopes', () => {
  expect(
    parseViewerPreparationPortRequest({
      command: { type: MessageType.ENABLE_SCREENSHOT_MODE, viewport: null },
      requestId: 'prep-1',
      type: WEB_SNAPSHOT_VIEWER_PREPARATION_REQUEST,
      viewerPortGeneration: 'viewer-generation-1',
    })
  ).toEqual({
    command: { type: MessageType.ENABLE_SCREENSHOT_MODE, viewport: null },
    requestId: 'prep-1',
    type: WEB_SNAPSHOT_VIEWER_PREPARATION_REQUEST,
    viewerPortGeneration: 'viewer-generation-1',
  });
});

it('parses correlated preparation response envelopes', () => {
  expect(
    parseViewerPreparationPortResponse(
      {
        error: 'failed',
        requestId: 'prep-1',
        success: false,
        type: WEB_SNAPSHOT_VIEWER_PREPARATION_RESPONSE,
        viewerPortGeneration: 'viewer-generation-1',
      },
      'prep-1'
    )
  ).toEqual({
    error: 'failed',
    requestId: 'prep-1',
    success: false,
    type: WEB_SNAPSHOT_VIEWER_PREPARATION_RESPONSE,
    viewerPortGeneration: 'viewer-generation-1',
  });
});

it('rejects malformed preparation request and response envelopes', () => {
  expect(
    parseViewerPreparationPortRequest({
      command: { type: MessageType.SET_VIEWPORT, viewport: { height: 720, width: '1280' } },
      requestId: 'prep-1',
      type: WEB_SNAPSHOT_VIEWER_PREPARATION_REQUEST,
      viewerPortGeneration: 'viewer-generation-1',
    })
  ).toBeNull();
  expect(
    parseViewerPreparationPortResponse(
      {
        requestId: 'other-prep',
        success: true,
        type: WEB_SNAPSHOT_VIEWER_PREPARATION_RESPONSE,
        viewerPortGeneration: 'viewer-generation-1',
      },
      'prep-1'
    )
  ).toBeNull();
});
