import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { RouteCaptureMessage } from '../../../capture/routing';
import { authorizeIPCMessage } from './index';
import {
  resetContentPrivilegedActionCapabilitiesForTests,
  routeContentPrivilegedActionProofRequest,
  routeContentPrivilegedActionCapabilityRequest,
} from '../../../routing-contracts/capabilities/content-action/route';
import {
  issueContentActionRuntimeTokenForTest,
  resolveContentSenderBindingForTest,
} from '../../../routing-contracts/capabilities/content-action/test-support';
import type { ContentPrivilegedActionType } from '@sniptale/runtime-contracts/protocol/content-privileged-action';

const CONTENT_URL = 'https://example.test/page';

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

function issueContentIntent(tabId: number, actionType: ContentPrivilegedActionType) {
  const proofRequest = {
    actionType,
    requestId: `${actionType}-request-${tabId}`,
    runtimeToken: issueContentActionRuntimeTokenForTest(contentSender(tabId), {
      actionType,
      requestId: `${actionType}-request-${tabId}`,
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
    throw new Error('Expected trusted-event proof');
  }

  const request = {
    actionType,
    requestId: `${actionType}-request-${tabId}`,
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

function stagedRecordingMessage(tabId: number): RouteCaptureMessage {
  return {
    base64: 'dmlkZW8=',
    chunkIndex: 0,
    contentIntent: issueContentIntent(tabId, MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK),
    recordingSessionId: 'recording-session-1',
    stagedRecordingId: 'staged-recording-1',
    totalBytes: 5,
    totalChunks: 1,
    type: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
  };
}

beforeEach(() => {
  resetContentPrivilegedActionCapabilitiesForTests();
});

afterEach(() => {
  resetContentPrivilegedActionCapabilitiesForTests();
});

it('requires one-shot content capabilities for staged recording download routes', () => {
  const message = stagedRecordingMessage(7);

  expect(
    authorizeIPCMessage({
      family: 'capture',
      kind: 'privileged-tab-route',
      message,
      resolvedTabId: 7,
      sender: contentSender(7),
    })
  ).toEqual({ authorized: true });

  expect(
    authorizeIPCMessage({
      family: 'capture',
      kind: 'privileged-tab-route',
      message,
      resolvedTabId: 7,
      sender: contentSender(7),
    })
  ).toEqual({ authorized: false, reason: 'Unauthorized content action capability' });

  expect(
    authorizeIPCMessage({
      family: 'capture',
      kind: 'privileged-tab-route',
      message: createSaveMessage(),
      resolvedTabId: 7,
      sender: contentSender(7),
    })
  ).toEqual({ authorized: false, reason: 'Unauthorized content action capability' });

  expect(
    authorizeIPCMessage({
      family: 'capture',
      kind: 'privileged-tab-route',
      message: createReleaseMessage(),
      resolvedTabId: 7,
      sender: sender({ documentId: 'other-document', frameId: 0, tabId: 7, url: CONTENT_URL }),
    })
  ).toEqual({ authorized: false, reason: 'Unauthorized content action capability' });
});

function createSaveMessage(): RouteCaptureMessage {
  return {
    filename: 'clip.webm',
    mimeType: 'video/webm',
    recordingSessionId: 'recording-session-1',
    stagedRecordingId: 'staged-recording-1',
    type: MessageType.SAVE_RECORDING_FOR_DOWNLOAD,
  };
}

function createReleaseMessage(): RouteCaptureMessage {
  return {
    contentIntent: issueContentIntent(7, MessageType.RELEASE_RECORDING_DOWNLOAD),
    recordingSessionId: 'recording-session-1',
    stagedRecordingId: 'staged-recording-1',
    type: MessageType.RELEASE_RECORDING_DOWNLOAD,
  };
}
