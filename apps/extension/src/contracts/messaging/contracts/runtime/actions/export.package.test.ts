import { expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { runtimeActionExportMessageContracts } from './export';

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

it('requires a non-negative integer ordinal on routed Page Package requests', () => {
  const contract = runtimeActionExportMessageContracts[MessageType.EXPORT_POPUP_BUILD_PACKAGE];
  const request = {
    batchRequestId: 'job-1',
    includeWebCopy: false,
    intent: 'export',
    options,
    ordinal: 0,
    tabId: 7,
    tabRouteCapabilityToken: 'capability-1',
    tabRouteRequestId: 'request-1',
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
  expect(() => contract.parseRequest({ ...request, includeWebCopy: 'yes' })).toThrow();
  expect(() => contract.parseRequest({ ...request, includeWebCopy: true })).toThrow();
  expect(() =>
    contract.parseRequest({ ...request, allowAnonymousCrossOriginAssets: false })
  ).toThrow();
  expect(() =>
    contract.parseRequest({ ...request, allowAnonymousCrossOriginAssets: 'yes' })
  ).toThrow();
  expect(() => contract.parseRequest({ ...request, ordinal: -1 })).toThrow();
  expect(() => contract.parseRequest({ ...request, ordinal: 0.5 })).toThrow();
});
