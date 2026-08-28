import { expect, it } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { MAX_POPUP_EXPORT_JOB_ID_BYTES } from '@sniptale/runtime-contracts/export';
import { runtimeActionExportMessageContracts } from './export';
import { parseRuntimeRequestMessage } from '../../../parsers/boundary';

const options = {
  includeBasicLogs: false,
  includeCssDiagnostics: false,
  includeFiles: true,
  includeFullPageScreenshot: true,
  includeImages: true,
  includeJson: true,
  includeMarkdown: true,
  includePageDiagnostics: false,
};

it('parses the native popup export job lifecycle contracts', () => {
  const start = runtimeActionExportMessageContracts[MessageType.START_PAGE_PACKAGE_JOB];
  const getStatus = runtimeActionExportMessageContracts[MessageType.GET_PAGE_PACKAGE_JOB_STATUS];
  const cancel = runtimeActionExportMessageContracts[MessageType.CANCEL_PAGE_PACKAGE_JOB];
  const ack = runtimeActionExportMessageContracts[MessageType.ACK_PAGE_PACKAGE_JOB_STATUS];
  const request = {
    includeWebCopy: false,
    intent: 'export',
    jobId: 'job-1',
    options,
    orderedTabs: [{ tabId: 7, title: 'Page' }],
    type: MessageType.START_PAGE_PACKAGE_JOB,
    warnings: [],
  } as const;

  expect(start.parseRequest(request)).toEqual(request);
  expect(
    start.parseRequest({ ...request, jobId: 'x'.repeat(MAX_POPUP_EXPORT_JOB_ID_BYTES) })
  ).toMatchObject({ jobId: 'x'.repeat(MAX_POPUP_EXPORT_JOB_ID_BYTES) });
  expect(
    getStatus.parseRequest({ jobId: 'job-1', type: MessageType.GET_PAGE_PACKAGE_JOB_STATUS })
  ).toEqual({ jobId: 'job-1', type: MessageType.GET_PAGE_PACKAGE_JOB_STATUS });
  expect(
    cancel.parseRequest({ jobId: 'job-1', type: MessageType.CANCEL_PAGE_PACKAGE_JOB })
  ).toEqual({ jobId: 'job-1', type: MessageType.CANCEL_PAGE_PACKAGE_JOB });
  expect(
    ack.parseRequest({ jobId: 'job-1', type: MessageType.ACK_PAGE_PACKAGE_JOB_STATUS })
  ).toEqual({ jobId: 'job-1', type: MessageType.ACK_PAGE_PACKAGE_JOB_STATUS });
  expect(ack.parseRequest({ type: MessageType.ACK_PAGE_PACKAGE_JOB_STATUS })).toEqual({
    type: MessageType.ACK_PAGE_PACKAGE_JOB_STATUS,
  });
  expect(() => start.parseRequest({ ...request, orderedTabs: [{ title: 'Page' }] })).toThrow();
  expect(() => start.parseRequest({ ...request, intent: 'other' })).toThrow();
  const { includeWebCopy: _omittedWebCopy, ...requestWithoutWebCopy } = request;
  expect(() => start.parseRequest(requestWithoutWebCopy)).toThrow();
  expect(() => start.parseRequest({ ...request, includeWebCopy: 'yes' })).toThrow();
  expect(() => start.parseRequest({ ...request, orderedTabs: null })).toThrow();
  expect(() => start.parseRequest({ ...request, warnings: null })).toThrow();
  expect(() =>
    start.parseRequest({ ...request, jobId: 'x'.repeat(MAX_POPUP_EXPORT_JOB_ID_BYTES + 1) })
  ).toThrow();
  expect(() => start.parseRequest({ ...request, jobId: '../job' })).toThrow();
  expect(() => start.parseRequest({ ...request, orderedTabs: [] })).toThrow();
  expect(() =>
    start.parseRequest({
      ...request,
      orderedTabs: [
        { tabId: 7, title: 'Page' },
        { tabId: 7, title: 'Duplicate' },
      ],
    })
  ).toThrow();
  expect(() =>
    start.parseRequest({
      ...request,
      orderedTabs: Array.from({ length: 257 }, (_, tabId) => ({ tabId, title: 'Page' })),
    })
  ).toThrow();
  expect(() =>
    start.parseRequest({ ...request, orderedTabs: [{ tabId: -1, title: 'Page' }] })
  ).toThrow();
  expect(() =>
    start.parseRequest({
      ...request,
      orderedTabs: [{ tabId: 7, title: 'Page', unexpected: true }],
    })
  ).toThrow();
  expect(() =>
    start.parseRequest({
      ...request,
      orderedTabs: [{ tabId: 7, title: '\ud83d\ude00'.repeat(4097) }],
    })
  ).toThrow();
  expect(() =>
    start.parseRequest({ ...request, warnings: ['\ud83d\ude00'.repeat(4097)] })
  ).toThrow();
  expect(() =>
    start.parseRequest({
      ...request,
      warnings: Array.from({ length: 33 }, () => 'x'.repeat(16384)),
    })
  ).toThrow();

  const requestCapability =
    runtimeActionExportMessageContracts[MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY];
  const capabilityRequest = {
    operation: MessageType.EXPORT_POPUP_PREVIEW,
    requestId: 'route-1',
    tabId: 7,
    type: MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY,
  } as const;
  expect(requestCapability.parseRequest(capabilityRequest)).toEqual(capabilityRequest);
  expect(() => requestCapability.parseRequest({ ...capabilityRequest, operation: 7 })).toThrow();
  expect(() =>
    requestCapability.parseRequest({
      ...capabilityRequest,
      operation: MessageType.EXPORT_POPUP_CANCEL,
    })
  ).toThrow();
  expect(() =>
    parseRuntimeRequestMessage({
      exportRunId: 'completed-job',
      tabId: 7,
      tabRouteCapabilityToken: 'retired-capability',
      tabRouteRequestId: 'retired-request',
      type: MessageType.EXPORT_POPUP_CANCEL,
    })
  ).toThrow();
  expect(() =>
    requestCapability.parseRequest({ ...capabilityRequest, operation: 'UNKNOWN_OPERATION' })
  ).toThrow();
});
