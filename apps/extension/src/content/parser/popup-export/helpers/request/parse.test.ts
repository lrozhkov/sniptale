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
    includeHarDomLogs: false,
    includeCssDiagnostics: true,
    includeFullPageScreenshot: false,
  };
}

it('parses popup export requests and rejects malformed payloads', () => {
  expect(parsePopupExportRequest({ type: MessageType.EXPORT_POPUP_PREVIEW })).toEqual({
    type: MessageType.EXPORT_POPUP_PREVIEW,
  });
  expect(parsePopupExportRequest({ type: MessageType.EXPORT_POPUP_CANCEL })).toEqual({
    type: MessageType.EXPORT_POPUP_CANCEL,
  });
  expect(
    parsePopupExportRequest({
      options: createExportOptions(),
      requestId: 'req-1',
      type: MessageType.EXPORT_POPUP_START,
    })
  ).toEqual({
    options: createExportOptions(),
    requestId: 'req-1',
    type: MessageType.EXPORT_POPUP_START,
  });
  expect(
    parsePopupExportRequest({
      options: createExportOptions(),
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    })
  ).toEqual({
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
  expect(parsePopupExportRequest({ requestId: 42, type: MessageType.EXPORT_POPUP_START })).toBe(
    null
  );
});

it('preserves popup export content intent grants', () => {
  expect(
    parsePopupExportRequest({
      contentIntentGrant: { grantToken: 'grant-start' },
      options: createExportOptions(),
      requestId: 'req-1',
      type: MessageType.EXPORT_POPUP_START,
    })
  ).toEqual({
    contentIntentGrant: { grantToken: 'grant-start' },
    options: createExportOptions(),
    requestId: 'req-1',
    type: MessageType.EXPORT_POPUP_START,
  });

  expect(
    parsePopupExportRequest({
      contentIntentGrant: { grantToken: 'grant-package' },
      options: createExportOptions(),
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    })
  ).toEqual({
    contentIntentGrant: { grantToken: 'grant-package' },
    options: createExportOptions(),
    type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
  });
});
