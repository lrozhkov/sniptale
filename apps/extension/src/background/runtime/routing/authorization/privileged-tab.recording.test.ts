import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { RouteCaptureMessage } from '../../../capture/routing';
import { resetGalleryImageUpdateCapabilitiesForTests } from '../../../capture/routing/gallery-update-capabilities';
import { issueExportHarStartCapability } from '../../../diagnostics/export-har-collector/start-capability';
import { authorizePrivilegedTabRoute } from './privileged-tab';
import { getPreauthorizedContentActionRouteMessage } from '../../../capture/routing/authorization/content-action';
import {
  resetContentPrivilegedActionCapabilitiesForTests,
  routeContentPrivilegedActionProofRequest,
  routeContentPrivilegedActionCapabilityRequest,
} from '../../../routing-contracts/capabilities/content-action/route';
import {
  issueContentActionRuntimeTokenForTest,
  resolveContentSenderBindingForTest,
} from '../../../routing-contracts/capabilities/content-action/test-support';

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

const CONTENT_URL = 'https://example.test/page';

function contentSender(tabId: number): chrome.runtime.MessageSender {
  return {
    documentId: `document-${tabId}`,
    frameId: 0,
    tab: { id: tabId } as chrome.tabs.Tab,
    url: CONTENT_URL,
  };
}

function issueRecordingContentIntent(tabId: number) {
  const proofRequest = {
    actionType: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
    requestId: `recording-request-${tabId}`,
    runtimeToken: issueContentActionRuntimeTokenForTest(contentSender(tabId), {
      actionType: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
      requestId: `recording-request-${tabId}`,
    }),
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF,
  };
  const proofResponse = vi.fn();
  routeContentPrivilegedActionProofRequest(
    proofRequest,
    contentSender(tabId),
    proofResponse,
    resolveContentSenderBindingForTest(contentSender(tabId))
  );
  const proof = (proofResponse.mock.calls[0]?.[0] as { trustedEventProof?: { proofToken: string } })
    .trustedEventProof;
  if (!proof) {
    throw new Error('Expected recording trusted-event proof');
  }

  const request = {
    actionType: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
    requestId: `recording-request-${tabId}`,
    source: { kind: 'trusted-content-event-proof' as const, proofToken: proof.proofToken },
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
  };
  const sendResponse = vi.fn();
  routeContentPrivilegedActionCapabilityRequest(
    request,
    contentSender(tabId),
    sendResponse,
    resolveContentSenderBindingForTest(contentSender(tabId))
  );
  const response = sendResponse.mock.calls[0]?.[0] as {
    contentIntent?: { requestId: string; token: string };
  };
  if (!response.contentIntent) {
    throw new Error('Expected content intent');
  }
  return response.contentIntent;
}

beforeEach(() => {
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'capability-token-1') });
  resetContentPrivilegedActionCapabilitiesForTests();
  resetGalleryImageUpdateCapabilitiesForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetContentPrivilegedActionCapabilitiesForTests();
  resetGalleryImageUpdateCapabilitiesForTests();
});

it('marks content action routes with the authorized content sender binding', () => {
  const message = {
    base64: 'dmlkZW8=',
    chunkIndex: 0,
    contentIntent: issueRecordingContentIntent(7),
    recordingSessionId: 'recording-session-1',
    stagedRecordingId: 'staged-recording-1',
    totalBytes: 5,
    totalChunks: 1,
    type: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
  } satisfies RouteCaptureMessage;

  expect(
    authorizePrivilegedTabRoute({
      family: 'capture',
      kind: 'privileged-tab-route',
      message,
      resolvedTabId: 7,
      sender: contentSender(7),
    })
  ).toEqual({ authorized: true });
  expect(getPreauthorizedContentActionRouteMessage(message)).toEqual({
    documentId: 'document-7',
    frameId: 0,
    senderUrl: CONTENT_URL,
    tabId: 7,
  });
});

it('rejects content action routes with missing capabilities or unauthorized senders', () => {
  const message = {
    base64: 'dmlkZW8=',
    chunkIndex: 0,
    recordingSessionId: 'recording-session-1',
    stagedRecordingId: 'staged-recording-1',
    totalBytes: 5,
    totalChunks: 1,
    type: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
  } satisfies RouteCaptureMessage;

  expect(
    authorizePrivilegedTabRoute({
      family: 'capture',
      kind: 'privileged-tab-route',
      message,
      resolvedTabId: 7,
      sender: contentSender(7),
    })
  ).toEqual({ authorized: false, reason: 'Unauthorized content action capability' });
  expect(
    authorizePrivilegedTabRoute({
      family: 'capture',
      kind: 'privileged-tab-route',
      message,
      resolvedTabId: 7,
      sender: { ...contentSender(7), frameId: 1 },
    })
  ).toEqual({ authorized: false, reason: 'Unauthorized capture route sender' });
});

it('keeps HAR and gallery capability routes behind their route-specific capabilities', () => {
  const harStartMessage = {
    capabilityToken: 'missing-token',
    sessionId: 'har-session-1',
    type: MessageType.EXPORT_START_HAR,
  } satisfies RouteCaptureMessage;
  const harStopMessage = {
    capabilityToken: 'missing-token',
    sessionId: 'har-session-1',
    type: MessageType.EXPORT_STOP_HAR,
  } satisfies RouteCaptureMessage;
  const galleryMessage = {
    assetId: 'asset-1',
    dataUrl: 'data:image/png;base64,1',
    editorSessionId: 'editor-session-1',
    type: MessageType.UPDATE_GALLERY_IMAGE_ASSET,
    updateCapabilityToken: 'missing-token',
  } satisfies RouteCaptureMessage;

  expect(
    authorizePrivilegedTabRoute({
      family: 'capture',
      kind: 'privileged-tab-route',
      message: harStartMessage,
      resolvedTabId: 7,
      sender: contentSender(7),
    })
  ).toEqual({
    authorized: false,
    reason: 'HAR session "har-session-1" rejected an invalid start capability token.',
  });
  expect(
    authorizePrivilegedTabRoute({
      family: 'capture',
      kind: 'privileged-tab-route',
      message: harStopMessage,
      resolvedTabId: 7,
      sender: contentSender(7),
    })
  ).toEqual({ authorized: false, reason: 'Unauthorized HAR capability' });
  expect(
    authorizePrivilegedTabRoute({
      family: 'capture',
      kind: 'privileged-tab-route',
      message: galleryMessage,
      resolvedTabId: 7,
      sender: contentSender(7),
    })
  ).toEqual({ authorized: false, reason: 'Unauthorized gallery image update' });
});

it('marks valid HAR start preauthorization before route dispatch', () => {
  const token = issueExportHarStartCapability({
    rawDiagnosticsEnabled: true,
    senderUrl: CONTENT_URL,
    sessionId: 'har-session-1',
    tabId: 7,
  });
  const message = {
    capabilityToken: token,
    sessionId: 'har-session-1',
    type: MessageType.EXPORT_START_HAR,
  } satisfies RouteCaptureMessage;

  expect(
    authorizePrivilegedTabRoute({
      family: 'capture',
      kind: 'privileged-tab-route',
      message,
      resolvedTabId: 7,
      sender: contentSender(7),
    })
  ).toEqual({ authorized: true });
});
