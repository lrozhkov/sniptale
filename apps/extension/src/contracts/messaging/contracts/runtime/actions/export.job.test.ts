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
    captureTiming: { loadTimeoutMs: 30_000, settleDelayMs: 2_000 },
    sources: [{ kind: 'tab', tabId: 7, title: 'Page' }],
    type: MessageType.START_PAGE_PACKAGE_JOB,
    warnings: [],
  } as const;

  expect(start.parseRequest(request)).toEqual(request);
  expect(
    start.parseRequest({
      ...request,
      sources: [{ kind: 'url', url: 'https://example.com/app#/route' }],
    })
  ).toMatchObject({ sources: [{ kind: 'url', url: 'https://example.com/app#/route' }] });
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
  expect(() =>
    start.parseRequest({ ...request, sources: [{ kind: 'tab', title: 'Page' }] })
  ).toThrow();
  expect(() => start.parseRequest({ ...request, intent: 'other' })).toThrow();
  const { includeWebCopy: _omittedWebCopy, ...requestWithoutWebCopy } = request;
  expect(() => start.parseRequest(requestWithoutWebCopy)).toThrow();
  expect(() => start.parseRequest({ ...request, includeWebCopy: 'yes' })).toThrow();
  expect(() =>
    start.parseRequest({
      ...request,
      sources: [request.sources[0], { kind: 'url', url: 'https://example.com/' }],
    })
  ).toThrow();
  expect(() =>
    start.parseRequest({
      ...request,
      sources: Array.from({ length: 33 }, (_, index) => ({
        kind: 'url',
        url: `https://example.com/${index}`,
      })),
    })
  ).toThrow();
  expect(() =>
    start.parseRequest({ ...request, captureTiming: { loadTimeoutMs: 0, settleDelayMs: 0 } })
  ).toThrow();
  expect(() => start.parseRequest({ ...request, sources: null })).toThrow();
  expect(() => start.parseRequest({ ...request, warnings: null })).toThrow();
  expect(() =>
    start.parseRequest({ ...request, jobId: 'x'.repeat(MAX_POPUP_EXPORT_JOB_ID_BYTES + 1) })
  ).toThrow();
  expect(() => start.parseRequest({ ...request, jobId: '../job' })).toThrow();
  expect(() => start.parseRequest({ ...request, sources: [] })).toThrow();
  expect(() =>
    start.parseRequest({
      ...request,
      sources: [
        { kind: 'tab', tabId: 7, title: 'Page' },
        { kind: 'tab', tabId: 7, title: 'Duplicate' },
      ],
    })
  ).toThrow();
  expect(() =>
    start.parseRequest({
      ...request,
      sources: Array.from({ length: 257 }, (_, tabId) => ({ kind: 'tab', tabId, title: 'Page' })),
    })
  ).toThrow();
  expect(() =>
    start.parseRequest({ ...request, sources: [{ kind: 'tab', tabId: -1, title: 'Page' }] })
  ).toThrow();
  expect(() =>
    start.parseRequest({
      ...request,
      sources: [{ kind: 'tab', tabId: 7, title: 'Page', unexpected: true }],
    })
  ).toThrow();
  expect(() =>
    start.parseRequest({
      ...request,
      sources: [{ kind: 'tab', tabId: 7, title: '\ud83d\ude00'.repeat(4097) }],
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

it('parses every structured Page Package producer progress step', () => {
  const contract =
    runtimeActionExportMessageContracts[MessageType.WEB_SNAPSHOT_SAVE_PROGRESS_UPDATED];
  const stepKeys = [
    'annotations',
    'basicLogs',
    'cssDiagnostics',
    'files',
    'fullPageScreenshot',
    'viewportScreenshot',
    'images',
    'json',
    'markdown',
    'pageDiagnostics',
    'webSnapshotAssets',
    'webSnapshotDom',
    'webSnapshotPreview',
    'webSnapshotStyles',
    'webSnapshotWarnings',
  ] as const;

  for (const activeStepKey of stepKeys) {
    const message = {
      activeStepKey,
      current: 1,
      requestId: 'job-1',
      total: 2,
      type: MessageType.WEB_SNAPSHOT_SAVE_PROGRESS_UPDATED,
    } as const;
    expect(contract.parseRequest(message)).toEqual(message);
  }
  expect(() =>
    contract.parseRequest({
      activeStepKey: 'unknown',
      current: 1,
      requestId: 'job-1',
      total: 2,
      type: MessageType.WEB_SNAPSHOT_SAVE_PROGRESS_UPDATED,
    })
  ).toThrow();
});

it('covers routed Page Package policy branches and launch-intent responses', () => {
  const build = runtimeActionExportMessageContracts[MessageType.EXPORT_POPUP_BUILD_PACKAGE];
  const base = {
    batchRequestId: 'job-1',
    includeWebCopy: false,
    intent: 'export' as const,
    options,
    ordinal: 0,
    tabId: 7,
    tabRouteCapabilityToken: 'capability-1',
    tabRouteRequestId: 'route-1',
    type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
  };
  expect(build.parseRequest(base)).toEqual(base);
  expect(
    build.parseRequest({
      ...base,
      allowAnonymousCrossOriginAssets: true,
      allowAuthenticatedSameOriginAssets: false,
      includeWebCopy: true,
    })
  ).toMatchObject({ includeWebCopy: true });
  expect(() => build.parseRequest({ ...base, includeWebCopy: true })).toThrow();
  expect(() => build.parseRequest({ ...base, allowAnonymousCrossOriginAssets: false })).toThrow();

  const launch =
    runtimeActionExportMessageContracts[MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT];
  expect(launch.parseResponse({ page: 'export', success: true })).toEqual({
    page: 'export',
    success: true,
  });
  expect(launch.parseResponse({ page: null, success: true })).toEqual({
    page: null,
    success: true,
  });
  expect(() => launch.parseResponse({ page: 'settings', success: true })).toThrow();
});
