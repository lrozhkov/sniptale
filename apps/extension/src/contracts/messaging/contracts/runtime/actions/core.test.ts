import { expect, it } from 'vitest';

import {
  CaptureMessageType,
  MessageType,
} from '@sniptale/runtime-contracts/messaging/message-types';
import { PageAccessOperation } from '@sniptale/runtime-contracts/messaging/page-access';
import { runtimeActionCoreMessageContracts } from './core';

const pageAccessContract = runtimeActionCoreMessageContracts[MessageType.PAGE_ACCESS];
const activationKeyContract =
  runtimeActionCoreMessageContracts[MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY];
const runtimeTokenContract =
  runtimeActionCoreMessageContracts[MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN];
const contentRuntimeWakeupContract =
  runtimeActionCoreMessageContracts[MessageType.CONTENT_RUNTIME_WAKEUP];
const annotationForkSessionContract =
  runtimeActionCoreMessageContracts[MessageType.ANNOTATION_FORK_SESSION];
const offscreenPageStorageContract =
  runtimeActionCoreMessageContracts[MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE];
const nativeFullPageContract =
  runtimeActionCoreMessageContracts[MessageType.EXPORT_CAPTURE_FULL_PAGE];
const frameAnnotationRasterContract =
  runtimeActionCoreMessageContracts[MessageType.FRAME_ANNOTATION_RASTERIZE];
const offscreenFrameAnnotationRasterContract =
  runtimeActionCoreMessageContracts[MessageType.OFFSCREEN_FRAME_ANNOTATION_RASTERIZE];
const aiSettingsNavigationContract =
  runtimeActionCoreMessageContracts[MessageType.AI_SETTINGS_NAVIGATION];
const screenshotCaptureContract =
  runtimeActionCoreMessageContracts[MessageType.TRIGGER_SCREENSHOT_CAPTURE];
const quickActionContract = runtimeActionCoreMessageContracts[MessageType.TRIGGER_QUICK_ACTION];
const prepareDesktopContract =
  runtimeActionCoreMessageContracts[MessageType.PREPARE_DESKTOP_SCREENSHOT_CAPTURE];
const offscreenDesktopPrepareContract =
  runtimeActionCoreMessageContracts[MessageType.OFFSCREEN_PREPARE_DESKTOP_FRAME];
const offscreenDesktopCaptureContract =
  runtimeActionCoreMessageContracts[MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME];

const desktopSelection = {
  dataUrl:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII=',
  height: 1,
  requestId: 'request-1',
  reservationToken: 'reservation-1',
  status: 'selected' as const,
  width: 1,
};

const validScreenshotConfig = {
  screenshotMode: 'desktop',
  viewportPresetId: null,
  delay: null,
  afterCapture: 'download_default',
  imageFormat: null,
  imageQuality: null,
  exitAfterCapture: false,
} as const;

it('parses strict popup screenshot capture requests and typed responses', () => {
  const request = {
    type: MessageType.TRIGGER_SCREENSHOT_CAPTURE,
    tabId: 7,
    desktopSelection,
    config: validScreenshotConfig,
  };
  expect(screenshotCaptureContract.parseRequest(request)).toEqual(request);
  expect(screenshotCaptureContract.parseResponse({ success: true, result: 'accepted' })).toEqual({
    success: true,
    result: 'accepted',
  });
  expect(screenshotCaptureContract.parseResponse({ success: false, error: 'blocked' })).toEqual({
    success: false,
    error: 'blocked',
  });
});

it('parses popup desktop selections and rejects malformed selections', () => {
  const request = {
    type: MessageType.TRIGGER_QUICK_ACTION,
    actionId: 'desktop-action',
    desktopSelection,
    tabId: 7,
  };
  expect(quickActionContract.parseRequest(request)).toEqual(request);
  expect(() => quickActionContract.parseRequest({ ...request, desktopSelection: 42 })).toThrow();
  expect(() =>
    screenshotCaptureContract.parseRequest({
      type: MessageType.TRIGGER_SCREENSHOT_CAPTURE,
      config: validScreenshotConfig,
      desktopSelection: { ...desktopSelection, dataUrl: 42 },
    })
  ).toThrow();
});

it('resolves desktop encoding policy before the popup opens the picker', () => {
  expect(
    prepareDesktopContract.parseRequest({
      type: MessageType.PREPARE_DESKTOP_SCREENSHOT_CAPTURE,
      actionId: 'desktop-action',
      tabId: 7,
    })
  ).toMatchObject({ actionId: 'desktop-action' });
  expect(
    prepareDesktopContract.parseRequest({
      type: MessageType.PREPARE_DESKTOP_SCREENSHOT_CAPTURE,
      config: validScreenshotConfig,
      tabId: 7,
    })
  ).toMatchObject({ config: validScreenshotConfig });
  expect(() =>
    prepareDesktopContract.parseRequest({
      type: MessageType.PREPARE_DESKTOP_SCREENSHOT_CAPTURE,
      actionId: 'desktop-action',
      config: validScreenshotConfig,
    })
  ).toThrow();

  expect(
    prepareDesktopContract.parseResponse({
      success: true,
      result: 'ready',
      imageFormat: 'webp',
      imageQuality: 72,
      requestId: 'request-1',
      reservationToken: 'reservation-1',
    })
  ).toMatchObject({ imageFormat: 'webp', imageQuality: 72 });
  expect(prepareDesktopContract.parseResponse({ success: false, error: 'blocked' })).toEqual({
    success: false,
    error: 'blocked',
  });
  for (const invalidRequest of [
    null,
    [],
    { type: MessageType.PREPARE_DESKTOP_SCREENSHOT_CAPTURE },
    { type: MessageType.PREPARE_DESKTOP_SCREENSHOT_CAPTURE, actionId: 4 },
    { type: MessageType.PREPARE_DESKTOP_SCREENSHOT_CAPTURE, config: { screenshotMode: 'desktop' } },
  ]) {
    expect(() => prepareDesktopContract.parseRequest(invalidRequest)).toThrow();
  }
  for (const invalidResponse of [
    { success: true },
    { success: true, result: 'pending', imageFormat: 'webp', imageQuality: 72 },
    { success: true, result: 'ready', imageFormat: 'gif', imageQuality: 72 },
    { success: true, result: 'ready', imageFormat: 'png', imageQuality: 0 },
    { success: true, result: 'ready', imageFormat: 'png', imageQuality: 101 },
  ]) {
    expect(() => prepareDesktopContract.parseResponse(invalidResponse)).toThrow();
  }
});

it('parses exact offscreen desktop frame responses and rejects malformed dimensions', () => {
  expect(
    offscreenDesktopPrepareContract.parseResponse({ success: true, result: 'accepted' })
  ).toEqual({ success: true, result: 'accepted' });
  expect(offscreenDesktopPrepareContract.parseResponse({ success: false, error: 'busy' })).toEqual({
    success: false,
    error: 'busy',
  });
  expect(() =>
    offscreenDesktopPrepareContract.parseResponse({ success: true, result: 'pending' })
  ).toThrow();

  const captured = {
    success: true,
    result: 'captured',
    dataUrl: 'data:image/png;base64,AA==',
    width: 1280,
    height: 720,
  } as const;
  expect(offscreenDesktopCaptureContract.parseResponse(captured)).toEqual(captured);
  expect(offscreenDesktopCaptureContract.parseResponse({ success: false, error: 'ended' })).toEqual(
    {
      success: false,
      error: 'ended',
    }
  );
  for (const invalid of [
    { ...captured, result: 'pending' },
    { ...captured, dataUrl: 'data:text/plain;base64,AA==' },
    { ...captured, width: 0 },
    { ...captured, width: 1.5 },
    { ...captured, height: -1 },
  ]) {
    expect(() => offscreenDesktopCaptureContract.parseResponse(invalid)).toThrow();
  }
});

it.each([
  { screenshotMode: 'camera' },
  { viewportPresetId: 4 },
  { delay: 2 },
  { afterCapture: 'publish' },
  { imageFormat: 'gif' },
  { imageQuality: 0 },
  { imageQuality: 101 },
  { exitAfterCapture: 'yes' },
  { extra: true },
])('rejects malformed popup screenshot config %o', (patch) => {
  expect(() =>
    screenshotCaptureContract.parseRequest({
      type: MessageType.TRIGGER_SCREENSHOT_CAPTURE,
      config: { ...validScreenshotConfig, ...patch },
    })
  ).toThrow();
});

it('binds asset ids to editor-open messages rather than runtime wakeup', () => {
  const openEditorContract = runtimeActionCoreMessageContracts[MessageType.OPEN_EDITOR_WITH_IMAGE];
  const request = {
    assetId: 'asset-1',
    dataUrl: 'data:image/png;base64,c2NyZWVueXg=',
    type: MessageType.OPEN_EDITOR_WITH_IMAGE,
  };
  expect(openEditorContract.parseRequest(request)).toEqual(request);
  expect(() =>
    contentRuntimeWakeupContract.parseRequest({
      assetId: 'asset-1',
      type: MessageType.CONTENT_RUNTIME_WAKEUP,
    })
  ).toThrow('runtime CONTENT_RUNTIME_WAKEUP message');
});

it('bounds AI settings navigation to the two modal-owned destinations', () => {
  expect(
    aiSettingsNavigationContract.parseRequest({
      contentIntent: { requestId: 'request-1', token: 'token-1' },
      section: 'ai-prompts',
      type: MessageType.AI_SETTINGS_NAVIGATION,
    })
  ).toEqual({
    contentIntent: { requestId: 'request-1', token: 'token-1' },
    section: 'ai-prompts',
    type: MessageType.AI_SETTINGS_NAVIGATION,
  });
  expect(() =>
    aiSettingsNavigationContract.parseRequest({
      section: 'annotations',
      type: MessageType.AI_SETTINGS_NAVIGATION,
    })
  ).toThrow();
});

it('parses bounded frame-annotation raster references and authoritative results', () => {
  const reference = { inputSha256: 'a'.repeat(64), jobId: 'job-1', revision: 1 };
  expect(
    frameAnnotationRasterContract.parseRequest({
      type: MessageType.FRAME_ANNOTATION_RASTERIZE,
      operation: 'rasterize',
      reference,
    })
  ).toMatchObject({ reference });
  expect(
    frameAnnotationRasterContract.parseResponse({ success: true, result: 'completed' })
  ).toMatchObject({ result: 'completed' });
  expect(
    frameAnnotationRasterContract.parseResponse({ success: false, error: 'raster failed' })
  ).toEqual({ success: false, error: 'raster failed' });
  expect(() => frameAnnotationRasterContract.parseResponse({ success: true })).toThrow();
  expect(
    offscreenFrameAnnotationRasterContract.parseRequest({
      type: MessageType.OFFSCREEN_FRAME_ANNOTATION_RASTERIZE,
      capabilityToken: 'capability',
      reference,
    })
  ).toMatchObject({ reference });
  for (const invalidReference of [
    null,
    { ...reference, jobId: 4 },
    { ...reference, inputSha256: 3 },
    { ...reference, revision: -1 },
    { ...reference, revision: 1.5 },
  ]) {
    expect(() =>
      frameAnnotationRasterContract.parseRequest({
        type: MessageType.FRAME_ANNOTATION_RASTERIZE,
        operation: 'rasterize',
        reference: invalidReference,
      })
    ).toThrow();
  }
  expect(() =>
    frameAnnotationRasterContract.parseRequest({
      type: MessageType.FRAME_ANNOTATION_RASTERIZE,
      reference,
    })
  ).toThrow();
});

it('requires a bounded correlation identity for frame-annotation raster preparation', () => {
  expect(
    frameAnnotationRasterContract.parseRequest({
      type: MessageType.FRAME_ANNOTATION_RASTERIZE,
      operation: 'prepare',
      leaseId: 'lease-1',
    })
  ).toMatchObject({ leaseId: 'lease-1' });
  for (const leaseId of [undefined, '', 'x'.repeat(129)]) {
    expect(() =>
      frameAnnotationRasterContract.parseRequest({
        type: MessageType.FRAME_ANNOTATION_RASTERIZE,
        operation: 'prepare',
        leaseId,
      })
    ).toThrow();
  }
});

it('parses page-access requests', () => {
  expect(
    pageAccessContract.parseRequest({
      operation: PageAccessOperation.ACTIVATE_CURRENT_TAB,
      tabId: 7,
      type: MessageType.PAGE_ACCESS,
    })
  ).toEqual({
    operation: PageAccessOperation.ACTIVATE_CURRENT_TAB,
    tabId: 7,
    type: MessageType.PAGE_ACCESS,
  });
});

it('parses page-access responses', () => {
  expect(
    pageAccessContract.parseResponse({
      result: 'activated',
      status: {
        allSitesGranted: false,
        currentTabActive: true,
        currentTabId: 7,
        currentTabOrigin: 'https://example.test',
        siteGranted: false,
        supported: true,
      },
      success: true,
    })
  ).toEqual(
    expect.objectContaining({
      result: 'activated',
      success: true,
    })
  );
});

it('rejects unsupported operations', () => {
  expect(() =>
    pageAccessContract.parseRequest({
      operation: 'grant-everything',
      type: MessageType.PAGE_ACCESS,
    })
  ).toThrow();
});

it('rejects malformed statuses', () => {
  expect(() =>
    pageAccessContract.parseResponse({
      status: {
        allSitesGranted: false,
        currentTabActive: true,
        currentTabId: '7',
        currentTabOrigin: 'https://example.test',
        siteGranted: false,
        supported: true,
      },
      success: true,
    })
  ).toThrow();
});

it('parses content privileged activation-key requests and responses', () => {
  expect(
    activationKeyContract.parseRequest({
      purpose: 'trusted-content-event',
      type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY,
    })
  ).toEqual({
    purpose: 'trusted-content-event',
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY,
  });
  expect(
    activationKeyContract.parseResponse({
      activationKey: { expiresAtEpochMs: 1_000, keyId: 'activation-1', secret: 'secret-1' },
      success: true,
    })
  ).toEqual({
    activationKey: { expiresAtEpochMs: 1_000, keyId: 'activation-1', secret: 'secret-1' },
    success: true,
  });
});

it('parses content runtime wake-up responses with bounded restore reasons', () => {
  expect(
    contentRuntimeWakeupContract.parseResponse({
      pinToTab: true,
      pinToTabAvailable: true,
      reason: 'pin-to-tab',
      restored: true,
      success: true,
    })
  ).toEqual({
    pinToTab: true,
    pinToTabAvailable: true,
    reason: 'pin-to-tab',
    restored: true,
    success: true,
  });
  expect(
    contentRuntimeWakeupContract.parseResponse({
      pinToTab: false,
      pinToTabAvailable: true,
      reason: 'scenario',
      restored: true,
      success: true,
    })
  ).toEqual({
    pinToTab: false,
    pinToTabAvailable: true,
    reason: 'scenario',
    restored: true,
    success: true,
  });
  expect(
    contentRuntimeWakeupContract.parseResponse({
      error: 'wake-up failed',
      success: false,
    })
  ).toEqual({
    error: 'wake-up failed',
    success: false,
  });
  expect(() =>
    contentRuntimeWakeupContract.parseResponse({
      pinToTab: true,
      restored: false,
      success: true,
    })
  ).toThrow();
  expect(() =>
    contentRuntimeWakeupContract.parseResponse({
      reason: 'other',
      restored: true,
      success: true,
    })
  ).toThrow();
});

it('parses a capability-bound pin-to-tab activation request', () => {
  expect(
    contentRuntimeWakeupContract.parseRequest({
      contentIntent: { requestId: 'pin-request-1', token: 'pin-token-1' },
      pinToTab: true,
      type: MessageType.CONTENT_RUNTIME_WAKEUP,
    })
  ).toEqual({
    contentIntent: { requestId: 'pin-request-1', token: 'pin-token-1' },
    pinToTab: true,
    type: MessageType.CONTENT_RUNTIME_WAKEUP,
  });
});

it('bounds tab-scoped annotation fork session operations', () => {
  expect(
    annotationForkSessionContract.parseRequest({
      expectedRevision: 2,
      operation: 'write',
      payload: '{"version":1}',
      type: MessageType.ANNOTATION_FORK_SESSION,
    })
  ).toMatchObject({ operation: 'write' });
  expect(() =>
    annotationForkSessionContract.parseRequest({
      expectedRevision: 2,
      operation: 'write',
      payload: 'x'.repeat(500_001),
      type: MessageType.ANNOTATION_FORK_SESSION,
    })
  ).toThrow();
  expect(() =>
    annotationForkSessionContract.parseRequest({
      operation: 'read',
      payload: '{}',
      type: MessageType.ANNOTATION_FORK_SESSION,
    })
  ).toThrow();
});

it('parses content runtime wake-up requests', () => {
  expect(
    contentRuntimeWakeupContract.parseRequest({
      pinToTab: true,
      type: MessageType.CONTENT_RUNTIME_WAKEUP,
    })
  ).toEqual({
    pinToTab: true,
    type: MessageType.CONTENT_RUNTIME_WAKEUP,
  });
  expect(() =>
    contentRuntimeWakeupContract.parseRequest({
      pinToTab: 'yes',
      type: MessageType.CONTENT_RUNTIME_WAKEUP,
    })
  ).toThrow();
});

it('strictly parses the offscreen page-storage privacy command and result', () => {
  expect(
    offscreenPageStorageContract.parseRequest({
      type: MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE,
      capabilityToken: 'capability-1',
      operation: 'erase',
      preservePreferences: true,
    })
  ).toEqual(
    expect.objectContaining({
      operation: 'erase',
      preservePreferences: true,
    })
  );
  expect(
    offscreenPageStorageContract.parseResponse({
      success: true,
      empty: true,
      removedCount: 2,
    })
  ).toEqual({ success: true, empty: true, removedCount: 2 });
  expect(() =>
    offscreenPageStorageContract.parseRequest({
      type: MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE,
      capabilityToken: 'capability-1',
      operation: 'drop-all',
      preservePreferences: true,
    })
  ).toThrow();
});

it('requires an explicit export identity for native full-page capture', () => {
  expect(
    nativeFullPageContract.parseRequest({
      contentIntent: { requestId: 'batch-1', token: 'token-1' },
      exportRunId: 'batch-1',
      type: MessageType.EXPORT_CAPTURE_FULL_PAGE,
    })
  ).toEqual({
    contentIntent: { requestId: 'batch-1', token: 'token-1' },
    exportRunId: 'batch-1',
    type: MessageType.EXPORT_CAPTURE_FULL_PAGE,
  });
  expect(() =>
    nativeFullPageContract.parseRequest({
      type: MessageType.EXPORT_CAPTURE_FULL_PAGE,
    })
  ).toThrow();
});

it('requires activation proof and operation binding for runtime-token requests', () => {
  expect(
    runtimeTokenContract.parseRequest({
      activationProof: { expiresAtEpochMs: 1_000, keyId: 'activation-1', secret: 'secret-1' },
      actionType: CaptureMessageType.CAPTURE_VISIBLE,
      requestId: 'request-1',
      type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
    })
  ).toEqual({
    activationProof: { expiresAtEpochMs: 1_000, keyId: 'activation-1', secret: 'secret-1' },
    actionType: CaptureMessageType.CAPTURE_VISIBLE,
    requestId: 'request-1',
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
  });
  expect(() =>
    runtimeTokenContract.parseRequest({
      actionType: CaptureMessageType.CAPTURE_VISIBLE,
      requestId: 'request-1',
      type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
    })
  ).toThrow();
});
