import { expect, it } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { parsePopupExportControlRequest } from './popup-export-control';

it('parses only payload-free popup export control requests', () => {
  expect(parsePopupExportControlRequest({ type: MessageType.EXPORT_POPUP_PREVIEW })).toEqual({
    type: MessageType.EXPORT_POPUP_PREVIEW,
  });
  expect(parsePopupExportControlRequest({ type: MessageType.EXPORT_POPUP_CANCEL })).toEqual({
    type: MessageType.EXPORT_POPUP_CANCEL,
  });
  expect(parsePopupExportControlRequest({ type: MessageType.EXPORT_POPUP_START })).toBeNull();
  expect(
    parsePopupExportControlRequest({ type: MessageType.EXPORT_POPUP_BUILD_PACKAGE })
  ).toBeNull();
  expect(
    parsePopupExportControlRequest({ type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT })
  ).toBeNull();
  expect(parsePopupExportControlRequest([])).toBeNull();
});
