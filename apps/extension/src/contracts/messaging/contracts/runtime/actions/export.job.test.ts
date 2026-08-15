import { expect, it } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { runtimeActionExportMessageContracts } from './export';

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
  const start = runtimeActionExportMessageContracts[MessageType.START_POPUP_EXPORT_JOB];
  const getStatus = runtimeActionExportMessageContracts[MessageType.GET_POPUP_EXPORT_JOB_STATUS];
  const cancel = runtimeActionExportMessageContracts[MessageType.CANCEL_POPUP_EXPORT_JOB];
  const ack = runtimeActionExportMessageContracts[MessageType.ACK_POPUP_EXPORT_JOB_STATUS];
  const request = {
    jobId: 'job-1',
    options,
    orderedTabs: [{ tabId: 7, title: 'Page' }],
    type: MessageType.START_POPUP_EXPORT_JOB,
    warnings: [],
  } as const;

  expect(start.parseRequest(request)).toEqual(request);
  expect(
    getStatus.parseRequest({ jobId: 'job-1', type: MessageType.GET_POPUP_EXPORT_JOB_STATUS })
  ).toEqual({ jobId: 'job-1', type: MessageType.GET_POPUP_EXPORT_JOB_STATUS });
  expect(
    cancel.parseRequest({ jobId: 'job-1', type: MessageType.CANCEL_POPUP_EXPORT_JOB })
  ).toEqual({ jobId: 'job-1', type: MessageType.CANCEL_POPUP_EXPORT_JOB });
  expect(
    ack.parseRequest({ jobId: 'job-1', type: MessageType.ACK_POPUP_EXPORT_JOB_STATUS })
  ).toEqual({ jobId: 'job-1', type: MessageType.ACK_POPUP_EXPORT_JOB_STATUS });
  expect(ack.parseRequest({ type: MessageType.ACK_POPUP_EXPORT_JOB_STATUS })).toEqual({
    type: MessageType.ACK_POPUP_EXPORT_JOB_STATUS,
  });
  expect(() => start.parseRequest({ ...request, orderedTabs: [{ title: 'Page' }] })).toThrow();
  expect(() => start.parseRequest({ ...request, orderedTabs: null })).toThrow();
  expect(() => start.parseRequest({ ...request, warnings: null })).toThrow();

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
    requestCapability.parseRequest({ ...capabilityRequest, operation: 'UNKNOWN_OPERATION' })
  ).toThrow();
});
