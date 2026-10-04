import { expect, it } from 'vitest';
import { MAX_BROWSER_ANNOTATIONS_EXPORT_TEXT_BYTES } from '@sniptale/runtime-contracts/export';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

import { contentActionRuntimeContracts } from './content-action';

it('parses bounded annotation download and popup-open content actions', () => {
  const contentIntent = { requestId: 'request-1', token: 'token-1' };
  expect(
    contentActionRuntimeContracts[MessageType.DOWNLOAD_BROWSER_ANNOTATIONS].parseRequest({
      contentIntent,
      text: '',
      type: MessageType.DOWNLOAD_BROWSER_ANNOTATIONS,
    })
  ).toEqual({
    contentIntent,
    text: '',
    type: MessageType.DOWNLOAD_BROWSER_ANNOTATIONS,
  });
  expect(
    contentActionRuntimeContracts[MessageType.DOWNLOAD_BROWSER_ANNOTATIONS].parseRequest({
      contentIntent,
      text: '# Browser comments:\n',
      type: MessageType.DOWNLOAD_BROWSER_ANNOTATIONS,
    })
  ).toEqual({
    contentIntent,
    text: '# Browser comments:\n',
    type: MessageType.DOWNLOAD_BROWSER_ANNOTATIONS,
  });
  expect(
    contentActionRuntimeContracts[MessageType.OPEN_EXPORT_MODAL].parseRequest({
      contentIntent,
      type: MessageType.OPEN_EXPORT_MODAL,
    })
  ).toEqual({ contentIntent, type: MessageType.OPEN_EXPORT_MODAL });
});

it('rejects oversized and malformed annotation download payloads', () => {
  const contract = contentActionRuntimeContracts[MessageType.DOWNLOAD_BROWSER_ANNOTATIONS];
  expect(() =>
    contract.parseRequest({
      text: 'x'.repeat(MAX_BROWSER_ANNOTATIONS_EXPORT_TEXT_BYTES + 1),
      type: MessageType.DOWNLOAD_BROWSER_ANNOTATIONS,
    })
  ).toThrow();
  expect(() =>
    contract.parseRequest({ text: 7, type: MessageType.DOWNLOAD_BROWSER_ANNOTATIONS })
  ).toThrow();
});

it('accepts explicit launch mode and rejects malformed launch mode', () => {
  const contract = contentActionRuntimeContracts[MessageType.OPEN_EXPORT_MODAL];
  for (const startExport of [false, true]) {
    const request = { type: MessageType.OPEN_EXPORT_MODAL, startExport };
    expect(contract.parseRequest(request)).toEqual(request);
  }
  for (const startExport of ['true', 1, null, {}]) {
    expect(() =>
      contract.parseRequest({ type: MessageType.OPEN_EXPORT_MODAL, startExport })
    ).toThrow();
  }
});
