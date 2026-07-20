import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  issueGalleryImageUpdateCapability,
  resetGalleryImageUpdateCapabilitiesForTests,
} from '../../../capture/routing/gallery-update-capabilities';
import { createExportHarSession } from '../../../diagnostics/export-har-collector/session-factory';
import {
  clearExportHarSession,
  registerExportHarSession,
} from '../../../diagnostics/export-har-collector/session-state';
import { issueExportHarStartCapability } from '../../../diagnostics/export-har-collector/start-capability';
import {
  getPreauthorizedHarStartRouteMessage,
  hasPreauthorizedHarStartRouteMessage,
  hasPreauthorizedHarStopRouteMessage,
} from '../../../diagnostics/export-har-collector/authorization/preauthorization';
import { hasPreauthorizedGalleryUpdateRouteMessage } from '../../../capture/routing/authorization/gallery-update';
import { authorizeIPCMessage } from './index';

const CONTENT_URL = 'https://example.test/page';
const EDITOR_URL =
  'chrome-extension://test/apps/extension/src/editor/index.html?assetId=asset-1&session=s-1';

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
  },
}));

function sender(props: {
  documentId?: string;
  frameId?: number;
  tabId?: number;
  url?: string;
}): chrome.runtime.MessageSender {
  return {
    ...(props.documentId === undefined ? {} : { documentId: props.documentId }),
    ...(props.frameId === undefined ? {} : { frameId: props.frameId }),
    ...(props.tabId === undefined ? {} : { tab: { id: props.tabId } as chrome.tabs.Tab }),
    ...(props.url === undefined ? {} : { url: props.url }),
  };
}

function contentSender(tabId: number): chrome.runtime.MessageSender {
  return sender({
    documentId: `document-${tabId}`,
    frameId: 0,
    tabId,
    url: CONTENT_URL,
  });
}

beforeEach(() => {
  resetGalleryImageUpdateCapabilitiesForTests();
  vi.stubGlobal('crypto', { randomUUID: () => 'token-1' });
});

afterEach(() => {
  clearExportHarSession('har-stop-1');
  resetGalleryImageUpdateCapabilitiesForTests();
  vi.unstubAllGlobals();
});

it('preauthorizes HAR start capabilities at the capture route facade', () => {
  const harSender = contentSender(7);
  const startMessage = {
    capabilityToken: issueExportHarStartCapability({
      senderUrl: harSender.url,
      sessionId: 'har-start-1',
      tabId: 7,
    }),
    sessionId: 'har-start-1',
    type: MessageType.EXPORT_START_HAR,
  };

  expect(
    authorizeIPCMessage({
      family: 'capture',
      kind: 'privileged-tab-route',
      message: startMessage,
      resolvedTabId: 7,
      sender: harSender,
    })
  ).toEqual({ authorized: true });
  expect(hasPreauthorizedHarStartRouteMessage(startMessage)).toBe(true);
  expect(getPreauthorizedHarStartRouteMessage(startMessage)).toBeDefined();
  expect(
    authorizeIPCMessage({
      family: 'capture',
      kind: 'privileged-tab-route',
      message: startMessage,
      resolvedTabId: 7,
      sender: harSender,
    })
  ).toEqual({
    authorized: false,
    reason: 'HAR session "har-start-1" rejected an invalid start capability token.',
  });
});

it('preauthorizes HAR stop capabilities at the capture route facade', () => {
  const harSender = contentSender(7);
  const session = createExportHarSession({
    browserName: 'Chrome',
    browserVersion: '1',
    pageUrl: CONTENT_URL,
    rawDiagnosticsEnabled: false,
    sessionId: 'har-stop-1',
    tabId: 7,
  });
  registerExportHarSession(session);
  const stopMessage = {
    capabilityToken: session.capabilityToken,
    sessionId: 'har-stop-1',
    type: MessageType.EXPORT_STOP_HAR,
  };

  expect(
    authorizeIPCMessage({
      family: 'capture',
      kind: 'privileged-tab-route',
      message: stopMessage,
      resolvedTabId: 7,
      sender: harSender,
    })
  ).toEqual({ authorized: true });
  expect(hasPreauthorizedHarStopRouteMessage(stopMessage)).toBe(true);
});

it('preauthorizes gallery image updates through one-shot document-bound capabilities', () => {
  const gallerySender = sender({ documentId: 'editor-doc-1', url: EDITOR_URL });
  const message = {
    assetId: 'asset-1',
    dataUrl: 'data:image/png;base64,2',
    editorSessionId: 's-1',
    updateCapabilityToken: issueGalleryImageUpdateCapability({
      assetId: 'asset-1',
      documentId: 'editor-doc-1',
      editorSessionId: 's-1',
      senderUrl: EDITOR_URL,
    }),
    type: MessageType.UPDATE_GALLERY_IMAGE_ASSET,
  };

  expect(
    authorizeIPCMessage({
      family: 'capture',
      kind: 'privileged-tab-route',
      message,
      resolvedTabId: 7,
      sender: gallerySender,
    })
  ).toEqual({ authorized: true });
  expect(hasPreauthorizedGalleryUpdateRouteMessage(message)).toBe(true);
  expect(
    authorizeIPCMessage({
      family: 'capture',
      kind: 'privileged-tab-route',
      message,
      resolvedTabId: 7,
      sender: gallerySender,
    })
  ).toEqual({ authorized: false, reason: 'Unauthorized gallery image update' });
});
