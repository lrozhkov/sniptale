import { expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { tabUiExportMessageContracts } from './ui-export';

const options = {
  includeBasicLogs: false,
  includeCssDiagnostics: false,
  includeFiles: true,
  includeFullPageScreenshot: false,
  includeImages: true,
  includeJson: true,
  includeMarkdown: true,
  includePageDiagnostics: false,
};

it('requires a non-negative integer ordinal on content Page Package requests', () => {
  const contract = tabUiExportMessageContracts[MessageType.EXPORT_POPUP_BUILD_PACKAGE];
  const request = {
    batchRequestId: 'job-1',
    includeWebCopy: false,
    intent: 'export',
    options,
    ordinal: 0,
    type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
  } as const;

  expect(contract.parseRequest(request)).toEqual(request);
  expect(
    contract.parseRequest({
      ...request,
      allowAnonymousCrossOriginAssets: true,
      allowAuthenticatedSameOriginAssets: false,
      includeWebCopy: true,
      intent: 'save',
    })
  ).toMatchObject({ intent: 'save', allowAnonymousCrossOriginAssets: true });
  expect(() => contract.parseRequest({ ...request, intent: 'other' })).toThrow();
  const { includeWebCopy: _omittedWebCopy, ...requestWithoutWebCopy } = request;
  expect(() => contract.parseRequest(requestWithoutWebCopy)).toThrow();
  expect(() => contract.parseRequest({ ...request, includeWebCopy: 'yes' })).toThrow();
  expect(() => contract.parseRequest({ ...request, includeWebCopy: true })).toThrow();
  expect(() =>
    contract.parseRequest({ ...request, allowAnonymousCrossOriginAssets: false })
  ).toThrow();
  expect(() =>
    contract.parseRequest({ ...request, allowAuthenticatedSameOriginAssets: 'yes' })
  ).toThrow();
  expect(
    contract.parseRequest({
      ...request,
      contentIntentGrant: { grantToken: 'grant-1' },
      fullPageCaptureAction: MessageType.EXPORT_CAPTURE_FULL_PAGE,
    })
  ).toMatchObject({ contentIntentGrant: { grantToken: 'grant-1' } });
  expect(() =>
    contract.parseRequest({
      ...request,
      contentIntentGrant: { grantToken: 'grant-1', extra: true },
    })
  ).toThrow();
  expect(() => contract.parseRequest({ ...request, ordinal: -1 })).toThrow();
  expect(() => contract.parseRequest({ ...request, ordinal: Number.NaN })).toThrow();
});

it('keeps the launch-intent response narrowed to the export page or no page', () => {
  const contract = tabUiExportMessageContracts[MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT];

  expect(contract.parseResponse({ page: 'export', success: true })).toEqual({
    page: 'export',
    success: true,
  });
  expect(contract.parseResponse({ page: null, success: true })).toEqual({
    page: null,
    success: true,
  });
  expect(() => contract.parseResponse({ page: 'settings', success: true })).toThrow();
});
