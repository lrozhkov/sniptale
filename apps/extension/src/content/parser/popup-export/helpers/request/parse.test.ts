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
      includeWebCopy: false,
      intent: 'export',
      ordinal: 0,
      options: createExportOptions(),
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    })
  ).toEqual({
    batchRequestId: 'batch-1',
    includeWebCopy: false,
    intent: 'export',
    ordinal: 0,
    options: createExportOptions(),
    type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
  });
  expect(
    parsePopupExportRequest({
      batchRequestId: 'batch-missing-plan',
      intent: 'export',
      ordinal: 0,
      options: createExportOptions(),
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    })
  ).toBe(null);
  expect(
    parsePopupExportRequest({
      batchRequestId: 'batch-invalid-plan',
      includeWebCopy: 'yes',
      intent: 'export',
      ordinal: 0,
      options: createExportOptions(),
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    })
  ).toBe(null);
  expect(
    parsePopupExportRequest({
      batchRequestId: 'batch-copy-without-policy',
      includeWebCopy: true,
      intent: 'export',
      ordinal: 0,
      options: createExportOptions(),
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    })
  ).toBe(null);
  expect(
    parsePopupExportRequest({
      allowAnonymousCrossOriginAssets: false,
      batchRequestId: 'batch-export-with-policy',
      includeWebCopy: false,
      intent: 'export',
      ordinal: 0,
      options: createExportOptions(),
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
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
      fullPageCaptureAction: MessageType.EXPORT_CAPTURE_FULL_PAGE,
      includeWebCopy: false,
      intent: 'export',
      options: createExportOptions(),
      ordinal: 2,
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    })
  ).toEqual({
    batchRequestId: 'batch-2',
    contentIntentGrant: { grantToken: 'grant-package' },
    fullPageCaptureAction: MessageType.EXPORT_CAPTURE_FULL_PAGE,
    includeWebCopy: false,
    intent: 'export',
    options: createExportOptions(),
    ordinal: 2,
    type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
  });
});

it('drops malformed privileged fields without widening the admitted request', () => {
  expect(
    parsePopupExportRequest({
      batchRequestId: 'batch-3',
      contentIntentGrant: { grantToken: 7 },
      fullPageCaptureAction: 'OTHER_CAPTURE',
      includeWebCopy: false,
      intent: 'export',
      options: createExportOptions(),
      ordinal: 0,
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    })
  ).toEqual({
    batchRequestId: 'batch-3',
    includeWebCopy: false,
    intent: 'export',
    options: createExportOptions(),
    ordinal: 0,
    type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
  });
});
