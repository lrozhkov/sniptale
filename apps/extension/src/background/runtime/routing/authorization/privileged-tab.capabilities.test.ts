import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { RouteCaptureMessage } from '../../../capture/routing';

const capabilityMocks = vi.hoisted(() => ({
  consumeExportHarStartCapability: vi.fn(),
  consumeGalleryImageUpdateCapability: vi.fn(),
  getUnauthorizedPrivilegedTabRouteSenderReason: vi.fn(),
  isExportHarStopCapabilityAuthorized: vi.fn(),
}));

vi.mock('../../../capture/routing/gallery-update-capabilities', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../capture/routing/gallery-update-capabilities')
  >()),
  consumeGalleryImageUpdateCapability: capabilityMocks.consumeGalleryImageUpdateCapability,
}));
vi.mock('../../../diagnostics/export-har-collector/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../diagnostics/export-har-collector/session')>()),
  isExportHarStopCapabilityAuthorized: capabilityMocks.isExportHarStopCapabilityAuthorized,
}));
vi.mock('../../../diagnostics/export-har-collector/start-capability', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../diagnostics/export-har-collector/start-capability')
  >()),
  consumeExportHarStartCapability: capabilityMocks.consumeExportHarStartCapability,
}));
vi.mock('../boundary/sender-policy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../boundary/sender-policy')>()),
  getUnauthorizedPrivilegedTabRouteSenderReason:
    capabilityMocks.getUnauthorizedPrivilegedTabRouteSenderReason,
}));

import {
  getPreauthorizedHarStartRouteMessage,
  hasPreauthorizedHarStopRouteMessage,
} from '../../../diagnostics/export-har-collector/authorization/preauthorization';
import { hasPreauthorizedGalleryUpdateRouteMessage } from '../../../capture/routing/authorization/gallery-update';
import { authorizePrivilegedTabRoute } from './privileged-tab';
import type { ExportHarStartPreauthorization } from '../../../diagnostics/export-har-collector/start-capability';

function contentSender(): chrome.runtime.MessageSender {
  return {
    documentId: 'content-document-1',
    frameId: 0,
    tab: { id: 7 } as chrome.tabs.Tab,
    url: 'https://example.test/page',
  };
}

function authorizeCaptureMessage(message: RouteCaptureMessage) {
  return authorizePrivilegedTabRoute({
    family: 'capture',
    kind: 'privileged-tab-route',
    message,
    resolvedTabId: 7,
    sender: contentSender(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  capabilityMocks.getUnauthorizedPrivilegedTabRouteSenderReason.mockReturnValue(null);
});

it('authorizes HAR start capabilities and records preauthorization', () => {
  const preauthorization = {} as ExportHarStartPreauthorization;
  const message = {
    capabilityToken: 'har-token-1',
    sessionId: 'har-session-1',
    type: MessageType.EXPORT_START_HAR,
  } satisfies RouteCaptureMessage;
  capabilityMocks.consumeExportHarStartCapability.mockReturnValueOnce(preauthorization);

  expect(authorizeCaptureMessage(message)).toEqual({ authorized: true });
  expect(capabilityMocks.consumeExportHarStartCapability).toHaveBeenCalledWith({
    capabilityToken: 'har-token-1',
    senderUrl: 'https://example.test/page',
    sessionId: 'har-session-1',
    tabId: 7,
  });
  expect(getPreauthorizedHarStartRouteMessage(message)).toBe(preauthorization);
});

it('rejects invalid HAR start requests before marking preauthorization', () => {
  expect(authorizeCaptureMessage({ type: MessageType.EXPORT_START_HAR })).toEqual({
    authorized: false,
    reason: 'Missing HAR session id',
  });
  expect(
    authorizeCaptureMessage({ sessionId: 'har-session-1', type: MessageType.EXPORT_START_HAR })
  ).toEqual({
    authorized: false,
    reason: 'Missing HAR start capability token',
  });

  capabilityMocks.consumeExportHarStartCapability.mockImplementationOnce(() => {
    throw new Error('invalid start token');
  });
  expect(
    authorizeCaptureMessage({
      capabilityToken: 'har-token-1',
      sessionId: 'har-session-1',
      type: MessageType.EXPORT_START_HAR,
    })
  ).toEqual({ authorized: false, reason: 'invalid start token' });
});

it('authorizes and rejects HAR stop capabilities', () => {
  const message = {
    capabilityToken: 'har-token-1',
    sessionId: 'har-session-1',
    type: MessageType.EXPORT_STOP_HAR,
  } satisfies RouteCaptureMessage;
  capabilityMocks.isExportHarStopCapabilityAuthorized.mockReturnValueOnce(true);

  expect(authorizeCaptureMessage(message)).toEqual({ authorized: true });
  expect(hasPreauthorizedHarStopRouteMessage(message)).toBe(true);

  capabilityMocks.isExportHarStopCapabilityAuthorized.mockReturnValueOnce(false);
  expect(authorizeCaptureMessage({ ...message })).toEqual({
    authorized: false,
    reason: 'Unauthorized HAR capability',
  });
});

it('authorizes gallery update capabilities and rejects missing sender bindings', () => {
  const message = {
    assetId: 'asset-1',
    dataUrl: 'data:image/png;base64,1',
    editorSessionId: 'editor-session-1',
    type: MessageType.UPDATE_GALLERY_IMAGE_ASSET,
    updateCapabilityToken: 'gallery-token-1',
  } satisfies RouteCaptureMessage;
  capabilityMocks.consumeGalleryImageUpdateCapability.mockReturnValueOnce(true);

  expect(authorizeCaptureMessage(message)).toEqual({ authorized: true });
  expect(hasPreauthorizedGalleryUpdateRouteMessage(message)).toBe(true);

  capabilityMocks.consumeGalleryImageUpdateCapability.mockReturnValueOnce(false);
  expect(
    authorizePrivilegedTabRoute({
      family: 'capture',
      kind: 'privileged-tab-route',
      message: { ...message },
      resolvedTabId: 7,
      sender: createSenderWithoutDocumentId(),
    })
  ).toEqual({ authorized: false, reason: 'Unauthorized gallery image update' });
});

function createSenderWithoutDocumentId(): chrome.runtime.MessageSender {
  const { documentId: _documentId, ...sender } = contentSender();
  return sender;
}
