import { expect, it } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { parsePopupExportRequest } from './parse';

function createExportOptions() {
  return {
    includeJson: true,
    includeMarkdown: false,
    includeFiles: true,
    includeImages: false,
    includeBasicLogs: true,
    includePageDiagnostics: false,
    includeCssDiagnostics: true,
    includeFullPageScreenshot: false,
  };
}

it('parses popup export requests and rejects malformed payloads', () => {
  expect(parsePopupExportRequest({ type: MessageType.EXPORT_POPUP_PREVIEW })).toEqual({
    type: MessageType.EXPORT_POPUP_PREVIEW,
  });
  expect(
    parsePopupExportRequest({
      exportRunId: 'export-run-1',
      type: MessageType.EXPORT_POPUP_CANCEL,
    })
  ).toEqual({
    exportRunId: 'export-run-1',
    type: MessageType.EXPORT_POPUP_CANCEL,
  });
  expect(
    parsePopupExportRequest({
      batchRequestId: 'batch-1',
      options: createExportOptions(),
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    })
  ).toEqual({
    batchRequestId: 'batch-1',
    options: createExportOptions(),
    type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
  });
  expect(
    parsePopupExportRequest({
      allowAnonymousCrossOriginAssets: false,
      allowAuthenticatedSameOriginAssets: true,
      requestId: 'snapshot-req',
      type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
    })
  ).toEqual({
    allowAnonymousCrossOriginAssets: false,
    allowAuthenticatedSameOriginAssets: true,
    requestId: 'snapshot-req',
    type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
  });
  expect(
    parsePopupExportRequest({
      requestId: 'snapshot-req',
      type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
    })
  ).toBe(null);
  expect(parsePopupExportRequest({ requestId: 'req-1', type: 'RETIRED_EXPORT_MESSAGE' })).toBe(
    null
  );
});

it('keeps package requests data-only', () => {
  expect(
    parsePopupExportRequest({
      batchRequestId: 'batch-2',
      contentIntentGrant: { grantToken: 'grant-package' },
      options: createExportOptions(),
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    })
  ).toEqual({
    batchRequestId: 'batch-2',
    options: createExportOptions(),
    type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
  });
});
